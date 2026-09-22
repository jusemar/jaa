import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { basesEmpresa, consumosRoteamento } from "@jaa/banco/schema";
import { rotaTemPercursoReal, type Coordenadas, type Empresa, type FilaDoPedido, type Pedido, type Produto, type SaidaEntrega } from "@jaa/contratos";
import { eq } from "drizzle-orm";
import { criarAmbienteIntegracao, type Pessoa } from "./apoio/integracao.js";
import { criarMotorDeRotas, type ParadaDeRota, type Percurso, type ProvedorRoteamento } from "../src/features/entregas/lib/motor-rotas.js";

/*
 * Integração REAL da rota da saída: origem na base da empresa, snapshot dos destinos, sequência
 * sugerida pelo provedor, percurso recalculado (sem reotimizar) quando o entregador muda a ordem, e
 * fallback seguro quando o provedor falha.
 *
 * O provedor é um FAKE controlável — nenhuma chamada externa real acontece nos testes.
 */

const PREFIXO = `rot${randomUUID().slice(0, 4)}`;

// Provedor fake com comportamento alternável pelo teste (sucesso, falha, ordem inversa).
const provedorFake = {
  nome: "fake",
  maximoParadasOtimizacao: 11,
  maximoParadasPercurso: 24,
  modo: "sucesso" as "sucesso" | "falha",
  chamadas: [] as string[],
  origensRecebidas: [] as Coordenadas[],
  async otimizarSequencia(origem: Coordenadas, paradas: ParadaDeRota[]) {
    this.chamadas.push("otimizacao");
    this.origensRecebidas.push(origem);
    if (this.modo === "falha") throw new Error("provedor fora do ar");
    // Ordem "do provedor": o inverso da ordem recebida, para ficar evidente que veio dele.
    return { ordem: [...paradas].reverse().map((parada) => parada.pedidoId) };
  },
  async calcularPercurso(origem: Coordenadas, paradas: ParadaDeRota[]): Promise<Percurso> {
    this.chamadas.push(`percurso:${paradas.map((parada) => parada.pedidoId).join(",")}`);
    this.origensRecebidas.push(origem);
    if (this.modo === "falha") throw new Error("provedor fora do ar");
    return {
      geometria: [origem, ...paradas.map((parada) => parada.coordenadas)],
      distanciaMetros: 1000 * paradas.length,
      duracaoSegundos: 300 * paradas.length,
    };
  },
} satisfies ProvedorRoteamento & { modo: "sucesso" | "falha"; chamadas: string[]; origensRecebidas: Coordenadas[] };

const ctx = criarAmbienteIntegracao({
  telefones: ["+5531987654001", "+5531987654002", "+5531987654003", "+5531987654004", "+5531987654005"],
  prefixoIp: "198.18.17.",
  motorRotas: criarMotorDeRotas(provedorFake),
});

const BASE = { latitude: -19.9191, longitude: -43.9386 };

let A: Pessoa;
let P: Pessoa;
let D: Pessoa;
let B1: Pessoa;
let B2: Pessoa;
let pizzaria: Empresa;
let padaria: Empresa;
let pizza: Produto;
let paulo = "";
const conversas = new Map<string, string>();

const avancar = (pedidoId: string, statusAtual: string) => ctx.api(A, "POST", `/empresas/${pizzaria.id}/pedidos/${pedidoId}/avancar`, { statusAtual });

async function pedidoProntoEm(cliente: Pessoa, ponto: { latitude: number; longitude: number }): Promise<Pedido> {
  const enderecoId = await ctx.criarEnderecoConfirmado(cliente, { apelido: `Casa ${randomUUID().slice(0, 6)}`, numero: `${Math.floor(Math.random() * 900) + 100}` }, ponto);
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
  for (const status of ["recebido", "em_preparacao"] as const) pedido = (await avancar(pedido.id, status)).json();
  return pedido;
}

const criarSaida = (pedidoIds: string[]) => ctx.api(A, "POST", `/empresas/${pizzaria.id}/saidas`, { entregadorId: paulo, pedidoIds });
const obterSaida = async (saidaId: string): Promise<SaidaEntrega> => (await ctx.api(A, "GET", `/empresas/${pizzaria.id}/saidas/${saidaId}`)).json();
const ordemAtiva = (saida: SaidaEntrega) => saida.paradas.filter((parada) => parada.encerradaEm === null).sort((a, b) => a.posicao - b.posicao).map((parada) => parada.pedidoId);

