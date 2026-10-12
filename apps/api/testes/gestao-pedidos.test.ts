import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { historicoStatusPedido, membrosEmpresa, pedidos } from "@jaa/banco/schema";
import {
  EVENTO_MENSAGEM_NOVA,
  EVENTO_PEDIDO_STATUS_ATUALIZADO,
  FLUXO_STATUS_PEDIDO,
  type Empresa,
  type EventoPedidoStatusAtualizado,
  type ListaPedidosEmpresa,
  type Pedido,
  type Produto,
  type StatusPedido,
} from "@jaa/contratos";
import { asc, eq } from "drizzle-orm";
import { aguardarAte, coletar, como, criarAmbienteIntegracao, type Pessoa } from "./apoio/integracao.js";
import { listarPedidosDaEmpresaAutorizado } from "../src/features/pedidos/casos-de-uso/gerir-pedidos-empresa.js";

/*
 * Integração REAL da GESTÃO DO PEDIDO pela empresa: máquina de estados, cancelamento com motivo,
 * histórico append-only, auditoria do operador, concorrência, isolamento multiempresa e realtime.
 * A = dona da Pizzaria BH (e da Farmácia); B = cliente; C = terceiro sem relação com o pedido.
 */

const PREFIXO = `ges${randomUUID().slice(0, 4)}`;
const ctx = criarAmbienteIntegracao({
  telefones: ["+5531987651701", "+5531987651702", "+5531987651703", "+5531987651704"],
  prefixoIp: "198.18.12.",
});

let A: Pessoa;
let B: Pessoa;
let C: Pessoa;
let D: Pessoa;
let entregadorId = "";
let pizzaria: Empresa;
let farmacia: Empresa;
let comoPizzaria: Pessoa;
let pizza: Produto;
let conversaBP = "";
let enderecoB = "";

const avancar = (pessoa: Pessoa, empresa: Empresa, pedidoId: string, statusAtual: StatusPedido) =>
  ctx.api(pessoa, "POST", `/empresas/${empresa.id}/pedidos/${pedidoId}/avancar`, { statusAtual });
const cancelar = (pessoa: Pessoa, empresa: Empresa, pedidoId: string, statusAtual: StatusPedido, motivo: string) =>
  ctx.api(pessoa, "POST", `/empresas/${empresa.id}/pedidos/${pedidoId}/cancelar`, { statusAtual, motivo });

async function criarPedido(quantidade = 1): Promise<Pedido> {
  const resposta = await ctx.api(B, "POST", "/pedidos", {
    idCliente: randomUUID(),
    empresaIdentidadeId: pizzaria.identidadeId,
    conversaId: conversaBP,
    enderecoId: enderecoB,
    itens: [{ produtoId: pizza.id, quantidade }],
    pagamento: { forma: "dinheiro", trocoParaCentavos: 10000 },
  });
  assert.equal(resposta.statusCode, 201, resposta.body);
  return resposta.json();
}

// Leva o pedido até o status desejado. De PRONTO para a rua, usa uma saída planejada e liberada.
async function levarAte(pedido: Pedido, alvo: StatusPedido): Promise<Pedido> {
  let atual = pedido;
  while (atual.status !== alvo) {
    if (atual.status === "pronto") {
      const criada = await ctx.api(A, "POST", `/empresas/${pizzaria.id}/saidas`, { entregadorId, pedidoIds: [atual.id] });
      assert.equal(criada.statusCode, 201, criada.body);
      const saidaId = criada.json().id as string;
      assert.equal((await ctx.api(A, "POST", `/empresas/${pizzaria.id}/saidas/${saidaId}/liberar`)).statusCode, 200);
      const iniciada = await ctx.api(D, "POST", `/entregas/saidas/${saidaId}/iniciar`);
      assert.equal(iniciada.statusCode, 200, iniciada.body);
      atual = (await ctx.api(A, "GET", `/empresas/${pizzaria.id}/pedidos/${atual.id}`)).json();
      continue;
    }
    const resposta = await avancar(A, pizzaria, atual.id, atual.status);
    assert.equal(resposta.statusCode, 200, resposta.body);
    atual = resposta.json();
  }
  return atual;
}

