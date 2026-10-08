import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { atribuicoesEntrega, paradasSaida, saidasEntrega } from "@jaa/banco/schema";
import {
  EVENTO_PEDIDO_FILA,
  type Empresa,
  type EntregaDoPedido,
  type EventoPedidoFila,
  type ListaSaidas,
  type Pedido,
  type Produto,
  type SaidaEntrega,
} from "@jaa/contratos";
import { and, eq, isNull } from "drizzle-orm";
import { aguardarAte, coletar, criarAmbienteIntegracao, type Pessoa } from "./apoio/integracao.js";
import { despacharPendentes, processarFormacoesVencidas } from "../src/features/entregas/casos-de-uso/despacho-automatico.js";

/*
 * TRANSFERÊNCIA MANUAL a partir da formação automática: com zonas ATIVAS, o gerente atribui a outro
 * entregador um pedido que o Jaa já tinha posto numa saída que ainda não saiu. A decisão manual
 * prevalece; depois que a saída foi para a rua, nada é transferido.
 *
 * A = dona; P = Paulo (primeiro da fila, recebe o automático); C = Carlos (escolha manual);
 * M = Marta (terceira entregadora, para indisponível e concorrência); B1/B2 = clientes.
 */
const PREFIXO = `trf${randomUUID().slice(0, 4)}`;
const ctx = criarAmbienteIntegracao({
  telefones: ["+5531987696001", "+5531987696002", "+5531987696003", "+5531987696004", "+5531987696005", "+5531987696006"],
  prefixoIp: "198.18.96.",
});

const ZONA = [
  { latitude: -19.93, longitude: -43.95 },
  { latitude: -19.93, longitude: -43.93 },
  { latitude: -19.91, longitude: -43.93 },
  { latitude: -19.91, longitude: -43.95 },
];
const pontoNaZona = (n: number) => ({ latitude: -19.92 + n * 0.001, longitude: -43.94 + n * 0.001 });

let A: Pessoa;
let P: Pessoa;
let C: Pessoa;
let M: Pessoa;
let B1: Pessoa;
let B2: Pessoa;
let pizzaria: Empresa;
let pizza: Produto;
let paulo = "";
let carlos = "";
let marta = "";
const conversas = new Map<string, string>();

const despacho = () => ({ banco: ctx.banco, eventosEntregas: ctx.eventosEntregas });
const avancar = (pedidoId: string, statusAtual: string) =>
  ctx.api(A, "POST", `/empresas/${pizzaria.id}/pedidos/${pedidoId}/avancar`, { statusAtual });
const atribuir = (pedidoId: string, entregadorId: string, transferirDaSaida?: boolean) =>
  ctx.api(A, "POST", `/empresas/${pizzaria.id}/pedidos/${pedidoId}/entrega`, {
    entregadorId,
    ...(transferirDaSaida === undefined ? {} : { transferirDaSaida }),
  });
const listarSaidas = async (): Promise<SaidaEntrega[]> =>
  ((await ctx.api(A, "GET", `/empresas/${pizzaria.id}/saidas`)).json() as ListaSaidas).saidas;
const saidaDoPedido = async (pedidoId: string) =>
  (await listarSaidas()).find((saida) => saida.status !== "concluida" && saida.paradas.some((p) => p.pedidoId === pedidoId && !p.encerradaEm)) ?? null;
const buscarSaida = async (saidaId: string): Promise<SaidaEntrega> =>
  (await ctx.api(A, "GET", `/empresas/${pizzaria.id}/saidas/${saidaId}`)).json();

let pedidosCriados = 0;
async function pedidoPronto(cliente: Pessoa): Promise<Pedido> {
  pedidosCriados += 1;
  const enderecoId = await ctx.criarEnderecoConfirmado(cliente, { numero: String(100 + pedidosCriados) }, pontoNaZona(pedidosCriados % 8));
  const resposta = await ctx.api(cliente, "POST", "/pedidos", {
    idCliente: randomUUID(),
    empresaIdentidadeId: pizzaria.identidadeId,
    conversaId: conversas.get(cliente.identidadeId),
    enderecoId,
    itens: [{ produtoId: pizza.id, quantidade: 1 }],
    pagamento: { forma: "cartao" },
  });
  assert.equal(resposta.statusCode, 201, resposta.body);
  let pedido: Pedido = resposta.json();
  for (const status of ["recebido", "em_preparacao"] as const) {
    const avanco = await avancar(pedido.id, status);
    assert.equal(avanco.statusCode, 200, avanco.body);
    pedido = avanco.json();
  }
  return pedido;
}

