import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { posicoesSaida } from "@jaa/banco/schema";
import {
  EVENTO_PEDIDO_ACOMPANHAMENTO,
  EVENTO_POSICAO_ENTREGADOR,
  posicaoEstaRecente,
  type AcompanhamentoPedido,
  type Empresa,
  type EventoPedidoAcompanhamento,
  type EventoPosicaoEntregador,
  type ListaPosicoes,
  type Pedido,
  type PosicaoEntregador,
  type Produto,
  type SaidaEntrega,
} from "@jaa/contratos";
import { eq } from "drizzle-orm";
import { aguardarAte, coletar, como, criarAmbienteIntegracao, type Pessoa } from "./apoio/integracao.js";
import { criarMotorDeRotas, type ParadaDeRota, type Percurso, type ProvedorRoteamento } from "../src/features/entregas/lib/motor-rotas.js";

/*
 * Integração REAL do RASTREAMENTO: só durante a saída em andamento, só do entregador dela, com a
 * empresa derivada no servidor. O cliente vê o entregador apenas quando a entrega dele é a atual.
 *
 * O provedor de rotas é um FAKE que CONTA chamadas: posição de GPS não pode virar chamada de rota.
 */

const PREFIXO = `gps${randomUUID().slice(0, 4)}`;

const provedorFake = {
  nome: "fake",
  maximoParadasOtimizacao: 11,
  maximoParadasPercurso: 24,
  chamadas: 0,
  async otimizarSequencia(_origem: { latitude: number; longitude: number }, paradas: ParadaDeRota[]) {
    this.chamadas += 1;
    return { ordem: paradas.map((parada) => parada.pedidoId) };
  },
  async calcularPercurso(origem: { latitude: number; longitude: number }, paradas: ParadaDeRota[]): Promise<Percurso> {
    this.chamadas += 1;
    return { geometria: [origem, ...paradas.map((parada) => parada.coordenadas)], distanciaMetros: 1000, duracaoSegundos: 300 };
  },
} satisfies ProvedorRoteamento & { chamadas: number };

const ctx = criarAmbienteIntegracao({
  telefones: ["+5531987655001", "+5531987655002", "+5531987655003", "+5531987655004", "+5531987655005", "+5531987655006"],
  prefixoIp: "198.18.18.",
  motorRotas: criarMotorDeRotas(provedorFake),
});

const BASE = { latitude: -19.9191, longitude: -43.9386 };
const PONTO = { latitude: -19.925, longitude: -43.935 };

let A: Pessoa;
let P: Pessoa;
let C: Pessoa;
let D: Pessoa;
let B1: Pessoa;
let B2: Pessoa;
let pizzaria: Empresa;
let padaria: Empresa;
let pizza: Produto;
let paulo = "";
let carlos = "";
let pauloNaPadaria = "";
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

// Saída pronta e JÁ INICIADA: é o único estado em que o rastreamento existe.
async function saidaEmAndamento(pedidos: Pedido[]): Promise<SaidaEntrega> {
  const criada = await ctx.api(A, "POST", `/empresas/${pizzaria.id}/saidas`, { entregadorId: paulo, pedidoIds: pedidos.map((pedido) => pedido.id) });
  assert.equal(criada.statusCode, 201, criada.body);
  const saida: SaidaEntrega = criada.json();
  assert.equal((await ctx.api(A, "POST", `/empresas/${pizzaria.id}/saidas/${saida.id}/liberar`)).statusCode, 200);
  const iniciada = await ctx.api(P, "POST", `/entregas/saidas/${saida.id}/iniciar`);
  assert.equal(iniciada.statusCode, 200, iniciada.body);
  return iniciada.json();
}

const enviarPosicao = (pessoa: Pessoa, saidaId: string, dados: Record<string, unknown> = {}) =>
  ctx.api(pessoa, "POST", `/entregas/saidas/${saidaId}/posicao`, {
    latitude: PONTO.latitude,
    longitude: PONTO.longitude,
    precisaoMetros: 12,
    capturadaEm: new Date().toISOString(),
    ...dados,
  });