before(async () => {
  await ctx.iniciar();
  A = await ctx.criarPessoa(0, `${PREFIXO}_a`, "Junior Rocha");
  B = await ctx.criarPessoa(1, `${PREFIXO}_b`, "Bruna Cliente");
  C = await ctx.criarPessoa(2, `${PREFIXO}_c`, "Carlos Terceiro");
  D = await ctx.criarPessoa(3, `${PREFIXO}_d`, "Paulo Entregador");
  pizzaria = (await ctx.api(A, "POST", "/empresas", { nome: "Pizzaria BH", nomeUsuario: `${PREFIXO}_pizza`, slug: `${PREFIXO}-pizzaria` })).json();
  farmacia = (await ctx.api(A, "POST", "/empresas", { nome: "Farmácia Central", nomeUsuario: `${PREFIXO}_farma`, slug: `${PREFIXO}-farmacia` })).json();
  comoPizzaria = como(A, pizzaria.identidadeId);
  pizza = (await ctx.api(A, "POST", `/empresas/${pizzaria.id}/produtos`, { nome: "Pizza Calabresa", precoCentavos: 3990 })).json();
  conversaBP = await ctx.abrirConversa(B, `${PREFIXO}_pizza`);
  enderecoB = await ctx.criarEnderecoConfirmado(B);
  // Desde a etapa de entregadores, "Saiu para entrega" exige alguém levando o pedido.
  entregadorId = await ctx.criarEntregadorAtivo(A, pizzaria.id, D, `${PREFIXO}_d`);
});

after(() => ctx.encerrar());

describe("histórico e criação", () => {
  it("todo pedido nasce com o evento 'recebido' no histórico, sem operador (quem criou foi o cliente)", async () => {
    const pedido = await criarPedido();

    assert.equal(pedido.status, "recebido");
    assert.equal(pedido.motivoCancelamento, null);
    assert.deepEqual(pedido.historico.map((evento) => evento.status), ["recebido"]);
    assert.equal(pedido.historico[0]?.motivo, null);

    const gravado = await ctx.banco.select().from(historicoStatusPedido).where(eq(historicoStatusPedido.pedidoId, pedido.id));
    assert.equal(gravado.length, 1);
    assert.equal(gravado[0]?.operadorUsuarioId, null);
  });
});