before(async () => {
  await ctx.iniciar();
  A = await ctx.criarPessoa(0, `${PREFIXO}_a`, "Ana da Pizzaria");
  P = await ctx.criarPessoa(1, `${PREFIXO}_p`, "Paulo Entregador");
  D = await ctx.criarPessoa(2, `${PREFIXO}_d`, "Dora da Padaria");
  B1 = await ctx.criarPessoa(3, `${PREFIXO}_b1`, "Bruna Um");
  B2 = await ctx.criarPessoa(4, `${PREFIXO}_b2`, "Bento Dois");

  pizzaria = (await ctx.api(A, "POST", "/empresas", { nome: "Pizzaria Rota", nomeUsuario: `${PREFIXO}_pizza`, slug: `${PREFIXO}-pizzaria` })).json();
  padaria = (await ctx.api(D, "POST", "/empresas", { nome: "Padaria Rota", nomeUsuario: `${PREFIXO}_pada`, slug: `${PREFIXO}-padaria` })).json();
  pizza = (await ctx.api(A, "POST", `/empresas/${pizzaria.id}/produtos`, { nome: "Pizza Calabresa", precoCentavos: 3990 })).json();
  for (const cliente of [B1, B2]) conversas.set(cliente.identidadeId, await ctx.abrirConversa(cliente, `${PREFIXO}_pizza`));
  paulo = await ctx.criarEntregadorAtivo(A, pizzaria.id, P, `${PREFIXO}_p`);

  await ctx.api(A, "POST", `/empresas/${pizzaria.id}/base`, {
    cep: "30123-000",
    logradouro: "Avenida Afonso Pena",
    numero: "1000",
    bairro: "Centro",
    cidade: "Belo Horizonte",
    uf: "MG",
    raioMetros: 150,
  });
  await ctx.api(A, "POST", `/empresas/${pizzaria.id}/base/localizacao`, BASE);
});

after(() => ctx.encerrar());

