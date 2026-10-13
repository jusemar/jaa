import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { atribuicoesEntrega, entregadoresEmpresa, historicoStatusPedido, pedidos } from "@jaa/banco/schema";
import type { Empresa, HistoricoEntregas, ListaEntregas, ListaSaidas, ListaVinculosEntregador, Pedido, Produto } from "@jaa/contratos";
import { and, eq, isNull } from "drizzle-orm";
import { listarMeuHistoricoDeEntregas } from "../src/features/entregas/casos-de-uso/historico-entregas.js";
import { criarAmbienteIntegracao, type Pessoa } from "./apoio/integracao.js";

/*
 * Integração REAL do HISTÓRICO DE ENTREGAS do entregador por empresa: quem recebe o crédito (a
 * atribuição encerrada em entrega), o que fica de fora (cancelado, aberto, recusado, reatribuído,
 * desativado), período pela CONCLUSÃO no fuso da empresa, paginação por cursor, autorização e
 * isolamento entre empresas.
 * A = dona da Pizzaria (e da Lanchonete); D = dona da Padaria; P = Paulo e C = Carlos, entregadores;
 * L = Lia, entregadora da Lanchonete; B = cliente.
 */

const PREFIXO = `his${randomUUID().slice(0, 4)}`;
const ctx = criarAmbienteIntegracao({
  telefones: ["+5531987658201", "+5531987658202", "+5531987658203", "+5531987658204", "+5531987658205", "+5531987658206"],
  prefixoIp: "198.18.82.",
});

let A: Pessoa;
let D: Pessoa;
let P: Pessoa;
let C: Pessoa;
let L: Pessoa;
let B: Pessoa;
let pizzaria: Empresa;
let padaria: Empresa;
let pauloNaPizzaria = "";
let carlosNaPizzaria = "";
let pauloNaPadaria = "";
let enderecoB = "";
const produtos = new Map<string, Produto>();
const conversas = new Map<string, string>();
const donos = new Map<string, Pessoa>();

async function montarEmpresa(dona: Pessoa, nome: string, sufixo: string): Promise<Empresa> {
  const criada = await ctx.api(dona, "POST", "/empresas", { nome, nomeUsuario: `${PREFIXO}_${sufixo}`, slug: `${PREFIXO}-${sufixo}` });
  assert.equal(criada.statusCode, 201, criada.body);
  const empresa: Empresa = criada.json();
  produtos.set(empresa.id, (await ctx.api(dona, "POST", `/empresas/${empresa.id}/produtos`, { nome: "Item", precoCentavos: 2500 })).json());
  conversas.set(empresa.id, await ctx.abrirConversa(B, `${PREFIXO}_${sufixo}`));
  donos.set(empresa.id, dona);
  return empresa;
}

const dona = (empresa: Empresa) => donos.get(empresa.id) as Pessoa;

async function pedidoPronto(empresa: Empresa): Promise<Pedido> {
  const resposta = await ctx.api(B, "POST", "/pedidos", {
    idCliente: randomUUID(),
    empresaIdentidadeId: empresa.identidadeId,
    conversaId: conversas.get(empresa.id),
    enderecoId: enderecoB,
    itens: [{ produtoId: produtos.get(empresa.id)?.id, quantidade: 1 }],
    pagamento: { forma: "cartao" },
  });
  assert.equal(resposta.statusCode, 201, resposta.body);
  let pedido: Pedido = resposta.json();
  for (const statusAtual of ["recebido", "em_preparacao"] as const) {
    const avancado = await ctx.api(dona(empresa), "POST", `/empresas/${empresa.id}/pedidos/${pedido.id}/avancar`, { statusAtual });
    assert.equal(avancado.statusCode, 200, avancado.body);
    pedido = avancado.json();
  }
  return pedido;
}