describe("lista de pedidos da empresa", () => {
  it("lista os pedidos da empresa, mais recentes primeiro, com cliente, itens, total e pagamento", async () => {
    const antigo = await criarPedido(1);
    const recente = await criarPedido(2);

    const resposta = await ctx.api(A, "GET", `/empresas/${pizzaria.id}/pedidos?limite=50`);
    assert.equal(resposta.statusCode, 200, resposta.body);
    const lista: ListaPedidosEmpresa = resposta.json();

    const ids = lista.pedidos.map((item) => item.id);
    assert.ok(ids.indexOf(recente.id) < ids.indexOf(antigo.id), "mais recente primeiro");
    const linha = lista.pedidos.find((item) => item.id === recente.id);
    assert.equal(linha?.cliente.nomeExibicao, "Bruna Cliente");
    assert.equal(linha?.numero, recente.numero);
    assert.equal(linha?.quantidadeItens, 1);
    assert.equal(linha?.totalCentavos, 7980);
    // Empresa sem zonas: sem frete e sem zona (o valor vem do snapshot do pedido).
    assert.deepEqual([linha?.subtotalCentavos, linha?.freteFinalCentavos, linha?.zonaEntregaNome], [7980, 0, null]);
    assert.equal(linha?.formaPagamentoNaEntrega, "dinheiro");
    assert.equal(linha?.trocoParaCentavos, 10000);
    assert.equal(linha?.status, "recebido");
    // Nada de conta, operador ou empresaId interno na linha da lista.
    assert.deepEqual(Object.keys(linha ?? {}).sort(), [
      "cliente",
      "conversaId",
      "criadoEm",
      "formaPagamentoNaEntrega",
      "freteFinalCentavos",
      "id",
      "numero",
      "quantidadeItens",
      "status",
      "subtotalCentavos",
      "totalCentavos",
      "trocoParaCentavos",
      "zonaEntregaNome",
    ]);
  });

  it("filtra por status e pagina com cursor determinístico", async () => {
    const pedido = await criarPedido();
    await levarAte(pedido, "em_preparacao");

    const emPreparacao: ListaPedidosEmpresa = (await ctx.api(A, "GET", `/empresas/${pizzaria.id}/pedidos?filtro=em_preparacao`)).json();
    assert.deepEqual(emPreparacao.pedidos.map((item) => item.status), emPreparacao.pedidos.map(() => "em_preparacao"));
    assert.ok(emPreparacao.pedidos.some((item) => item.id === pedido.id));

    const recebidos: ListaPedidosEmpresa = (await ctx.api(A, "GET", `/empresas/${pizzaria.id}/pedidos?filtro=recebidos`)).json();
    assert.equal(recebidos.pedidos.some((item) => item.id === pedido.id), false);

    const primeira: ListaPedidosEmpresa = (await ctx.api(A, "GET", `/empresas/${pizzaria.id}/pedidos?limite=1`)).json();
    assert.equal(primeira.pedidos.length, 1);
    assert.equal(primeira.proximoCursor, primeira.pedidos[0]?.id);
    const segunda: ListaPedidosEmpresa = (await ctx.api(A, "GET", `/empresas/${pizzaria.id}/pedidos?limite=1&antesDe=${primeira.proximoCursor}`)).json();
    assert.equal(segunda.pedidos.length, 1);
    assert.notEqual(segunda.pedidos[0]?.id, primeira.pedidos[0]?.id);

    // `total` é do FILTRO inteiro, igual em qualquer página — é o que sustenta "1–10 de 36".
    const todos: ListaPedidosEmpresa = (await ctx.api(A, "GET", `/empresas/${pizzaria.id}/pedidos?limite=50`)).json();
    assert.ok(todos.total >= 2 && todos.total === todos.pedidos.length);
    assert.equal(primeira.total, todos.total);
    assert.equal(segunda.total, todos.total);
    assert.equal(emPreparacao.total, emPreparacao.pedidos.length);
    assert.ok(emPreparacao.total < todos.total);
  });

  it("pedidos não vazam entre empresas: a Farmácia não vê nem abre pedido da Pizzaria", async () => {
    const pedido = await criarPedido();

    const daFarmacia: ListaPedidosEmpresa = (await ctx.api(A, "GET", `/empresas/${farmacia.id}/pedidos`)).json();
    assert.equal(daFarmacia.pedidos.length, 0);
    assert.equal((await ctx.api(A, "GET", `/empresas/${farmacia.id}/pedidos/${pedido.id}`)).statusCode, 404);
    assert.equal((await avancar(A, farmacia, pedido.id, "recebido")).statusCode, 404);
    assert.equal((await cancelar(A, farmacia, pedido.id, "recebido", "Não é meu pedido")).statusCode, 404);
    // Nada mudou na Pizzaria.
    assert.equal((await ctx.api(A, "GET", `/empresas/${pizzaria.id}/pedidos/${pedido.id}`)).json().status, "recebido");
  });
});