describe("rota da saída", () => {
  it("origem é a base confirmada da empresa e as paradas são os destinos snapshot", async () => {
    provedorFake.modo = "sucesso";
    provedorFake.chamadas = [];
    provedorFake.origensRecebidas = [];

    const pedidos = [await pedidoProntoEm(B1, { latitude: -19.93, longitude: -43.93 }), await pedidoProntoEm(B2, { latitude: -19.94, longitude: -43.92 })];
    const criada = await criarSaida(pedidos.map((pedido) => pedido.id));
    assert.equal(criada.statusCode, 201, criada.body);
    const saida: SaidaEntrega = criada.json();

    assert.ok(saida.rota, "a saída nasce com rota calculada");
    assert.equal(saida.rota?.estado, "percurso_real");
    assert.equal(saida.rota?.provedor, "fake");
    assert.deepEqual(saida.rota?.origem, BASE, "origem = ponto confirmado da base, nunca a localização de alguém");
    assert.deepEqual(provedorFake.origensRecebidas[0], BASE);
    assert.equal(rotaTemPercursoReal(saida.rota), true);
    assert.equal(saida.rota?.distanciaMetros, 2000);
    assert.equal(saida.rota?.duracaoSegundos, 600);
    assert.equal(saida.rota?.versaoSequencia, saida.versaoSequencia, "o percurso vale para a ordem atual");
    // As coordenadas enviadas ao provedor são as do snapshot do pedido (nada é geocodificado de novo).
    const destinos = saida.paradas.map((parada) => `${parada.destino.latitude},${parada.destino.longitude}`);
    assert.ok(destinos.includes("-19.93,-43.93") && destinos.includes("-19.94,-43.92"), destinos.join("|"));
  });

  it("a sequência sugerida vem do provedor e o percurso é o da ordem final", async () => {
    provedorFake.modo = "sucesso";
    provedorFake.chamadas = [];
    const pedidos = [
      await pedidoProntoEm(B1, { latitude: -19.95, longitude: -43.91 }),
      await pedidoProntoEm(B2, { latitude: -19.96, longitude: -43.9 }),
      await pedidoProntoEm(B1, { latitude: -19.97, longitude: -43.89 }),
    ];
    const saida: SaidaEntrega = (await criarSaida(pedidos.map((pedido) => pedido.id))).json();

    assert.equal(saida.rota?.sequenciaDoProvedor, true);
    const ordem = ordemAtiva(saida);
    assert.equal(ordem.length, 3);
    // O provedor fake inverte a ordem recebida: a saída precisa refletir a ordem DELE.
    assert.ok(provedorFake.chamadas.includes("otimizacao"));
    assert.ok(provedorFake.chamadas.includes(`percurso:${ordem.join(",")}`), provedorFake.chamadas.join("|"));
  });

  it("o entregador reordena: a ordem dele prevalece e só o percurso é recalculado", async () => {
    provedorFake.modo = "sucesso";
    const pedidos = [await pedidoProntoEm(B1, { latitude: -19.91, longitude: -43.95 }), await pedidoProntoEm(B2, { latitude: -19.92, longitude: -43.96 })];
    const saida: SaidaEntrega = (await criarSaida(pedidos.map((pedido) => pedido.id))).json();
    const ordemPlanejada = ordemAtiva(saida);
    const escolhaDele = [...ordemPlanejada].reverse();

    provedorFake.chamadas = [];
    const reordenada = await ctx.api(P, "PATCH", `/entregas/saidas/${saida.id}/sequencia`, { versaoSequencia: saida.versaoSequencia, pedidoIds: escolhaDele });
    assert.equal(reordenada.statusCode, 200, reordenada.body);
    const depois: SaidaEntrega = reordenada.json();

    assert.deepEqual(ordemAtiva(depois), escolhaDele, "a ordem do entregador é mantida");
    assert.deepEqual(provedorFake.chamadas, [`percurso:${escolhaDele.join(",")}`], "só percurso — nenhuma reotimização");
    assert.equal(depois.rota?.sequenciaDoProvedor, false);
    assert.equal(depois.rota?.estado, "percurso_real");
    assert.equal(depois.rota?.versaoSequencia, depois.versaoSequencia, "o percurso acompanha a nova versão da sequência");
  });

  it("ler a saída não chama o provedor (custo só quando há motivo operacional)", async () => {
    const saidas = (await ctx.api(A, "GET", `/empresas/${pizzaria.id}/saidas`)).json() as { saidas: SaidaEntrega[] };
    const alguma = saidas.saidas[0];
    assert.ok(alguma);
    provedorFake.chamadas = [];
    await ctx.api(A, "GET", `/empresas/${pizzaria.id}/saidas`);
    await ctx.api(A, "GET", `/empresas/${pizzaria.id}/saidas/${alguma.id}`);
    await ctx.api(P, "GET", "/entregas/saidas");
    assert.deepEqual(provedorFake.chamadas, [], "listar e abrir a saída não recalcula rota");
  });

  it("provedor fora do ar: a saída continua utilizável, sem números nem traçado inventados", async () => {
    provedorFake.modo = "falha";
    provedorFake.chamadas = [];
    const pedidos = [await pedidoProntoEm(B1, { latitude: -19.98, longitude: -43.88 }), await pedidoProntoEm(B2, { latitude: -19.99, longitude: -43.87 })];
    const criada = await criarSaida(pedidos.map((pedido) => pedido.id));
    assert.equal(criada.statusCode, 201, criada.body);
    const saida: SaidaEntrega = criada.json();

    assert.equal(saida.rota?.estado, "aproximacao_local");
    assert.equal(saida.rota?.motivoFallback, "provedor_indisponivel");
    assert.equal(saida.rota?.geometria, null);
    assert.equal(saida.rota?.distanciaMetros, null);
    assert.equal(saida.rota?.duracaoSegundos, null);
    assert.equal(rotaTemPercursoReal(saida.rota), false);
    // Nenhum pedido se perde e a operação segue: dá para iniciar a saída normalmente.
    assert.equal(ordemAtiva(saida).length, 2);
    assert.equal((await ctx.api(A, "POST", `/empresas/${pizzaria.id}/saidas/${saida.id}/liberar`)).statusCode, 200);
    assert.equal((await ctx.api(P, "POST", `/entregas/saidas/${saida.id}/iniciar`)).statusCode, 200);
    provedorFake.modo = "sucesso";
  });

  it("mudar a base depois NÃO reescreve a origem de uma saída já planejada", async () => {
    provedorFake.modo = "sucesso";
    const pedido = await pedidoProntoEm(B1, { latitude: -19.9, longitude: -43.94 });
    const saida: SaidaEntrega = (await criarSaida([pedido.id])).json();
    assert.deepEqual(saida.rota?.origem, BASE);

    // A empresa muda o ponto da base (mudança legítima, mas posterior ao planejamento).
    await ctx.banco.update(basesEmpresa).set({ latitude: -19.8, longitude: -43.8 }).where(eq(basesEmpresa.empresaId, pizzaria.id));
    provedorFake.origensRecebidas = [];
    const ordem = ordemAtiva(saida);
    await ctx.api(P, "PATCH", `/entregas/saidas/${saida.id}/sequencia`, { versaoSequencia: saida.versaoSequencia, pedidoIds: ordem });

    const depois = await obterSaida(saida.id);
    assert.deepEqual(depois.rota?.origem, BASE, "a saída continua descrevendo de onde ela partiu");
    if (provedorFake.origensRecebidas.length > 0) assert.deepEqual(provedorFake.origensRecebidas[0], BASE);
    await ctx.banco.update(basesEmpresa).set({ latitude: BASE.latitude, longitude: BASE.longitude }).where(eq(basesEmpresa.empresaId, pizzaria.id));
  });

  it("o consumo de roteamento fica registrado por empresa", async () => {
    const consumos = await ctx.banco.select().from(consumosRoteamento).where(eq(consumosRoteamento.empresaId, pizzaria.id));
    assert.ok(consumos.length > 0, "cada cálculo (ou recusa) vira uma linha de consumo");
    assert.ok(consumos.every((consumo) => consumo.empresaId === pizzaria.id));
    assert.ok(consumos.some((consumo) => consumo.operacao === "otimizacao"));
    assert.ok(consumos.some((consumo) => consumo.operacao === "percurso"));
    assert.ok(consumos.some((consumo) => consumo.resultado === "falha"), "a indisponibilidade também é registrada");
    // A padaria não gerou consumo nenhum: medição é por empresa.
    assert.equal((await ctx.banco.select().from(consumosRoteamento).where(eq(consumosRoteamento.empresaId, padaria.id))).length, 0);
  });
});