before(async () => {
  await ctx.iniciar();
  A = await ctx.criarPessoa(0, `${PREFIXO}_a`, "Ana da Pizzaria");
  P = await ctx.criarPessoa(1, `${PREFIXO}_p`, "Paulo Entregador");
  C = await ctx.criarPessoa(2, `${PREFIXO}_c`, "Carlos Entregador");
  D = await ctx.criarPessoa(3, `${PREFIXO}_d`, "Dora da Padaria");
  B1 = await ctx.criarPessoa(4, `${PREFIXO}_b1`, "Bruna Um");
  B2 = await ctx.criarPessoa(5, `${PREFIXO}_b2`, "Bento Dois");

  pizzaria = (await ctx.api(A, "POST", "/empresas", { nome: "Pizzaria GPS", nomeUsuario: `${PREFIXO}_pizza`, slug: `${PREFIXO}-pizzaria` })).json();
  padaria = (await ctx.api(D, "POST", "/empresas", { nome: "Padaria GPS", nomeUsuario: `${PREFIXO}_pada`, slug: `${PREFIXO}-padaria` })).json();
  pizza = (await ctx.api(A, "POST", `/empresas/${pizzaria.id}/produtos`, { nome: "Pizza Calabresa", precoCentavos: 3990 })).json();
  for (const cliente of [B1, B2]) conversas.set(cliente.identidadeId, await ctx.abrirConversa(cliente, `${PREFIXO}_pizza`));

  paulo = await ctx.criarEntregadorAtivo(A, pizzaria.id, P, `${PREFIXO}_p`);
  carlos = await ctx.criarEntregadorAtivo(A, pizzaria.id, C, `${PREFIXO}_c`);
  // O mesmo Paulo também entrega para a padaria: as operações não podem se misturar.
  pauloNaPadaria = await ctx.criarEntregadorAtivo(D, padaria.id, P, `${PREFIXO}_p`);

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

describe("enviar posição", () => {
  it("o entregador da saída em andamento envia; a empresa e ele recebem em tempo real", async () => {
    const saida = await saidaEmAndamento([await pedidoProntoEm(B1, PONTO)]);
    const daEmpresa = coletar<EventoPosicaoEntregador>(await ctx.conectar(como(A, pizzaria.identidadeId)), EVENTO_POSICAO_ENTREGADOR);
    const doEntregador = coletar<EventoPosicaoEntregador>(await ctx.conectar(P), EVENTO_POSICAO_ENTREGADOR);

    const resposta = await enviarPosicao(P, saida.id);
    assert.equal(resposta.statusCode, 200, resposta.body);
    const posicao: PosicaoEntregador = resposta.json();
    assert.equal(posicao.saidaId, saida.id);
    assert.equal(posicao.latitude, PONTO.latitude);
    assert.ok(posicao.recebidaEm, "o servidor registra quando recebeu, além de quando o aparelho capturou");
    assert.equal(posicaoEstaRecente(posicao), true);

    await aguardarAte(() => daEmpresa.length > 0 && doEntregador.length > 0);
    assert.equal(daEmpresa[0]?.posicao.saidaId, saida.id);
  });

  it("outro entregador não envia posição de saída alheia", async () => {
    const saida = await saidaEmAndamento([await pedidoProntoEm(B1, PONTO)]);
    assert.equal((await enviarPosicao(C, saida.id)).statusCode, 404, "saída de outro entregador é indistinguível de inexistente");
    // O cliente e a empresa também não "enviam posição" por ele.
    assert.equal((await enviarPosicao(B1, saida.id)).statusCode, 404);
    assert.equal((await enviarPosicao(A, saida.id)).statusCode, 404);
  });

  it("fora da operação não há rastreamento: saída não iniciada ou já concluída recusa a posição", async () => {
    const pedido = await pedidoProntoEm(B1, PONTO);
    const preparada: SaidaEntrega = (await ctx.api(A, "POST", `/empresas/${pizzaria.id}/saidas`, { entregadorId: paulo, pedidoIds: [pedido.id] })).json();
    const antes = await enviarPosicao(P, preparada.id);
    assert.equal(antes.statusCode, 409);
    assert.equal(antes.json().codigo, "SAIDA_NAO_ESTA_EM_ANDAMENTO");

    assert.equal((await ctx.api(A, "POST", `/empresas/${pizzaria.id}/saidas/${preparada.id}/liberar`)).statusCode, 200);
    await ctx.api(P, "POST", `/entregas/saidas/${preparada.id}/iniciar`);
    assert.equal((await enviarPosicao(P, preparada.id)).statusCode, 200);

    // Entrega concluída → saída concluída → rastreamento acaba e a posição é esquecida.
    await avancar(pedido.id, "saiu_para_entrega");
    const depois = await enviarPosicao(P, preparada.id);
    assert.equal(depois.statusCode, 409);
    assert.equal(depois.json().codigo, "SAIDA_NAO_ESTA_EM_ANDAMENTO", "posição atrasada depois do fim é recusada");
    assert.equal((await ctx.banco.select().from(posicoesSaida).where(eq(posicoesSaida.saidaId, preparada.id))).length, 0, "nada guardado depois da operação");
  });

  it("leitura inválida é recusada e não substitui a posição atual", async () => {
    const saida = await saidaEmAndamento([await pedidoProntoEm(B2, PONTO)]);
    assert.equal((await enviarPosicao(P, saida.id)).statusCode, 200);

    for (const invalida of [
      { latitude: 91 },
      { longitude: -181 },
      { capturadaEm: "ontem" },
      { precisaoMetros: 900 },
      { capturadaEm: new Date(Date.now() - 30 * 60_000).toISOString() },
      { capturadaEm: new Date(Date.now() + 10 * 60_000).toISOString() },
    ]) {
      const resposta = await enviarPosicao(P, saida.id, invalida);
      assert.ok([400, 409].includes(resposta.statusCode), `${JSON.stringify(invalida)} → ${resposta.statusCode}`);
    }
    const atual = (await ctx.api(P, "GET", `/entregas/saidas/${saida.id}/posicao`)).json();
    assert.equal(atual.posicao.latitude, PONTO.latitude, "a posição válida permanece");
  });

  it("posição antiga (fora de ordem) nunca sobrescreve a mais nova", async () => {
    const saida = await saidaEmAndamento([await pedidoProntoEm(B1, PONTO)]);
    const agora = new Date();
    assert.equal((await enviarPosicao(P, saida.id, { capturadaEm: agora.toISOString(), latitude: -19.93 })).statusCode, 200);

    const atrasada = await enviarPosicao(P, saida.id, { capturadaEm: new Date(agora.getTime() - 30_000).toISOString(), latitude: -19.94 });
    assert.equal(atrasada.statusCode, 202, "chegou atrasada: aceita a requisição, mas não aplica");
    assert.equal(atrasada.json().aplicada, false);

    const atual = (await ctx.api(P, "GET", `/entregas/saidas/${saida.id}/posicao`)).json();
    assert.equal(atual.posicao.latitude, -19.93, "a posição mais nova permanece");
  });

  it("nenhuma atualização de GPS chama o provedor de rotas", async () => {
    const saida = await saidaEmAndamento([await pedidoProntoEm(B1, PONTO)]);
    const chamadasAntes = provedorFake.chamadas;
    for (let i = 0; i < 5; i++) {
      await enviarPosicao(P, saida.id, { latitude: -19.92 - i / 1000, capturadaEm: new Date(Date.now() + i * 1000).toISOString() });
    }
    assert.equal(provedorFake.chamadas, chamadasAntes, "GPS não recalcula rota: são responsabilidades separadas");
  });
});

describe("quem vê a posição", () => {
  it("a empresa vê as posições das saídas EM ANDAMENTO dela — e só delas", async () => {
    const saida = await saidaEmAndamento([await pedidoProntoEm(B1, PONTO)]);
    assert.equal((await enviarPosicao(P, saida.id)).statusCode, 200);

    const lista: ListaPosicoes = (await ctx.api(A, "GET", `/empresas/${pizzaria.id}/posicoes`)).json();
    assert.ok(lista.posicoes.some((posicao) => posicao.saidaId === saida.id));

    // Outra empresa não alcança nada — nem a lista, nem a saída, nem a posição.
    assert.equal((await ctx.api(D, "GET", `/empresas/${pizzaria.id}/posicoes`)).statusCode, 404);
    assert.equal((await ctx.api(D, "GET", `/empresas/${pizzaria.id}/saidas/${saida.id}/posicao`)).statusCode, 404);
    assert.equal((await ctx.api(D, "GET", `/empresas/${padaria.id}/saidas/${saida.id}/posicao`)).statusCode, 404);
    const daPadaria: ListaPosicoes = (await ctx.api(D, "GET", `/empresas/${padaria.id}/posicoes`)).json();
    assert.deepEqual(daPadaria.posicoes, [], "o mesmo entregador em outra empresa não vaza posição");
  });

  it("o entregador de múltiplas empresas mantém isolamento por saída", async () => {
    const saida = await saidaEmAndamento([await pedidoProntoEm(B1, PONTO)]);
    // O vínculo dele na padaria não dá acesso à saída da pizzaria por outra empresa.
    assert.equal((await ctx.api(D, "GET", `/empresas/${padaria.id}/saidas/${saida.id}/posicao`)).statusCode, 404);
    assert.ok(pauloNaPadaria.length > 0);
    assert.equal(carlos.length > 0, true);
  });

  it("o cliente vê o entregador só quando é a vez dele — e nunca as outras paradas", async () => {
    const meu = await pedidoProntoEm(B1, PONTO);
    const doOutro = await pedidoProntoEm(B2, { latitude: -19.95, longitude: -43.9 });
    const saida = await saidaEmAndamento([meu, doOutro]);
    const ativos = saida.paradas.filter((parada) => parada.encerradaEm === null).sort((a, b) => a.posicao - b.posicao);
    const primeiro = ativos[0]?.pedidoId === meu.id ? { cliente: B1, pedido: meu } : { cliente: B2, pedido: doOutro };
    const segundo = ativos[0]?.pedidoId === meu.id ? { cliente: B2, pedido: doOutro } : { cliente: B1, pedido: meu };

    const eventosDoSegundo = coletar<EventoPedidoAcompanhamento>(await ctx.conectar(segundo.cliente), EVENTO_PEDIDO_ACOMPANHAMENTO);
    assert.equal((await enviarPosicao(P, saida.id)).statusCode, 200);

    const doPrimeiro: AcompanhamentoPedido = (await ctx.api(primeiro.cliente, "GET", `/pedidos/${primeiro.pedido.id}/acompanhamento`)).json();
    assert.equal(doPrimeiro.fila.situacao, "indo_ate_voce");
    assert.ok(doPrimeiro.posicaoEntregador, "quem é a parada atual acompanha o entregador");
    assert.deepEqual(Object.keys(doPrimeiro.posicaoEntregador ?? {}).sort(), ["capturadaEm", "latitude", "longitude"], "só o ponto: nada de saída, entregador ou paradas");

    const doSegundo: AcompanhamentoPedido = (await ctx.api(segundo.cliente, "GET", `/pedidos/${segundo.pedido.id}/acompanhamento`)).json();
    assert.equal(doSegundo.fila.situacao, "na_fila");
    assert.equal(doSegundo.posicaoEntregador, null, "ainda não é a vez dele: não vê o entregador");
    assert.equal(doSegundo.fila.entregasAntes, 1, "ele continua vendo só quantas entregas há antes");
    assert.equal(eventosDoSegundo.length, 0, "e não recebe evento de posição nenhum");

    // Nenhum cliente alcança a saída, as paradas ou a posição bruta.
    assert.equal((await ctx.api(segundo.cliente, "GET", `/entregas/saidas/${saida.id}/posicao`)).statusCode, 404);
    assert.equal((await ctx.api(segundo.cliente, "GET", `/empresas/${pizzaria.id}/posicoes`)).statusCode, 404);
  });

  it("posição velha não é apresentada ao cliente como atual", async () => {
    const meu = await pedidoProntoEm(B1, PONTO);
    const saida = await saidaEmAndamento([meu]);
    assert.equal((await enviarPosicao(P, saida.id)).statusCode, 200);
    assert.ok(((await ctx.api(B1, "GET", `/pedidos/${meu.id}/acompanhamento`)).json() as AcompanhamentoPedido).posicaoEntregador);

    // Envelhece a captura no banco: o servidor passa a tratar como desatualizada.
    await ctx.banco.update(posicoesSaida).set({ capturadaEm: new Date(Date.now() - 10 * 60_000) }).where(eq(posicoesSaida.saidaId, saida.id));
    const envelhecido: AcompanhamentoPedido = (await ctx.api(B1, "GET", `/pedidos/${meu.id}/acompanhamento`)).json();
    assert.equal(envelhecido.posicaoEntregador, null, "posição antiga não vira 'onde ele está agora'");
    assert.equal(envelhecido.fila.situacao, "indo_ate_voce", "a fila continua funcionando normalmente");
  });

  it("reconexão recupera a última posição permitida sem depender do evento", async () => {
    const saida = await saidaEmAndamento([await pedidoProntoEm(B2, PONTO)]);
    assert.equal((await enviarPosicao(P, saida.id, { latitude: -19.921 })).statusCode, 200);

    // Empresa e entregador consultam o estado atual; o cliente consulta o acompanhamento dele.
    assert.equal(((await ctx.api(A, "GET", `/empresas/${pizzaria.id}/saidas/${saida.id}/posicao`)).json() as { posicao: PosicaoEntregador }).posicao.latitude, -19.921);
    assert.equal(((await ctx.api(P, "GET", `/entregas/saidas/${saida.id}/posicao`)).json() as { posicao: PosicaoEntregador }).posicao.latitude, -19.921);
    const doCliente: AcompanhamentoPedido = (await ctx.api(B2, "GET", `/pedidos/${saida.paradas[0]?.pedidoId}/acompanhamento`)).json();
    assert.ok(doCliente.posicaoEntregador);
  });
});