describe("contagens por status e filtro por período", () => {
  // Empresa PRÓPRIA deste bloco: as contagens são exatas, sem depender dos outros testes.
  let lanchonete: Empresa;
  const SOMA = (lista: ListaPedidosEmpresa) => lista.contagens.recebidos + lista.contagens.em_preparacao + lista.contagens.prontos + lista.contagens.em_entrega + lista.contagens.entregues + lista.contagens.cancelados;
  const listar = async (consulta = ""): Promise<ListaPedidosEmpresa> => {
    const resposta = await ctx.api(A, "GET", `/empresas/${lanchonete.id}/pedidos${consulta}`);
    assert.equal(resposta.statusCode, 200, resposta.body);
    return resposta.json();
  };
  // Pedido REAL da lanchonete (pela API); depois o instante de criação e o status são ajustados no
  // banco — a criação sempre usa "agora", e aqui interessa só o que a LISTA lê: `criado_em` e `status`.
  async function pedidoEm(criadoEm: string, status: StatusPedido = "recebido"): Promise<string> {
    const resposta = await ctx.api(B, "POST", "/pedidos", {
      idCliente: randomUUID(),
      empresaIdentidadeId: lanchonete.identidadeId,
      conversaId: conversaComALanchonete,
      enderecoId: enderecoB,
      itens: [{ produtoId: lanche.id, quantidade: 1 }],
      pagamento: { forma: "cartao" },
    });
    assert.equal(resposta.statusCode, 201, resposta.body);
    const pedido: Pedido = resposta.json();
    await ctx.banco
      .update(pedidos)
      .set({ criadoEm: new Date(criadoEm), status, motivoCancelamento: status === "cancelado" ? "Teste de período" : null })
      .where(eq(pedidos.id, pedido.id));
    return pedido.id;
  }

  let lanche: Produto;
  let conversaComALanchonete = "";

  before(async () => {
    const criada = await ctx.api(A, "POST", "/empresas", { nome: "Lanchonete Período", nomeUsuario: `${PREFIXO}_lanch`, slug: `${PREFIXO}-lanchonete` });
    assert.equal(criada.statusCode, 201, criada.body);
    lanchonete = criada.json();
    lanche = (await ctx.api(A, "POST", `/empresas/${lanchonete.id}/produtos`, { nome: "X-Tudo", precoCentavos: 2500 })).json();
    conversaComALanchonete = await ctx.abrirConversa(B, `${PREFIXO}_lanch`);
    // Fuso da empresa: São Paulo (UTC−3). 11/10/2026 é domingo.
    await pedidoEm("2026-10-11T03:00:00.000Z", "recebido"); // 00:00 de domingo 11 (primeiro instante do dia)
    await pedidoEm("2026-10-11T15:00:00.000Z", "em_preparacao"); // domingo 11, meio-dia
    await pedidoEm("2026-10-12T02:59:59.999Z", "pronto"); // 23:59:59,999 de domingo 11 (último instante do dia)
    await pedidoEm("2026-10-12T03:00:00.000Z", "cancelado"); // 00:00 de segunda 12 (já é outro dia e outra semana)
    await pedidoEm("2026-10-05T03:00:00.000Z", "entregue"); // segunda 05, 00:00 (primeiro instante da semana)
    await pedidoEm("2026-10-05T02:59:59.999Z", "entregue"); // domingo 04, 23:59 (semana anterior)
    await pedidoEm("2026-10-01T03:00:00.000Z", "saiu_para_entrega"); // 1º de outubro, 00:00
    await pedidoEm("2026-10-01T02:59:59.999Z", "em_rota"); // 30 de setembro, 23:59 (mês anterior)
    await pedidoEm("2026-11-01T03:00:00.000Z", "confirmado"); // 1º de novembro, 00:00 (mês seguinte)
  });

  const AGORA = () => new Date("2026-10-11T15:00:00.000Z"); // domingo 11/10, 12:00 em São Paulo
  const noRelogio = async (consulta: Parameters<typeof listarPedidosDaEmpresaAutorizado>[3]) => {
    // A conta que opera a lanchonete (o apoio dos testes não expõe o id da conta de A).
    const [dono] = await ctx.banco.select({ usuarioId: membrosEmpresa.usuarioId }).from(membrosEmpresa).where(eq(membrosEmpresa.empresaId, lanchonete.id)).limit(1);
    assert.ok(dono);
    const resultado = await listarPedidosDaEmpresaAutorizado(ctx.banco, dono.usuarioId, lanchonete.id, consulta, AGORA);
    assert.equal(resultado.tipo, "lista");
    if (resultado.tipo !== "lista") throw new Error("sem acesso");
    return resultado;
  };

  it("todo o período: conta cada filtro no banco inteiro, e Todos é a soma", async () => {
    const lista = await listar("?limite=50");
    assert.deepEqual(lista.contagens, { todos: 9, recebidos: 2, em_preparacao: 1, prontos: 1, em_entrega: 2, entregues: 2, cancelados: 1 });
    assert.equal(SOMA(lista), lista.contagens.todos);
    assert.equal(lista.total, 9);
    assert.equal(lista.pedidos.length, 9);
  });

  it("paginação e filtro de status não mudam as contagens; o total acompanha o filtro marcado", async () => {
    const esperadas = (await listar("?limite=50")).contagens;
    const primeira = await listar("?limite=2");
    assert.equal(primeira.pedidos.length, 2);
    assert.deepEqual(primeira.contagens, esperadas);
    const segunda = await listar(`?limite=2&antesDe=${primeira.proximoCursor}`);
    assert.deepEqual(segunda.contagens, esperadas);

    const entregues = await listar("?filtro=entregues&limite=1");
    assert.deepEqual(entregues.contagens, esperadas);
    assert.equal(entregues.total, 2);
    assert.equal(entregues.pedidos.length, 1);
    // "Em entrega" reúne dois status reais; "Recebidos" inclui o legado confirmado.
    assert.equal((await listar("?filtro=em_entrega")).pedidos.length, 2);
    assert.equal((await listar("?filtro=recebidos")).pedidos.length, 2);
  });

  it("Hoje: o dia inteiro no fuso da empresa, com os dois limites certos", async () => {
    const hoje = await noRelogio({ filtro: "todos", limite: 50, periodo: "hoje" });
    assert.deepEqual(hoje.contagens, { todos: 3, recebidos: 1, em_preparacao: 1, prontos: 1, em_entrega: 0, entregues: 0, cancelados: 0 });
    assert.deepEqual(hoje.pedidos.map((item) => item.status).sort(), ["em_preparacao", "pronto", "recebido"]);
    assert.equal(hoje.total, 3);
  });

  it("Esta semana (segunda a domingo) e Este mês", async () => {
    const semana = await noRelogio({ filtro: "todos", limite: 50, periodo: "semana" });
    assert.deepEqual(semana.contagens, { todos: 4, recebidos: 1, em_preparacao: 1, prontos: 1, em_entrega: 0, entregues: 1, cancelados: 0 });
    const mes = await noRelogio({ filtro: "todos", limite: 50, periodo: "mes" });
    assert.deepEqual(mes.contagens, { todos: 7, recebidos: 1, em_preparacao: 1, prontos: 1, em_entrega: 1, entregues: 2, cancelados: 1 });
    assert.equal(mes.pedidos.length, 7);
  });

  it("período + status: a lista filtra pelos dois e as contagens continuam sendo as do período", async () => {
    const entreguesDoMes = await noRelogio({ filtro: "entregues", limite: 50, periodo: "mes" });
    assert.equal(entreguesDoMes.pedidos.length, 2);
    assert.equal(entreguesDoMes.total, 2);
    assert.equal(entreguesDoMes.contagens.todos, 7);
    const entreguesDaSemana = await noRelogio({ filtro: "entregues", limite: 50, periodo: "semana" });
    assert.equal(entreguesDaSemana.pedidos.length, 1);
    const canceladosDeHoje = await noRelogio({ filtro: "cancelados", limite: 50, periodo: "hoje" });
    assert.deepEqual([canceladosDeHoje.pedidos.length, canceladosDeHoje.total, canceladosDeHoje.contagens.todos], [0, 0, 3]);
  });

  it("período + paginação: o cursor continua dentro do período", async () => {
    const primeira = await noRelogio({ filtro: "todos", limite: 2, periodo: "hoje" });
    assert.equal(primeira.pedidos.length, 2);
    const segunda = await noRelogio({ filtro: "todos", limite: 2, periodo: "hoje", antesDe: primeira.pedidos.at(-1)?.id });
    assert.equal(segunda.pedidos.length, 1);
    assert.equal(segunda.total, 3);
  });

  it("Personalizado: as duas datas entram inteiras (pela rota)", async () => {
    const umDia = await listar("?periodo=personalizado&dataInicial=2026-10-11&dataFinal=2026-10-11&limite=50");
    assert.equal(umDia.contagens.todos, 3);
    const doisDias = await listar("?periodo=personalizado&dataInicial=2026-10-11&dataFinal=2026-10-12&limite=50");
    assert.deepEqual([doisDias.contagens.todos, doisDias.contagens.cancelados], [4, 1]);
    const setembro = await listar("?periodo=personalizado&dataInicial=2026-09-01&dataFinal=2026-09-30&filtro=em_entrega");
    assert.deepEqual([setembro.contagens.todos, setembro.pedidos.length], [1, 1]);
    const vazio = await listar("?periodo=personalizado&dataInicial=2020-01-01&dataFinal=2020-01-31");
    assert.deepEqual([vazio.contagens.todos, vazio.total, vazio.pedidos.length, vazio.proximoCursor], [0, 0, 0, null]);
  });

  it("personalizado sem datas, fora de ordem ou com data inválida é recusado; período desconhecido também", async () => {
    for (const consulta of ["?periodo=personalizado", "?periodo=personalizado&dataInicial=2026-10-11", "?periodo=personalizado&dataInicial=2026-10-12&dataFinal=2026-10-11", "?periodo=personalizado&dataInicial=11/10/2026&dataFinal=2026-10-11", "?periodo=ontem"]) {
      assert.equal((await ctx.api(A, "GET", `/empresas/${lanchonete.id}/pedidos${consulta}`)).statusCode, 400, consulta);
    }
  });

  it("o período não vaza entre empresas nem abre a lista para quem não opera a empresa", async () => {
    assert.equal((await ctx.api(B, "GET", `/empresas/${lanchonete.id}/pedidos?periodo=hoje`)).statusCode, 404);
    const daFarmacia: ListaPedidosEmpresa = (await ctx.api(A, "GET", `/empresas/${farmacia.id}/pedidos?periodo=personalizado&dataInicial=2026-10-01&dataFinal=2026-10-31`)).json();
    assert.equal(daFarmacia.contagens.todos, 0);
  });
});