// Rota de UM pedido para o entregador, já liberada para retirada.
async function rotaPara(empresa: Empresa, entregadorId: string, pedidoId: string): Promise<string> {
  const criada = await ctx.api(dona(empresa), "POST", `/empresas/${empresa.id}/saidas`, { entregadorId, pedidoIds: [pedidoId] });
  assert.equal(criada.statusCode, 201, criada.body);
  const saidaId: string = criada.json().id;
  await ctx.api(dona(empresa), "POST", `/empresas/${empresa.id}/saidas/${saidaId}/liberar`);
  return saidaId;
}

async function sairParaEntrega(entregador: Pessoa, saidaId: string) {
  const iniciada = await ctx.api(entregador, "POST", `/entregas/saidas/${saidaId}/iniciar`);
  assert.equal(iniciada.statusCode, 200, iniciada.body);
}

// A rota que contém o pedido AGORA (depois de uma troca de entregador ela é outra).
async function rotaDoPedido(entregador: Pessoa, pedidoId: string): Promise<string> {
  const lista: ListaSaidas = (await ctx.api(entregador, "GET", "/entregas/saidas")).json();
  const saida = lista.saidas.find((item) => item.paradas.some((parada) => parada.pedidoId === pedidoId && parada.encerradaEm === null));
  assert.ok(saida, "o entregador não está com este pedido");
  return saida.id;
}

async function concluirPeloEntregador(entregador: Pessoa, saidaId: string, pedidoId: string) {
  const concluida = await ctx.api(entregador, "POST", `/entregas/saidas/${saidaId}/paradas/${pedidoId}/concluir`);
  assert.equal(concluida.statusCode, 200, concluida.body);
}

// O caminho completo: pedido pronto → rota → saiu → entregue pelo próprio entregador.
async function entregar(empresa: Empresa, entregador: Pessoa, entregadorId: string): Promise<Pedido> {
  const pedido = await pedidoPronto(empresa);
  const saidaId = await rotaPara(empresa, entregadorId, pedido.id);
  await sairParaEntrega(entregador, saidaId);
  await concluirPeloEntregador(entregador, saidaId, pedido.id);
  return pedido;
}

async function historico(pessoa: Pessoa, entregadorId: string, consulta = ""): Promise<HistoricoEntregas> {
  const resposta = await ctx.api(pessoa, "GET", `/entregas/vinculos/${entregadorId}/historico${consulta}`);
  assert.equal(resposta.statusCode, 200, resposta.body);
  return resposta.json();
}

const numeros = (lista: HistoricoEntregas) => lista.entregas.map((entrega) => entrega.numeroPedido);

before(async () => {
  await ctx.iniciar();
  A = await ctx.criarPessoa(0, `${PREFIXO}_a`, "Ana da Pizzaria");
  D = await ctx.criarPessoa(1, `${PREFIXO}_d`, "Dora da Padaria");
  P = await ctx.criarPessoa(2, `${PREFIXO}_p`, "Paulo Entregador");
  C = await ctx.criarPessoa(3, `${PREFIXO}_c`, "Carlos Entregador");
  L = await ctx.criarPessoa(4, `${PREFIXO}_l`, "Lia Entregadora");
  B = await ctx.criarPessoa(5, `${PREFIXO}_b`, "Bruna Cliente");
  enderecoB = await ctx.criarEnderecoConfirmado(B);

  pizzaria = await montarEmpresa(A, "Pizzaria Histórico", "pizza");
  padaria = await montarEmpresa(D, "Padaria Histórico", "pada");
  pauloNaPizzaria = await ctx.criarEntregadorAtivo(A, pizzaria.id, P, `${PREFIXO}_p`);
  carlosNaPizzaria = await ctx.criarEntregadorAtivo(A, pizzaria.id, C, `${PREFIXO}_c`);
  pauloNaPadaria = await ctx.criarEntregadorAtivo(D, padaria.id, P, `${PREFIXO}_p`);
});

after(() => ctx.encerrar());