// Deixa o pedido PRONTO pelo fluxo real: recebido → em_preparacao → pronto (é aqui que a automação o encaixa).
// Invariantes que NUNCA podem quebrar: uma parada ativa e uma atribuição atual por pedido, coerentes.
async function invariantes(pedidoId: string) {
  const ativas = await ctx.banco
    .select({ saidaId: paradasSaida.saidaId, entregadorId: saidasEntrega.entregadorId })
    .from(paradasSaida)
    .innerJoin(saidasEntrega, eq(saidasEntrega.id, paradasSaida.saidaId))
    .where(and(eq(paradasSaida.pedidoId, pedidoId), isNull(paradasSaida.encerradaEm)));
  const atuais = await ctx.banco
    .select({ entregadorId: atribuicoesEntrega.entregadorId })
    .from(atribuicoesEntrega)
    .where(and(eq(atribuicoesEntrega.pedidoId, pedidoId), isNull(atribuicoesEntrega.encerradoEm)));
  assert.ok(ativas.length <= 1, "nunca duas saídas ativas para o mesmo pedido");
  assert.ok(atuais.length <= 1, "nunca dois entregadores atuais");
  if (ativas[0]?.entregadorId) assert.equal(atuais[0]?.entregadorId, ativas[0].entregadorId, "saída e atribuição contam a mesma história");
  return { saidaId: ativas[0]?.saidaId ?? null, entregadorId: atuais[0]?.entregadorId ?? null };
}

async function entrarNaBase(pessoa: Pessoa, entregadorId: string) {
  for (let i = 0; i < 2; i++) {
    const resposta = await ctx.api(pessoa, "POST", `/entregas/vinculos/${entregadorId}/localizacao`, {
      latitude: -19.9,
      longitude: -43.9,
      precisaoMetros: 10,
      medidaEm: new Date().toISOString(),
    });
    assert.equal(resposta.statusCode, 200, resposta.body);
  }
}

before(async () => {
  await ctx.iniciar();
  A = await ctx.criarPessoa(0, `${PREFIXO}_a`, "Ana da Pizzaria");
  P = await ctx.criarPessoa(1, `${PREFIXO}_p`, "Paulo Entregador");
  C = await ctx.criarPessoa(2, `${PREFIXO}_c`, "Carlos Entregador");
  M = await ctx.criarPessoa(3, `${PREFIXO}_m`, "Marta Entregadora");
  B1 = await ctx.criarPessoa(4, `${PREFIXO}_b1`, "Bruna Cliente");
  B2 = await ctx.criarPessoa(5, `${PREFIXO}_b2`, "Bento Cliente");
  pizzaria = (await ctx.api(A, "POST", "/empresas", { nome: "Pizzaria Transferência", nomeUsuario: `${PREFIXO}_pizza`, slug: `${PREFIXO}-pizzaria` })).json();
  pizza = (await ctx.api(A, "POST", `/empresas/${pizzaria.id}/produtos`, { nome: "Pizza", precoCentavos: 3990 })).json();
  for (const cliente of [B1, B2]) conversas.set(cliente.identidadeId, await ctx.abrirConversa(cliente, `${PREFIXO}_pizza`));
  paulo = await ctx.criarEntregadorAtivo(A, pizzaria.id, P, `${PREFIXO}_p`);
  carlos = await ctx.criarEntregadorAtivo(A, pizzaria.id, C, `${PREFIXO}_c`);
  marta = await ctx.criarEntregadorAtivo(A, pizzaria.id, M, `${PREFIXO}_m`);
  await ctx.api(A, "POST", `/empresas/${pizzaria.id}/base`, {
    cep: "30123-000", logradouro: "Avenida Afonso Pena", numero: "1000", bairro: "Centro", cidade: "Belo Horizonte", uf: "MG", raioMetros: 150,
  });
  await ctx.api(A, "POST", `/empresas/${pizzaria.id}/base/localizacao`, { latitude: -19.9, longitude: -43.9 });
  // Zona ATIVA: a automação fica ligada o tempo todo (nenhuma zona é desligada neste teste).
  assert.equal((await ctx.api(A, "POST", `/empresas/${pizzaria.id}/zonas`, { nome: "Centro", vertices: ZONA })).statusCode, 201);
  assert.equal((await ctx.api(A, "POST", `/empresas/${pizzaria.id}/despacho`, { maxPedidosPorSaida: 5, tempoFormacaoMinutos: 15 })).statusCode, 200);
  // Só Paulo na base: é ele quem o despacho automático escolheria.
  await entrarNaBase(P, paulo);
});