describe("fluxo de status", () => {
  it("avança um passo por vez até entregue, registrando cada evento com a conta que operou", async () => {
    const pedido = await criarPedido();
    const entregue = await levarAte(pedido, "entregue");

    assert.equal(entregue.status, "entregue");
    assert.deepEqual(entregue.historico.map((evento) => evento.status), [...FLUXO_STATUS_PEDIDO]);

    const gravado = await ctx.banco
      .select({ status: historicoStatusPedido.status, operador: historicoStatusPedido.operadorUsuarioId })
      .from(historicoStatusPedido)
      .where(eq(historicoStatusPedido.pedidoId, pedido.id))
      .orderBy(asc(historicoStatusPedido.id));
    // Auditoria interna: criação sem operador; cada avanço com a conta real que executou pela empresa.
    assert.equal(gravado[0]?.operador, null);
    assert.equal(gravado.slice(1).every((evento) => typeof evento.operador === "string"), true);
    // E a auditoria jamais é serializada.
    assert.equal(JSON.stringify(entregue).includes("operador"), false);
    assert.equal(JSON.stringify(entregue).includes("Junior Rocha"), false);
  });

  it("recusa salto de status, regressão e status inventado", async () => {
    const pedido = await criarPedido();

    // Salto: dizer que já está "pronto" (quando está "recebido") não avança nada.
    const salto = await avancar(A, pizzaria, pedido.id, "pronto");
    assert.equal(salto.statusCode, 409);
    assert.equal(salto.json().codigo, "TRANSICAO_PEDIDO_INVALIDA");

    const confirmado = await levarAte(pedido, "em_preparacao");
    // Regressão: pedir para avançar a partir de um status já superado.
    assert.equal((await avancar(A, pizzaria, confirmado.id, "recebido")).statusCode, 409);
    // Status que não existe no domínio.
    assert.equal((await ctx.api(A, "POST", `/empresas/${pizzaria.id}/pedidos/${pedido.id}/avancar`, { statusAtual: "entregando" })).statusCode, 400);
    // Corpo sem o status atual: nada de avançar "no escuro".
    assert.equal((await ctx.api(A, "POST", `/empresas/${pizzaria.id}/pedidos/${pedido.id}/avancar`, {})).statusCode, 400);

    const atual = await ctx.api(A, "GET", `/empresas/${pizzaria.id}/pedidos/${pedido.id}`);
    assert.equal(atual.json().status, "em_preparacao");
    assert.deepEqual(atual.json().historico.map((evento: { status: string }) => evento.status), ["recebido", "em_preparacao"]);
  });

  it("entregue é terminal: não avança e não pode ser cancelado", async () => {
    const entregue = await levarAte(await criarPedido(), "entregue");

    assert.equal((await avancar(A, pizzaria, entregue.id, "entregue")).statusCode, 409);
    assert.equal((await cancelar(A, pizzaria, entregue.id, "entregue", "Mudei de ideia")).statusCode, 409);

    const [linha] = await ctx.banco.select({ status: pedidos.status }).from(pedidos).where(eq(pedidos.id, entregue.id));
    assert.equal(linha?.status, "entregue");
  });

  it("duas operações concorrentes: uma vence e a outra é recusada, sem histórico impossível", async () => {
    const pedido = await criarPedido();

    const [primeira, segunda] = await Promise.all([avancar(A, pizzaria, pedido.id, "recebido"), avancar(A, pizzaria, pedido.id, "recebido")]);
    const statusCodes = [primeira.statusCode, segunda.statusCode].sort();
    assert.deepEqual(statusCodes, [200, 409]);

    const eventos = await ctx.banco.select().from(historicoStatusPedido).where(eq(historicoStatusPedido.pedidoId, pedido.id));
    assert.equal(eventos.length, 2, "um evento de criação e um de confirmação");
  });
});