describe("quem pode ver a rota", () => {
  it("o entregador continua vendo a própria saída com a sequência e o percurso", async () => {
    const minhas = (await ctx.api(P, "GET", "/entregas/saidas")).json() as { saidas: SaidaEntrega[] };
    assert.ok(minhas.saidas.length > 0, "o acesso do entregador à própria saída não foi quebrado");
    assert.ok(minhas.saidas.some((saida) => saida.rota !== null));
  });

  it("o cliente não recebe rota, geometria nem nada das outras paradas", async () => {
    const pedido = await pedidoProntoEm(B1, { latitude: -19.905, longitude: -43.945 });
    const outro = await pedidoProntoEm(B2, { latitude: -19.906, longitude: -43.946 });
    const saida: SaidaEntrega = (await criarSaida([pedido.id, outro.id])).json();

    const fila: FilaDoPedido = (await ctx.api(B1, "GET", `/pedidos/${pedido.id}/fila`)).json();
    assert.deepEqual(Object.keys(fila).sort(), ["entregasAntes", "pedidoId", "situacao"]);
    // Nem a saída nem a rota são alcançáveis pelo cliente.
    assert.equal((await ctx.api(B1, "GET", `/entregas/saidas/${saida.id}`)).statusCode, 404);
    assert.equal((await ctx.api(B1, "GET", `/empresas/${pizzaria.id}/saidas/${saida.id}`)).statusCode, 404);
  });

  it("outra empresa não alcança a saída nem a rota da pizzaria", async () => {
    const saidas = (await ctx.api(A, "GET", `/empresas/${pizzaria.id}/saidas`)).json() as { saidas: SaidaEntrega[] };
    const alguma = saidas.saidas[0];
    assert.ok(alguma);
    assert.equal((await ctx.api(D, "GET", `/empresas/${pizzaria.id}/saidas/${alguma.id}`)).statusCode, 404);
    assert.equal((await ctx.api(D, "GET", `/empresas/${padaria.id}/saidas/${alguma.id}`)).statusCode, 404);
  });
});
