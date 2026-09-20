import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { historicoStatusPedido, pedidos } from "@jaa/banco/schema";
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

// Leva o pedido até o status desejado, um passo por vez (como a empresa faria na tela).
// Ao chegar em "pronto", atribui o entregador: sem ele o servidor recusa a saída para entrega.
async function levarAte(pedido: Pedido, alvo: StatusPedido): Promise<Pedido> {
  let atual = pedido;
  while (atual.status !== alvo) {
    if (atual.status === "pronto") {
      assert.equal((await ctx.api(A, "POST", `/empresas/${pizzaria.id}/pedidos/${atual.id}/entrega`, { entregadorId })).statusCode, 200);
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
    assert.equal(linha?.formaPagamentoNaEntrega, "dinheiro");
    assert.equal(linha?.trocoParaCentavos, 10000);
    assert.equal(linha?.status, "recebido");
    // Nada de conta, operador ou empresaId interno na linha da lista.
    assert.deepEqual(Object.keys(linha ?? {}).sort(), ["cliente", "conversaId", "criadoEm", "formaPagamentoNaEntrega", "id", "numero", "quantidadeItens", "status", "totalCentavos", "trocoParaCentavos"]);
  });

  it("filtra por status e pagina com cursor determinístico", async () => {
    const pedido = await criarPedido();
    await levarAte(pedido, "confirmado");

    const confirmados: ListaPedidosEmpresa = (await ctx.api(A, "GET", `/empresas/${pizzaria.id}/pedidos?filtro=confirmados`)).json();
    assert.deepEqual(confirmados.pedidos.map((item) => item.status), confirmados.pedidos.map(() => "confirmado"));
    assert.ok(confirmados.pedidos.some((item) => item.id === pedido.id));

    const recebidos: ListaPedidosEmpresa = (await ctx.api(A, "GET", `/empresas/${pizzaria.id}/pedidos?filtro=recebidos`)).json();
    assert.equal(recebidos.pedidos.some((item) => item.id === pedido.id), false);

    const primeira: ListaPedidosEmpresa = (await ctx.api(A, "GET", `/empresas/${pizzaria.id}/pedidos?limite=1`)).json();
    assert.equal(primeira.pedidos.length, 1);
    assert.equal(primeira.proximoCursor, primeira.pedidos[0]?.id);
    const segunda: ListaPedidosEmpresa = (await ctx.api(A, "GET", `/empresas/${pizzaria.id}/pedidos?limite=1&antesDe=${primeira.proximoCursor}`)).json();
    assert.equal(segunda.pedidos.length, 1);
    assert.notEqual(segunda.pedidos[0]?.id, primeira.pedidos[0]?.id);
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

    const confirmado = await levarAte(pedido, "confirmado");
    // Regressão: pedir para avançar a partir de um status já superado.
    assert.equal((await avancar(A, pizzaria, confirmado.id, "recebido")).statusCode, 409);
    // Status que não existe no domínio.
    assert.equal((await ctx.api(A, "POST", `/empresas/${pizzaria.id}/pedidos/${pedido.id}/avancar`, { statusAtual: "entregando" })).statusCode, 400);
    // Corpo sem o status atual: nada de avançar "no escuro".
    assert.equal((await ctx.api(A, "POST", `/empresas/${pizzaria.id}/pedidos/${pedido.id}/avancar`, {})).statusCode, 400);

    const atual = await ctx.api(A, "GET", `/empresas/${pizzaria.id}/pedidos/${pedido.id}`);
    assert.equal(atual.json().status, "confirmado");
    assert.deepEqual(atual.json().historico.map((evento: { status: string }) => evento.status), ["recebido", "confirmado"]);
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
    assert.deepEqual(cancelado.historico.map((evento) => evento.status), ["recebido", "confirmado", "em_preparacao", "cancelado"]);
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
    assert.equal(evento?.pedido.status, "confirmado");
    assert.equal(evento?.conversaId, conversaBP);
    assert.equal(evento?.motivoCancelamento, null);
    // O resumo do card vem completo: o cliente troca o card sem recarregar o histórico.
    assert.equal(evento?.pedido.totalCentavos, 3990);
    assert.equal(evento?.pedido.formaPagamentoNaEntrega, "dinheiro");
    assert.equal(evento?.pedido.trocoParaCentavos, 10000);
    // Mudar status não cria mensagem: nada de mensagem nova nem de não lida artificial.
    assert.equal(mensagensNovas.length, 0);
    assert.equal(doTerceiro.length, 0, "quem não é do pedido não recebe nada");

    const cancelamento = await cancelar(A, pizzaria, pedido.id, "confirmado", "Loja impossibilitada de atender");
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
    const dinheiro = await levarAte(await criarPedido(), "em_rota");
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