describe("cancelamento", () => {
  it("cancela com motivo, encerra o pedido e registra tudo no histórico", async () => {
    const pedido = await levarAte(await criarPedido(), "em_preparacao");

    const resposta = await cancelar(A, pizzaria, pedido.id, "em_preparacao", "Produto indisponível");
    assert.equal(resposta.statusCode, 200, resposta.body);
    const cancelado: Pedido = resposta.json();

    assert.equal(cancelado.status, "cancelado");
    assert.equal(cancelado.motivoCancelamento, "Produto indisponível");
    assert.deepEqual(cancelado.historico.map((evento) => evento.status), ["recebido", "em_preparacao", "cancelado"]);
    assert.equal(cancelado.historico.at(-1)?.motivo, "Produto indisponível");
    // Cancelado é terminal.
    assert.equal((await avancar(A, pizzaria, cancelado.id, "cancelado")).statusCode, 409);
    assert.equal((await cancelar(A, pizzaria, cancelado.id, "cancelado", "De novo")).statusCode, 409);
  });

  it("motivo é obrigatório e curto", async () => {
    const pedido = await criarPedido();

    assert.equal((await ctx.api(A, "POST", `/empresas/${pizzaria.id}/pedidos/${pedido.id}/cancelar`, { statusAtual: "recebido" })).statusCode, 400);
    assert.equal((await cancelar(A, pizzaria, pedido.id, "recebido", "  ")).statusCode, 400);
    assert.equal((await cancelar(A, pizzaria, pedido.id, "recebido", "x".repeat(201))).statusCode, 400);
    assert.equal((await ctx.api(A, "GET", `/empresas/${pizzaria.id}/pedidos/${pedido.id}`)).json().status, "recebido");
  });
});