describe("histórico de entregas do entregador", () => {
  it("começa vazio: lista vazia, total zero e sem cursor", async () => {
    assert.deepEqual(await historico(P, pauloNaPizzaria), { entregas: [], proximoCursor: null, total: 0 });
  });

  it("entrega concluída aparece só com número do pedido, data da conclusão e Entregue", async () => {
    const pedido = await entregar(pizzaria, P, pauloNaPizzaria);
    const lista = await historico(P, pauloNaPizzaria);

    assert.equal(lista.total, 1);
    assert.equal(lista.entregas.length, 1);
    const [entrega] = lista.entregas;
    assert.ok(entrega);
    // Nada de endereço, cliente, itens, valor ou pagamento: o contrato tem exatamente estes campos.
    assert.deepEqual(Object.keys(entrega).sort(), ["concluidaEm", "id", "numeroPedido", "status"]);
    assert.equal(entrega.numeroPedido, pedido.numero);
    assert.equal(entrega.status, "entregue");

    // A data é a da transição para ENTREGUE (não a criação do pedido).
    const [conclusao] = await ctx.banco
      .select({ id: historicoStatusPedido.id, ocorridoEm: historicoStatusPedido.ocorridoEm })
      .from(historicoStatusPedido)
      .where(and(eq(historicoStatusPedido.pedidoId, pedido.id), eq(historicoStatusPedido.status, "entregue")));
    assert.ok(conclusao);
    assert.equal(entrega.concluidaEm, conclusao.ocorridoEm.toISOString());
    assert.equal(entrega.id, conclusao.id);
    assert.notEqual(entrega.concluidaEm, pedido.criadoEm);
  });

  it("a área operacional continua a mesma: a entrega concluída sai das entregas atuais", async () => {
    const entregas: ListaEntregas = (await ctx.api(P, "GET", "/entregas")).json();
    assert.deepEqual(entregas.entregas, []);
    const saidas: ListaSaidas = (await ctx.api(P, "GET", "/entregas/saidas?ativas=1")).json();
    assert.ok(Array.isArray(saidas.saidas));
    const vinculos: ListaVinculosEntregador = (await ctx.api(P, "GET", "/entregas/vinculos")).json();
    assert.deepEqual(vinculos.vinculos.map((vinculo) => vinculo.empresa.identidadeId).sort(), [padaria.identidadeId, pizzaria.identidadeId].sort());
  });

  it("pedido cancelado e atribuição ainda aberta não entram", async () => {
    const antes = (await historico(C, carlosNaPizzaria)).total;

    const cancelado = await pedidoPronto(pizzaria);
    await rotaPara(pizzaria, carlosNaPizzaria, cancelado.id);
    const cancelamento = await ctx.api(A, "POST", `/empresas/${pizzaria.id}/pedidos/${cancelado.id}/cancelar`, { statusAtual: "pronto", motivo: "Cliente desistiu" });
    assert.equal(cancelamento.statusCode, 200, cancelamento.body);

    const aberto = await pedidoPronto(pizzaria);
    const saidaId = await rotaPara(pizzaria, carlosNaPizzaria, aberto.id);
    await sairParaEntrega(C, saidaId);
    // Na rua, atribuição aberta: ainda não é entrega concluída.
    assert.equal((await historico(C, carlosNaPizzaria)).total, antes);

    await concluirPeloEntregador(C, saidaId, aberto.id);
    const depois = await historico(C, carlosNaPizzaria);
    assert.equal(depois.total, antes + 1);
    assert.ok(numeros(depois).includes(aberto.numero));
    assert.ok(!numeros(depois).includes(cancelado.numero));
  });

  it("rota recusada por A e entregue por B: só B recebe o crédito", async () => {
    const pedido = await pedidoPronto(pizzaria);
    const saidaId = await rotaPara(pizzaria, pauloNaPizzaria, pedido.id);
    const recusa = await ctx.api(P, "POST", `/entregas/saidas/${saidaId}/recusar`);
    assert.equal(recusa.statusCode, 200, recusa.body);

    const troca = await ctx.api(A, "POST", `/empresas/${pizzaria.id}/pedidos/${pedido.id}/entrega`, { entregadorId: carlosNaPizzaria, transferirDaSaida: true });
    assert.equal(troca.statusCode, 200, troca.body);
    const rotaDoCarlos = await rotaDoPedido(C, pedido.id);
    await sairParaEntrega(C, rotaDoCarlos);
    await concluirPeloEntregador(C, rotaDoCarlos, pedido.id);

    assert.ok(numeros(await historico(C, carlosNaPizzaria)).includes(pedido.numero));
    assert.ok(!numeros(await historico(P, pauloNaPizzaria)).includes(pedido.numero));
  });

  it("A atribuído → reatribuído a B → a EMPRESA marca Entregue: aparece só para B", async () => {
    const pedido = await pedidoPronto(pizzaria);
    await rotaPara(pizzaria, pauloNaPizzaria, pedido.id);
    const troca = await ctx.api(A, "POST", `/empresas/${pizzaria.id}/pedidos/${pedido.id}/entrega`, { entregadorId: carlosNaPizzaria, entregadorAtualId: pauloNaPizzaria });
    assert.equal(troca.statusCode, 200, troca.body);
    await sairParaEntrega(C, await rotaDoPedido(C, pedido.id));

    // Quem clica é o restaurante; quem estava com a entrega é o Carlos.
    const entregue = await ctx.api(A, "POST", `/empresas/${pizzaria.id}/pedidos/${pedido.id}/avancar`, { statusAtual: "saiu_para_entrega" });
    assert.equal(entregue.statusCode, 200, entregue.body);
    assert.equal(entregue.json().status, "entregue");

    assert.ok(numeros(await historico(C, carlosNaPizzaria)).includes(pedido.numero));
    assert.ok(!numeros(await historico(P, pauloNaPizzaria)).includes(pedido.numero));
  });

  it("da mais recente para a mais antiga", async () => {
    await entregar(pizzaria, C, carlosNaPizzaria);
    const lista = await historico(C, carlosNaPizzaria);
    assert.ok(lista.entregas.length >= 3);
    const instantes = lista.entregas.map((entrega) => Date.parse(entrega.concluidaEm));
    assert.deepEqual(instantes, [...instantes].sort((a, b) => b - a));
  });

  it("só o dono do vínculo consulta: outro entregador, a empresa e quem não entrou recebem recusa", async () => {
    assert.equal((await ctx.api(C, "GET", `/entregas/vinculos/${pauloNaPizzaria}/historico`)).statusCode, 404);
    // Operar a empresa não dá acesso ao histórico pessoal do entregador.
    assert.equal((await ctx.api(A, "GET", `/entregas/vinculos/${pauloNaPizzaria}/historico`)).statusCode, 404);
    assert.equal((await ctx.api(P, "GET", `/entregas/vinculos/${randomUUID()}/historico`)).statusCode, 404);
    assert.equal((await ctx.api(P, "GET", "/entregas/vinculos/nao-e-uuid/historico")).statusCode, 400);
    assert.equal((await ctx.api(null, "GET", `/entregas/vinculos/${pauloNaPizzaria}/historico`)).statusCode, 401);
  });

  it("isolamento entre empresas: cada vínculo mostra só as entregas da própria empresa", async () => {
    const daPadaria = await entregar(padaria, P, pauloNaPadaria);
    const naPadaria = await historico(P, pauloNaPadaria);
    assert.deepEqual(numeros(naPadaria), [daPadaria.numero]);

    // As ids de conclusão da padaria nunca aparecem no histórico da pizzaria (os números podem coincidir).
    const naPizzaria = await historico(P, pauloNaPizzaria);
    const idsDaPadaria = new Set(naPadaria.entregas.map((entrega) => entrega.id));
    assert.ok(naPizzaria.entregas.every((entrega) => !idsDaPadaria.has(entrega.id)));
    assert.equal(naPizzaria.total, 1);
  });

  it("sem as DUAS evidências não há crédito (entregue sem atribuição encerrada; atribuição encerrada sem entregue)", async () => {
    const antes = (await historico(P, pauloNaPizzaria)).total;

    // Atribuição marcada como "entregue", mas o pedido não chegou a ENTREGUE.
    const naRua = await pedidoPronto(pizzaria);
    const saidaId = await rotaPara(pizzaria, pauloNaPizzaria, naRua.id);
    await sairParaEntrega(P, saidaId);
    await ctx.banco
      .update(atribuicoesEntrega)
      .set({ encerradoEm: new Date(), motivoEncerramento: "Pedido entregue" })
      .where(and(eq(atribuicoesEntrega.pedidoId, naRua.id), isNull(atribuicoesEntrega.encerradoEm)));
    assert.equal((await historico(P, pauloNaPizzaria)).total, antes);

    // Desfaz a adulteração e conclui de verdade: agora as duas evidências existem.
    await ctx.banco.update(atribuicoesEntrega).set({ encerradoEm: null, motivoEncerramento: null }).where(eq(atribuicoesEntrega.pedidoId, naRua.id));
    await concluirPeloEntregador(P, saidaId, naRua.id);
    assert.equal((await historico(P, pauloNaPizzaria)).total, antes + 1);

    // Pedido ENTREGUE cuja atribuição ficou aberta (a falha entre as duas gravações): não credita.
    await ctx.banco.update(atribuicoesEntrega).set({ encerradoEm: null, motivoEncerramento: null }).where(eq(atribuicoesEntrega.pedidoId, naRua.id));
    assert.equal((await historico(P, pauloNaPizzaria)).total, antes);
    await ctx.banco.update(atribuicoesEntrega).set({ encerradoEm: new Date(), motivoEncerramento: "Pedido entregue" }).where(eq(atribuicoesEntrega.pedidoId, naRua.id));
    assert.equal((await historico(P, pauloNaPizzaria)).total, antes + 1);
  });

  it("entregador desativado: o que estava com ele não vira crédito, e o histórico anterior continua visível", async () => {
    const antes = await historico(P, pauloNaPizzaria);
    assert.ok(antes.total >= 2);

    const pedido = await pedidoPronto(pizzaria);
    await sairParaEntrega(P, await rotaPara(pizzaria, pauloNaPizzaria, pedido.id));
    const desativado = await ctx.api(A, "PATCH", `/empresas/${pizzaria.id}/entregadores/${pauloNaPizzaria}`, { status: "inativo" });
    assert.equal(desativado.statusCode, 200, desativado.body);
    // A empresa conclui o pedido depois: a atribuição dele foi encerrada pela desativação, não pela entrega.
    const entregue = await ctx.api(A, "POST", `/empresas/${pizzaria.id}/pedidos/${pedido.id}/avancar`, { statusAtual: "saiu_para_entrega" });
    assert.equal(entregue.statusCode, 200, entregue.body);

    const depois = await historico(P, pauloNaPizzaria);
    assert.deepEqual(depois, antes);
    // Inativo não opera mais, mas a empresa segue na lista dele — é por ela que o histórico é aberto.
    const vinculos: ListaVinculosEntregador = (await ctx.api(P, "GET", "/entregas/vinculos")).json();
    assert.equal(vinculos.vinculos.find((vinculo) => vinculo.id === pauloNaPizzaria)?.status, "inativo");
  });
});