after(() => ctx.encerrar());

describe("transferência manual a partir da formação automática", () => {
  it("pedido PRONTO entra na formação automática; sem confirmação a atribuição NÃO muda nada", async () => {
    const pedido = await pedidoPronto(B1);
    const formacao = await saidaDoPedido(pedido.id);
    assert.equal(formacao?.status, "em_formacao");
    assert.equal(formacao?.automatica, true);

    const semConfirmar = await atribuir(pedido.id, carlos);
    assert.equal(semConfirmar.statusCode, 409);
    assert.equal(semConfirmar.json().codigo, "PEDIDO_EM_SAIDA_TRANSFERIVEL");
    assert.equal((await saidaDoPedido(pedido.id))?.id, formacao?.id, "continua na formação");
    assert.equal((await invariantes(pedido.id)).entregadorId, null);
    // Limpa o cenário: a formação sozinha será usada no próximo teste.
    await ctx.api(A, "POST", `/empresas/${pizzaria.id}/pedidos/${pedido.id}/cancelar`, { statusAtual: "pronto", motivo: "Fim do cenário" });
  });

  it("formação só com o pedido: transfere ao Carlos com zonas ativas, formação vazia CONCLUÍDA, nada pendurado", async () => {
    const pedido = await pedidoPronto(B1);
    const formacao = await saidaDoPedido(pedido.id);
    assert.equal(formacao?.status, "em_formacao");

    const resposta = await atribuir(pedido.id, carlos, true);
    assert.equal(resposta.statusCode, 200, resposta.body);
    assert.equal((resposta.json() as EntregaDoPedido).entregadorAtual?.id, carlos);

    const anterior = await buscarSaida(formacao!.id);
    assert.equal(anterior.status, "concluida", "saída vazia não fica ativa");
    assert.equal(anterior.paradas[0]?.motivoEncerramento, "Atribuído manualmente a outro entregador", "histórico preservado com motivo");
    const nova = await saidaDoPedido(pedido.id);
    assert.ok(nova && nova.id !== formacao!.id);
    assert.equal(nova.status, "liberada_retirada", "a saída manual nova segue a liberação automática da empresa");
    assert.equal(nova.automatica, false);
    assert.equal(nova.entregador?.nomeUsuario, `${PREFIXO}_c`);
    const { saidaId, entregadorId } = await invariantes(pedido.id);
    assert.equal(saidaId, nova.id);
    assert.equal(entregadorId, carlos);

    // "Minhas entregas" do Carlos mostra a saída; Paulo e Marta não veem nada dela.
    const doCarlos = (await ctx.api(C, "GET", "/entregas/saidas")).json() as ListaSaidas;
    assert.ok(doCarlos.saidas.some((s) => s.id === nova.id));
    assert.equal((await ctx.api(C, "GET", `/entregas/${pedido.id}`)).statusCode, 200);
    assert.equal((await ctx.api(P, "GET", `/entregas/${pedido.id}`)).statusCode, 404);
    await ctx.api(A, "POST", `/empresas/${pizzaria.id}/pedidos/${pedido.id}/cancelar`, { statusAtual: "pronto", motivo: "Fim do cenário" });
  });

  let pedidoB: Pedido;
  let pedidoA: Pedido;
  let pedidoC: Pedido;
  let origemId = "";
  let novaId = "";

  it("formação A+B+C, transfere só B: A e C continuam na formação (versão avança), B vai para a saída do Carlos", async () => {
    pedidoA = await pedidoPronto(B1);
    pedidoB = await pedidoPronto(B2);
    pedidoC = await pedidoPronto(B1);
    const origem = await saidaDoPedido(pedidoB.id);
    assert.equal(origem?.status, "em_formacao");
    assert.equal(origem?.paradas.length, 3);
    origemId = origem!.id;

    // O cliente de B acompanha a fila por evento (sem F5).
    const socketB2 = await ctx.conectar(B2);
    const filasB2 = coletar<EventoPedidoFila>(socketB2, EVENTO_PEDIDO_FILA);

    assert.equal((await atribuir(pedidoB.id, carlos, true)).statusCode, 200);
    const depois = await buscarSaida(origemId);
    assert.equal(depois.status, "em_formacao", "a formação segue viva para A e C");
    assert.deepEqual(depois.paradas.filter((p) => !p.encerradaEm).map((p) => p.pedidoId).sort(), [pedidoA.id, pedidoC.id].sort());
    assert.equal(depois.versaoSequencia, origem!.versaoSequencia + 1);
    for (const pedido of [pedidoA, pedidoC]) assert.equal((await invariantes(pedido.id)).saidaId, origemId, "A e C não foram cancelados nem movidos");

    const nova = await saidaDoPedido(pedidoB.id);
    novaId = nova!.id;
    assert.equal(nova?.entregador?.nomeUsuario, `${PREFIXO}_c`);
    assert.deepEqual(nova?.paradas.map((p) => p.pedidoId), [pedidoB.id]);

    // Fila do cliente de B: agora derivada da saída NOVA.
    await aguardarAte(() => filasB2.some((evento) => evento.pedidoId === pedidoB.id));
    const fila = (await ctx.api(B2, "GET", `/pedidos/${pedidoB.id}/fila`)).json();
    assert.equal(fila.situacao, "aguardando_saida");
    socketB2.close();
  });

  it("a automação NÃO desfaz a escolha manual: a formação de origem fecha e vai para o Paulo só com A e C", async () => {
    await ctx.banco
      .update(saidasEntrega)
      .set({ prazoFormacaoEm: new Date(Date.now() - 60_000), formacaoIniciadaEm: new Date(Date.now() - 120_000) })
      .where(eq(saidasEntrega.id, origemId));
    await processarFormacoesVencidas(despacho(), pizzaria.id);
    await despacharPendentes(despacho(), pizzaria.id);

    const origem = await buscarSaida(origemId);
    assert.equal(origem.entregador?.nomeUsuario, `${PREFIXO}_p`, "o automático seguiu com o primeiro da fila");
    assert.deepEqual(origem.paradas.filter((p) => !p.encerradaEm).map((p) => p.pedidoId).sort(), [pedidoA.id, pedidoC.id].sort());
    const b = await invariantes(pedidoB.id);
    assert.equal(b.saidaId, novaId);
    assert.equal(b.entregadorId, carlos, "B continua com quem o gerente escolheu");
  });

  it("entregador indisponível não recebe transferência (regras do vínculo por empresa preservadas)", async () => {
    assert.equal((await ctx.api(M, "PATCH", `/entregas/vinculos/${marta}`, { disponivel: false })).statusCode, 200);
    const recusa = await atribuir(pedidoA.id, marta, true);
    assert.equal(recusa.statusCode, 409);
    assert.equal(recusa.json().codigo, "ENTREGADOR_INDISPONIVEL");
    assert.equal((await invariantes(pedidoA.id)).saidaId, origemId, "nada mudou");
    assert.equal((await ctx.api(M, "PATCH", `/entregas/vinculos/${marta}`, { disponivel: true })).statusCode, 200);
  });

  it("saída PREPARADA/LIBERADA com entregador: transferir tira a entrega de quem a tinha", async () => {
    // A está na saída do Paulo (liberada pela liberação automática): passa para a Marta.
    assert.equal((await atribuir(pedidoA.id, marta, true)).statusCode, 200);
    assert.equal((await ctx.api(P, "GET", `/entregas/${pedidoA.id}`)).statusCode, 404, "Paulo perdeu o acesso na hora");
    assert.equal((await ctx.api(M, "GET", `/entregas/${pedidoA.id}`)).statusCode, 200);
    const origem = await buscarSaida(origemId);
    assert.deepEqual(origem.paradas.filter((p) => !p.encerradaEm).map((p) => p.pedidoId), [pedidoC.id], "Paulo segue só com C");
    assert.equal((await invariantes(pedidoA.id)).entregadorId, marta);
  });

  it("concorrência: duas transferências simultâneas do mesmo pedido nunca criam duas saídas ou dois entregadores", async () => {
    const pedido = await pedidoPronto(B2);
    const resultados = await Promise.all([atribuir(pedido.id, carlos, true), atribuir(pedido.id, marta, true)]);
    assert.ok(resultados.some((r) => r.statusCode === 200), resultados.map((r) => r.body).join(" | "));
    const final = await invariantes(pedido.id);
    assert.ok(final.saidaId);
    assert.ok(final.entregadorId === carlos || final.entregadorId === marta);

    // Transferência × despacho automático ao mesmo tempo (formação vencendo).
    const outro = await pedidoPronto(B1);
    const formacao = await saidaDoPedido(outro.id);
    await ctx.banco.update(saidasEntrega).set({ prazoFormacaoEm: new Date(Date.now() - 60_000) }).where(eq(saidasEntrega.id, formacao!.id));
    await Promise.all([atribuir(outro.id, carlos, true), processarFormacoesVencidas(despacho(), pizzaria.id)]);
    const depois = await invariantes(outro.id);
    assert.ok(depois.saidaId, "o pedido termina em exatamente uma saída ativa");
  });

  it("depois que a saída sai para a rua (em_andamento): RECUSA, sem mover pedido, saída ou entregador", async () => {
    assert.equal((await ctx.api(A, "POST", `/empresas/${pizzaria.id}/saidas/${novaId}/liberar`)).statusCode, 200);
    assert.equal((await ctx.api(C, "POST", `/entregas/saidas/${novaId}/iniciar`)).statusCode, 200);
    const antes = await buscarSaida(novaId);
    assert.equal(antes.status, "em_andamento");

    for (const confirmar of [undefined, true]) {
      const recusa = await atribuir(pedidoB.id, marta, confirmar);
      assert.equal(recusa.statusCode, 409);
      assert.equal(recusa.json().codigo, "SAIDA_EM_ANDAMENTO");
    }
    const depois = await buscarSaida(novaId);
    assert.equal(depois.status, "em_andamento");
    assert.equal(depois.versaoSequencia, antes.versaoSequencia);
    assert.equal((await invariantes(pedidoB.id)).entregadorId, carlos);
  });

  it("rastreamento acompanha quem está com a entrega, e o fluxo segue até ENTREGUE", async () => {
    const posicao = await ctx.api(C, "POST", `/entregas/saidas/${novaId}/posicao`, {
      latitude: -19.905,
      longitude: -43.905,
      precisaoMetros: 8,
      capturadaEm: new Date().toISOString(),
    });
    assert.ok(posicao.statusCode < 300, posicao.body);
    // Quem perdeu/nunca teve esta saída não publica posição nela.
    const intruso = await ctx.api(P, "POST", `/entregas/saidas/${novaId}/posicao`, {
      latitude: -19.905,
      longitude: -43.905,
      precisaoMetros: 8,
      capturadaEm: new Date().toISOString(),
    });
    assert.equal(intruso.statusCode, 404);
    assert.equal((await ctx.api(A, "GET", `/empresas/${pizzaria.id}/saidas/${novaId}/posicao`)).statusCode, 200);

    const fila = (await ctx.api(B2, "GET", `/pedidos/${pedidoB.id}/fila`)).json();
    assert.equal(fila.situacao, "indo_ate_voce");

    assert.equal((await ctx.api(C, "POST", `/entregas/saidas/${novaId}/paradas/${pedidoB.id}/concluir`)).statusCode, 200);
    const pedido = (await ctx.api(B2, "GET", `/pedidos/${pedidoB.id}`)).json() as Pedido;
    assert.equal(pedido.status, "entregue");
    assert.equal((await buscarSaida(novaId)).status, "concluida");
    assert.equal((await invariantes(pedidoB.id)).saidaId, null);
  });
});