describe("segurança", () => {
  it("o cliente acompanha, mas não altera status — nem manipulando a requisição", async () => {
    const pedido = await criarPedido();

    // Rota da empresa com a sessão do cliente: a conta não tem vínculo com a empresa.
    assert.equal((await avancar(B, pizzaria, pedido.id, "recebido")).statusCode, 404);
    assert.equal((await cancelar(B, pizzaria, pedido.id, "recebido", "Desisti")).statusCode, 404);
    assert.equal((await ctx.api(B, "GET", `/empresas/${pizzaria.id}/pedidos`)).statusCode, 404);
    // Nem agindo como a identidade da empresa (que ela não pode operar).
    assert.equal((await avancar(como(B, pizzaria.identidadeId), pizzaria, pedido.id, "recebido")).statusCode, 404);
    // Terceiro sem nenhuma relação.
    assert.equal((await avancar(C, pizzaria, pedido.id, "recebido")).statusCode, 404);
    assert.equal((await ctx.api(C, "GET", `/pedidos/${pedido.id}`)).statusCode, 404);
    // Anônimo.
    assert.equal((await ctx.api(null, "POST", `/empresas/${pizzaria.id}/pedidos/${pedido.id}/avancar`, { statusAtual: "recebido" })).statusCode, 401);

    // O pedido segue intacto, e o cliente continua enxergando o próprio pedido e seu histórico.
    const doCliente = await ctx.api(B, "GET", `/pedidos/${pedido.id}`);
    assert.equal(doCliente.statusCode, 200);
    assert.equal(doCliente.json().status, "recebido");
    assert.deepEqual(doCliente.json().historico.map((evento: { status: string }) => evento.status), ["recebido"]);
  });

  it("pedido de outra pessoa e id inventado são 404 para a empresa e para o cliente", async () => {
    assert.equal((await ctx.api(A, "GET", `/empresas/${pizzaria.id}/pedidos/${randomUUID()}`)).statusCode, 404);
    assert.equal((await avancar(A, pizzaria, randomUUID(), "recebido")).statusCode, 404);
    assert.equal((await ctx.api(A, "GET", `/empresas/${randomUUID()}/pedidos`)).statusCode, 404);
  });
});