describe("histórico de entregas: período e paginação", () => {
  // Empresa e entregadora PRÓPRIAS deste bloco: as contagens são exatas.
  let lanchonete: Empresa;
  let lia = "";
  let usuarioDaLia = "";
  const porInstante = new Map<string, number>();

  // Fuso da empresa: São Paulo (UTC−3). 11/10/2026 é domingo.
  const INSTANTES = [
    "2026-10-11T03:00:00.000Z", // 00:00 de domingo 11 (primeiro instante do dia)
    "2026-10-12T02:59:59.999Z", // 23:59:59,999 de domingo 11 (último instante do dia)
    "2026-10-12T03:00:00.000Z", // 00:00 de segunda 12 (outro dia e outra semana)
    "2026-10-05T03:00:00.000Z", // segunda 05, 00:00 (primeiro instante da semana)
    "2026-10-05T02:59:59.999Z", // domingo 04, 23:59 (semana anterior, mesmo mês)
    "2026-10-01T02:59:59.999Z", // 30 de setembro, 23:59 (mês anterior)
  ] as const;
  const AGORA = () => new Date("2026-10-11T15:00:00.000Z"); // domingo 11/10, 12:00 em São Paulo

  const numerosDe = (...instantes: string[]) => instantes.map((instante) => porInstante.get(instante)).sort();

  const noRelogio = async (consulta: Parameters<typeof listarMeuHistoricoDeEntregas>[3]) => {
    const resultado = await listarMeuHistoricoDeEntregas(ctx.banco, usuarioDaLia, lia, consulta, AGORA);
    if (resultado.tipo !== "historico") throw new Error("sem acesso");
    return resultado;
  };

  before(async () => {
    lanchonete = await montarEmpresa(A, "Lanchonete Histórico", "lanch");
    lia = await ctx.criarEntregadorAtivo(A, lanchonete.id, L, `${PREFIXO}_l`);
    const [vinculo] = await ctx.banco.select({ usuarioId: entregadoresEmpresa.usuarioId }).from(entregadoresEmpresa).where(eq(entregadoresEmpresa.id, lia));
    assert.ok(vinculo);
    usuarioDaLia = vinculo.usuarioId;

    // Entregas REAIS (pela API); depois só o instante da conclusão é ajustado no banco.
    for (const instante of INSTANTES) {
      const pedido = await entregar(lanchonete, L, lia);
      porInstante.set(instante, pedido.numero);
      await ctx.banco
        .update(historicoStatusPedido)
        .set({ ocorridoEm: new Date(instante) })
        .where(and(eq(historicoStatusPedido.pedidoId, pedido.id), eq(historicoStatusPedido.status, "entregue")));
      // A criação do pedido fica "hoje" em todos: se o filtro olhasse para ela, tudo cairia em Hoje.
      await ctx.banco.update(pedidos).set({ criadoEm: new Date("2026-10-11T15:00:00.000Z") }).where(eq(pedidos.id, pedido.id));
    }
  });

  it("Hoje: o dia inteiro no fuso da empresa, pela CONCLUSÃO (não pela criação do pedido)", async () => {
    const hoje = await noRelogio({ periodo: "hoje", limite: 50 });
    assert.equal(hoje.total, 2);
    assert.deepEqual(hoje.entregas.map((entrega) => entrega.numeroPedido).sort(), numerosDe(INSTANTES[0], INSTANTES[1]));
  });

  it("Esta semana: de segunda a domingo", async () => {
    const semana = await noRelogio({ periodo: "semana", limite: 50 });
    assert.equal(semana.total, 3);
    assert.deepEqual(semana.entregas.map((entrega) => entrega.numeroPedido).sort(), numerosDe(INSTANTES[0], INSTANTES[1], INSTANTES[3]));
  });

  it("Este mês: do dia 1º ao último, sem o mês anterior", async () => {
    const mes = await noRelogio({ periodo: "mes", limite: 50 });
    assert.equal(mes.total, 5);
    assert.ok(!mes.entregas.some((entrega) => entrega.numeroPedido === porInstante.get(INSTANTES[5])));
  });

  it("Personalizado: as duas datas entram inteiras", async () => {
    const umDia = await historico(L, lia, "?periodo=personalizado&dataInicial=2026-10-11&dataFinal=2026-10-11&limite=50");
    assert.deepEqual(numeros(umDia).sort(), numerosDe(INSTANTES[0], INSTANTES[1]));
    const doisDias = await historico(L, lia, "?periodo=personalizado&dataInicial=2026-10-11&dataFinal=2026-10-12");
    assert.equal(doisDias.total, 3);
    const setembro = await historico(L, lia, "?periodo=personalizado&dataInicial=2026-09-01&dataFinal=2026-09-30");
    assert.deepEqual(numeros(setembro), [porInstante.get(INSTANTES[5])]);
  });

  it("período sem entregas: estado vazio", async () => {
    assert.deepEqual(await historico(L, lia, "?periodo=personalizado&dataInicial=2020-01-01&dataFinal=2020-01-31"), { entregas: [], proximoCursor: null, total: 0 });
  });

  it("período inválido é recusado; sem período vale Hoje", async () => {
    for (const consulta of [
      "?periodo=personalizado",
      "?periodo=personalizado&dataInicial=2026-10-11",
      "?periodo=personalizado&dataInicial=2026-10-12&dataFinal=2026-10-11",
      "?periodo=personalizado&dataInicial=11/10/2026&dataFinal=2026-10-11",
      "?periodo=ontem",
      "?periodo=todos",
      "?limite=51",
      "?antesDe=abc",
    ]) {
      const resposta = await ctx.api(L, "GET", `/entregas/vinculos/${lia}/historico${consulta}`);
      assert.equal(resposta.statusCode, 400, `${consulta}: ${resposta.body}`);
      assert.equal(resposta.json().codigo, "DADOS_INVALIDOS");
    }
    const foraDeOrdem = await ctx.api(L, "GET", `/entregas/vinculos/${lia}/historico?periodo=personalizado&dataInicial=2026-10-12&dataFinal=2026-10-11`);
    assert.equal(foraDeOrdem.json().mensagem, "A data final não pode ser anterior à data inicial.");

    // No relógio real, nenhuma das conclusões (todas de 2026-09/10 ajustadas) é necessariamente de hoje:
    // a consulta sem período responde como "?periodo=hoje".
    assert.deepEqual(await historico(L, lia), await historico(L, lia, "?periodo=hoje"));
  });

  it("paginação por cursor: páginas sem repetição, total do período e cursor nulo no fim", async () => {
    const mes = "?periodo=personalizado&dataInicial=2026-10-01&dataFinal=2026-10-31";
    const tudo = await historico(L, lia, `${mes}&limite=50`);
    assert.equal(tudo.total, 5);
    assert.equal(tudo.proximoCursor, null);

    const primeira = await historico(L, lia, `${mes}&limite=2`);
    assert.equal(primeira.entregas.length, 2);
    assert.equal(primeira.total, 5);
    assert.equal(primeira.proximoCursor, primeira.entregas.at(-1)?.id);

    const segunda = await historico(L, lia, `${mes}&limite=2&antesDe=${primeira.proximoCursor}`);
    assert.equal(segunda.entregas.length, 2);
    assert.equal(segunda.total, 5);
    const terceira = await historico(L, lia, `${mes}&limite=2&antesDe=${segunda.proximoCursor}`);
    assert.equal(terceira.entregas.length, 1);
    assert.equal(terceira.proximoCursor, null);

    // As páginas, juntas, são a lista inteira na mesma ordem (do registro mais recente ao mais antigo).
    assert.deepEqual([...primeira.entregas, ...segunda.entregas, ...terceira.entregas], tudo.entregas);
    const ids = tudo.entregas.map((entrega) => entrega.id);
    assert.deepEqual(ids, [...ids].sort().reverse());
  });
});