describe("realtime e card na conversa", () => {
  it("cliente e empresa recebem o status atualizado; ninguém mais, e sem mensagem nova", async () => {
    const pedido = await criarPedido();
    const [socketCliente, socketEmpresa, socketTerceiro] = await Promise.all([ctx.conectar(B), ctx.conectar(comoPizzaria), ctx.conectar(C)]);
    const doCliente = coletar<EventoPedidoStatusAtualizado>(socketCliente, EVENTO_PEDIDO_STATUS_ATUALIZADO);
    const daEmpresa = coletar<EventoPedidoStatusAtualizado>(socketEmpresa, EVENTO_PEDIDO_STATUS_ATUALIZADO);
    const doTerceiro = coletar<EventoPedidoStatusAtualizado>(socketTerceiro, EVENTO_PEDIDO_STATUS_ATUALIZADO);
    const mensagensNovas = coletar<unknown>(socketCliente, EVENTO_MENSAGEM_NOVA);

    assert.equal((await avancar(A, pizzaria, pedido.id, "recebido")).statusCode, 200);
    await aguardarAte(() => doCliente.length === 1 && daEmpresa.length === 1);

    const evento = doCliente[0];
    assert.equal(evento?.pedido.id, pedido.id);
    assert.equal(evento?.pedido.numero, pedido.numero);
    assert.equal(evento?.pedido.status, "em_preparacao");
    assert.equal(evento?.conversaId, conversaBP);
    assert.equal(evento?.motivoCancelamento, null);
    // O resumo do card vem completo: o cliente troca o card sem recarregar o histórico.
    assert.equal(evento?.pedido.totalCentavos, 3990);
    assert.equal(evento?.pedido.formaPagamentoNaEntrega, "dinheiro");
    assert.equal(evento?.pedido.trocoParaCentavos, 10000);
    // Mudar status não cria mensagem: nada de mensagem nova nem de não lida artificial.
    assert.equal(mensagensNovas.length, 0);
    assert.equal(doTerceiro.length, 0, "quem não é do pedido não recebe nada");

    const cancelamento = await cancelar(A, pizzaria, pedido.id, "em_preparacao", "Loja impossibilitada de atender");
    assert.equal(cancelamento.statusCode, 200);
    await aguardarAte(() => doCliente.length === 2);
    assert.equal(doCliente[1]?.pedido.status, "cancelado");
    assert.equal(doCliente[1]?.motivoCancelamento, "Loja impossibilitada de atender");
    assert.equal(mensagensNovas.length, 0);
  });

  it("o card na conversa reflete o status atual do mesmo pedido, sem mensagem adicional", async () => {
    const pedido = await criarPedido();
    const antes = await ctx.historico(B, conversaBP);
    const cardAntes = antes.mensagens.find((mensagem) => mensagem.pedido?.id === pedido.id);
    assert.equal(cardAntes?.pedido?.status, "recebido");
    assert.equal(cardAntes?.pedido?.numero, pedido.numero);

    await levarAte(pedido, "pronto");

    const depois = await ctx.historico(B, conversaBP);
    const cards = depois.mensagens.filter((mensagem) => mensagem.pedido?.id === pedido.id);
    assert.equal(cards.length, 1, "o mesmo card, nunca um card novo por mudança de status");
    assert.equal(cards[0]?.pedido?.status, "pronto");
    assert.equal(cards[0]?.id, cardAntes?.id);
    assert.equal(depois.mensagens.length, antes.mensagens.length, "nenhuma mensagem criada pela mudança de status");
  });
});

describe("pagamento preservado", () => {
  it("forma de pagamento e troco não mudam ao longo do fluxo, e cartão nunca ganha troco", async () => {
    const dinheiro = await levarAte(await criarPedido(), "saiu_para_entrega");
    assert.equal(dinheiro.formaPagamentoNaEntrega, "dinheiro");
    assert.equal(dinheiro.trocoParaCentavos, 10000);

    const comCartao: Pedido = (
      await ctx.api(B, "POST", "/pedidos", {
        idCliente: randomUUID(),
        empresaIdentidadeId: pizzaria.identidadeId,
        conversaId: conversaBP,
        enderecoId: enderecoB,
        itens: [{ produtoId: pizza.id, quantidade: 1 }],
        pagamento: { forma: "cartao" },
      })
    ).json();
    const entregue = await levarAte(comCartao, "entregue");
    assert.equal(entregue.formaPagamentoNaEntrega, "cartao");
    assert.equal(entregue.trocoParaCentavos, null);
    assert.equal(JSON.stringify(entregue).toLowerCase().includes("cvv"), false);
  });
});
