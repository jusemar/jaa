import "./apoio/exigir-banco-de-teste.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { saidasEntrega } from "@jaa/banco/schema";
import {
  EVENTO_PEDIDO_FILA,
  EVENTO_PEDIDO_STATUS_ATUALIZADO,
  EVENTO_SAIDA_ATUALIZADA,
  type Empresa,
  type EventoPedidoFila,
  type EventoPedidoStatusAtualizado,
  type EventoSaidaAtualizada,
  type FilaDoPedido,
  type ListaSaidas,
  type ListaZonas,
  type Pedido,
  type Produto,
  type SaidaEntrega,
  type ZonaEntrega,
} from "@jaa/contratos";
import { eq } from "drizzle-orm";
import { processarFormacoesVencidas } from "../src/features/entregas/casos-de-uso/despacho-automatico.js";
import { aguardarAte, coletar, criarAmbienteIntegracao, esperar, type Pessoa } from "./apoio/integracao.js";

/*
 * REGRESSÃO DO CENÁRIO REAL: dois clientes, dois pedidos, duas zonas que PODEM COMBINAR (C ↔ D).
 *
 * O que precisa valer, sempre:
 * - "pode combinar" junta os pedidos numa MESMA rota (quando o prazo da formação vence e há vaga) —
 *   e então a rota tem DUAS paradas distintas, cada uma com o seu pedido; nenhum pedido some;
 * - a rota chega ao entregador com as duas paradas;
 * - "Sair para entrega" é da ROTA: os dois pedidos saem para entrega (é o mesmo veículo);
 * - "Marcar como entregue" é da PARADA: entrega só aquele pedido, e só o da vez. O outro continua
 *   "saiu para entrega" até a parada dele ser concluída;
 * - cada cliente recebe só os eventos do PRÓPRIO pedido.
 *
 * A = dona da pizzaria; E = entregador; CA = cliente do pedido A (zona C); CB = cliente do pedido B (zona D).
 */

const PREFIXO = `duo${randomUUID().slice(0, 4)}`;
const ctx = criarAmbienteIntegracao({
  telefones: ["+5531987699001", "+5531987699002", "+5531987699003", "+5531987699004", "+5531987699005"],
  prefixoIp: "198.18.99.",
});

// Zona C e Zona D: quadrados vizinhos (dividem a divisa, sem área comum).
const ZONA_C = [
  { latitude: -19.93, longitude: -43.95 },
  { latitude: -19.93, longitude: -43.93 },
  { latitude: -19.91, longitude: -43.93 },
  { latitude: -19.91, longitude: -43.95 },
];
const ZONA_D = [
  { latitude: -19.93, longitude: -43.93 },
  { latitude: -19.93, longitude: -43.91 },
  { latitude: -19.91, longitude: -43.91 },
  { latitude: -19.91, longitude: -43.93 },
];
const PONTO_C = { latitude: -19.92, longitude: -43.94 };
const PONTO_D = { latitude: -19.92, longitude: -43.92 };

let A: Pessoa;
let E: Pessoa;
let CA: Pessoa;
let CB: Pessoa;
let CX: Pessoa;
let pizzaria: Empresa;
let pizza: Produto;
let entregador = "";
let zonaC: ZonaEntrega;
let zonaD: ZonaEntrega;
const conversas = new Map<string, string>();

const despacho = () => ({ banco: ctx.banco, eventosEntregas: ctx.eventosEntregas });
const pedidoAtual = async (pedidoId: string): Promise<Pedido> => (await ctx.api(A, "GET", `/empresas/${pizzaria.id}/pedidos/${pedidoId}`)).json();
const listarSaidas = async (): Promise<SaidaEntrega[]> => ((await ctx.api(A, "GET", `/empresas/${pizzaria.id}/saidas`)).json() as ListaSaidas).saidas;
const saidaDoPedido = async (pedidoId: string) => (await listarSaidas()).find((saida) => saida.paradas.some((parada) => parada.pedidoId === pedidoId && parada.encerradaEm === null)) ?? null;
const saidasDoEntregador = async (): Promise<SaidaEntrega[]> => ((await ctx.api(E, "GET", "/entregas/saidas")).json() as ListaSaidas).saidas;
const filaDe = async (cliente: Pessoa, pedidoId: string): Promise<FilaDoPedido> => (await ctx.api(cliente, "GET", `/pedidos/${pedidoId}/fila`)).json();
const ativas = (saida: SaidaEntrega) => saida.paradas.filter((parada) => parada.encerradaEm === null).sort((a, b) => a.posicao - b.posicao);

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
  for (const statusAtual of ["recebido", "em_preparacao"] as const) {
    const avanco = await ctx.api(A, "POST", `/empresas/${pizzaria.id}/pedidos/${pedido.id}/avancar`, { statusAtual });
    assert.equal(avanco.statusCode, 200, avanco.body);
    pedido = avanco.json();
  }
  return pedido;
}

// O "relógio controlável" do fechamento por tempo: empurra o prazo gravado para o passado.
async function vencerFormacao(saidaId: string) {
  await ctx.banco.update(saidasEntrega).set({ prazoFormacaoEm: new Date(Date.now() - 60_000), formacaoIniciadaEm: new Date(Date.now() - 120_000) }).where(eq(saidasEntrega.id, saidaId));
}

async function entrarNaBase() {
  for (let vez = 0; vez < 2; vez += 1) {
    const resposta = await ctx.api(E, "POST", `/entregas/vinculos/${entregador}/localizacao`, { latitude: -19.9, longitude: -43.9, precisaoMetros: 10, medidaEm: new Date().toISOString() });
    assert.equal(resposta.statusCode, 200, resposta.body);
  }
}

/** Dois pedidos prontos, um em cada zona, combinados na mesma rota e despachados ao entregador. */
async function rotaCombinada(clienteA: Pessoa, clienteB: Pessoa) {
  const pedidoA = await pedidoProntoEm(clienteA, PONTO_C);
  const pedidoB = await pedidoProntoEm(clienteB, PONTO_D);
  const formacaoC = await saidaDoPedido(pedidoA.id);
  const formacaoD = await saidaDoPedido(pedidoB.id);
  assert.ok(formacaoC && formacaoD, "os dois pedidos entram na operação: nenhum some");
  assert.notEqual(formacaoC.id, formacaoD.id, "zonas diferentes começam em formações diferentes");
  assert.equal(formacaoC.zonaPrincipal?.id, zonaC.id);
  assert.equal(formacaoD.zonaPrincipal?.id, zonaD.id);
  assert.deepEqual([formacaoC.status, formacaoD.status], ["em_formacao", "em_formacao"]);

  // Prazo da zona C venceu, com vaga: a zona D (compatível) entra na MESMA rota.
  await vencerFormacao(formacaoC.id);
  await processarFormacoesVencidas(despacho());
  await entrarNaBase();
  const rota = await saidaDoPedido(pedidoA.id);
  assert.ok(rota);
  return { pedidoA, pedidoB, rota, formacaoD };
}

before(async () => {
  await ctx.iniciar();
  A = await ctx.criarPessoa(0, `${PREFIXO}_a`, "Ana da Pizzaria");
  E = await ctx.criarPessoa(1, `${PREFIXO}_e`, "Edu Entregador");
  CA = await ctx.criarPessoa(2, `${PREFIXO}_ca`, "Cliente A");
  CB = await ctx.criarPessoa(3, `${PREFIXO}_cb`, "Cliente B");
  CX = await ctx.criarPessoa(4, `${PREFIXO}_cx`, "Cliente X");
  pizzaria = (await ctx.api(A, "POST", "/empresas", { nome: "Pizzaria Duas Zonas", nomeUsuario: `${PREFIXO}_pizza`, slug: `${PREFIXO}-pizzaria` })).json();
  pizza = (await ctx.api(A, "POST", `/empresas/${pizzaria.id}/produtos`, { nome: "Pizza Calabresa", precoCentavos: 3990 })).json();
  for (const cliente of [CA, CB, CX]) conversas.set(cliente.identidadeId, await ctx.abrirConversa(cliente, `${PREFIXO}_pizza`));
  entregador = await ctx.criarEntregadorAtivo(A, pizzaria.id, E, `${PREFIXO}_e`);

  await ctx.api(A, "POST", `/empresas/${pizzaria.id}/base`, { cep: "30123-000", logradouro: "Avenida Afonso Pena", numero: "1000", bairro: "Centro", cidade: "Belo Horizonte", uf: "MG", raioMetros: 150 });
  await ctx.api(A, "POST", `/empresas/${pizzaria.id}/base/localizacao`, { latitude: -19.9, longitude: -43.9 });

  zonaC = (await ctx.api(A, "POST", `/empresas/${pizzaria.id}/zonas`, { nome: "zona C", vertices: ZONA_C })).json();
  zonaD = (await ctx.api(A, "POST", `/empresas/${pizzaria.id}/zonas`, { nome: "zona D", vertices: ZONA_D })).json();
  // A mesma configuração do teste real: no máximo 2 pedidos por saída, combinar ligado, liberação automática.
  const configurada = await ctx.api(A, "POST", `/empresas/${pizzaria.id}/despacho`, { maxPedidosPorSaida: 2, tempoFormacaoMinutos: 2, combinarZonas: true, liberacaoAutomatica: true });
  assert.equal(configurada.statusCode, 200, configurada.body);
});

after(() => ctx.encerrar());

describe("zonas C e D que podem combinar: dois pedidos, uma rota, duas paradas", () => {
  it("a compatibilidade é recíproca: marcar em C vale para D, e marcar em D vale para C", async () => {
    const emC = await ctx.api(A, "POST", `/empresas/${pizzaria.id}/zonas/${zonaC.id}/compatibilidades`, { zonaIds: [zonaD.id] });
    assert.equal(emC.statusCode, 200, emC.body);
    const zonas = (emC.json() as ListaZonas).zonas;
    assert.deepEqual(zonas.find((zona) => zona.id === zonaC.id)?.compativeisCom, [zonaD.id]);
    assert.deepEqual(zonas.find((zona) => zona.id === zonaD.id)?.compativeisCom, [zonaC.id]);
    // Marcar de novo pelo outro lado (como na tela) não duplica nem desfaz.
    const emD = await ctx.api(A, "POST", `/empresas/${pizzaria.id}/zonas/${zonaD.id}/compatibilidades`, { zonaIds: [zonaC.id] });
    assert.deepEqual((emD.json() as ListaZonas).zonas.find((zona) => zona.id === zonaC.id)?.compativeisCom, [zonaD.id]);
  });

  it("os dois pedidos viram UMA rota com DUAS paradas; sair é da rota, entregar é de cada parada", async () => {
    const [socketA, socketB, socketE] = await Promise.all([ctx.conectar(CA), ctx.conectar(CB), ctx.conectar(E)]);
    const statusDeA = coletar<EventoPedidoStatusAtualizado>(socketA, EVENTO_PEDIDO_STATUS_ATUALIZADO);
    const statusDeB = coletar<EventoPedidoStatusAtualizado>(socketB, EVENTO_PEDIDO_STATUS_ATUALIZADO);
    const filaDeA = coletar<EventoPedidoFila>(socketA, EVENTO_PEDIDO_FILA);
    const filaDeB = coletar<EventoPedidoFila>(socketB, EVENTO_PEDIDO_FILA);
    const rotasDoEntregador = coletar<EventoSaidaAtualizada>(socketE, EVENTO_SAIDA_ATUALIZADA);

    const { pedidoA, pedidoB, rota, formacaoD } = await rotaCombinada(CA, CB);

    // UMA rota, DUAS paradas distintas, cada uma com o próprio pedido.
    const paradas = ativas(rota);
    assert.equal(paradas.length, 2);
    assert.deepEqual(paradas.map((parada) => parada.pedidoId).sort(), [pedidoA.id, pedidoB.id].sort());
    assert.notEqual(paradas[0]?.id, paradas[1]?.id);
    assert.equal((await saidaDoPedido(pedidoB.id))?.id, rota.id, "o pedido da zona D foi para a mesma rota — não sumiu");
    assert.ok(rota.zonasCombinadas.some((zona) => zona.id === zonaD.id), "a rota diz que combinou a zona D");
    // A formação de origem não fica com parada pendurada.
    assert.equal((await listarSaidas()).find((saida) => saida.id === formacaoD.id)?.paradas.filter((parada) => parada.encerradaEm === null).length ?? 0, 0);

    // O ENTREGADOR recebe a rota com as DUAS paradas, liberada (pela API e em tempo real).
    assert.equal(rota.status, "liberada_retirada");
    const noApp = (await saidasDoEntregador()).find((saida) => saida.id === rota.id);
    assert.ok(noApp, "a rota aparece para o entregador");
    assert.deepEqual(ativas(noApp).map((parada) => parada.pedidoId), paradas.map((parada) => parada.pedidoId), "com as duas paradas, na mesma ordem");
    await aguardarAte(() => rotasDoEntregador.some((evento) => evento.saida.id === rota.id && ativas(evento.saida).length === 2));
    // Antes de sair, ninguém foi entregue nem saiu: os dois continuam PRONTOS.
    assert.deepEqual([(await pedidoAtual(pedidoA.id)).status, (await pedidoAtual(pedidoB.id)).status], ["pronto", "pronto"]);

    // SAIR PARA ENTREGA é da rota: os dois pedidos saem juntos — e nenhum é entregue por isso.
    assert.equal((await ctx.api(E, "POST", `/entregas/saidas/${rota.id}/iniciar`)).statusCode, 200);
    assert.deepEqual([(await pedidoAtual(pedidoA.id)).status, (await pedidoAtual(pedidoB.id)).status], ["saiu_para_entrega", "saiu_para_entrega"]);

    const [primeira, segunda] = paradas as [(typeof paradas)[number], (typeof paradas)[number]];
    const clienteDa = (pedidoId: string) => (pedidoId === pedidoA.id ? CA : CB);
    assert.equal((await filaDe(clienteDa(primeira.pedidoId), primeira.pedidoId)).situacao, "indo_ate_voce");
    assert.deepEqual(await filaDe(clienteDa(segunda.pedidoId), segunda.pedidoId), { pedidoId: segunda.pedidoId, situacao: "na_fila", entregasAntes: 1 });

    // Tentar entregar a SEGUNDA antes da primeira é recusado — e não mexe em nenhum dos dois pedidos.
    const foraDaVez = await ctx.api(E, "POST", `/entregas/saidas/${rota.id}/paradas/${segunda.pedidoId}/concluir`);
    assert.equal(foraDaVez.statusCode, 409, foraDaVez.body);
    assert.deepEqual([(await pedidoAtual(primeira.pedidoId)).status, (await pedidoAtual(segunda.pedidoId)).status], ["saiu_para_entrega", "saiu_para_entrega"]);

    // ENTREGAR A PRIMEIRA entrega SÓ a primeira.
    assert.equal((await ctx.api(E, "POST", `/entregas/saidas/${rota.id}/paradas/${primeira.pedidoId}/concluir`)).statusCode, 200);
    assert.equal((await pedidoAtual(primeira.pedidoId)).status, "entregue");
    assert.equal((await pedidoAtual(segunda.pedidoId)).status, "saiu_para_entrega", "o outro pedido NÃO recebe baixa");
    const depoisDaPrimeira = (await saidasDoEntregador()).find((saida) => saida.id === rota.id);
    assert.ok(depoisDaPrimeira);
    assert.equal(depoisDaPrimeira.status, "em_andamento", "a rota continua: ainda falta uma parada");
    assert.deepEqual(ativas(depoisDaPrimeira).map((parada) => parada.pedidoId), [segunda.pedidoId]);
    assert.equal((await filaDe(clienteDa(segunda.pedidoId), segunda.pedidoId)).situacao, "indo_ate_voce", "agora é a vez do segundo");
    // Repetir a entrega da primeira não "anda" para a segunda.
    assert.equal((await ctx.api(E, "POST", `/entregas/saidas/${rota.id}/paradas/${primeira.pedidoId}/concluir`)).statusCode, 409);
    assert.equal((await pedidoAtual(segunda.pedidoId)).status, "saiu_para_entrega");

    // Só ao concluir a SEGUNDA ela é entregue, e a rota termina.
    assert.equal((await ctx.api(E, "POST", `/entregas/saidas/${rota.id}/paradas/${segunda.pedidoId}/concluir`)).statusCode, 200);
    assert.equal((await pedidoAtual(segunda.pedidoId)).status, "entregue");
    const todas = ((await ctx.api(A, "GET", `/empresas/${pizzaria.id}/saidas?ativas=false`)).json() as ListaSaidas).saidas;
    assert.equal(todas.find((saida) => saida.id === rota.id)?.status, "concluida");
    // Histórico de cada pedido: um passo por vez, sem etapa a mais nem a menos.
    for (const pedidoId of [pedidoA.id, pedidoB.id]) {
      assert.deepEqual((await pedidoAtual(pedidoId)).historico.map((evento) => evento.status), ["recebido", "em_preparacao", "pronto", "saiu_para_entrega", "entregue"]);
    }

    // REALTIME: cada cliente recebe os estados do PRÓPRIO pedido — nunca os do outro.
    await aguardarAte(() => statusDeA.some((evento) => evento.pedido.status === "entregue") && statusDeB.some((evento) => evento.pedido.status === "entregue"));
    await esperar(200);
    assert.ok(statusDeA.length > 0 && statusDeA.every((evento) => evento.pedido.id === pedidoA.id), "cliente A só recebe o pedido A");
    assert.ok(statusDeB.length > 0 && statusDeB.every((evento) => evento.pedido.id === pedidoB.id), "cliente B só recebe o pedido B");
    assert.ok(filaDeA.length > 0 && filaDeA.every((evento) => evento.pedidoId === pedidoA.id));
    assert.ok(filaDeB.length > 0 && filaDeB.every((evento) => evento.pedidoId === pedidoB.id));
    for (const socket of [socketA, socketB, socketE]) socket.disconnect();
  });

  it("recusar a rota combinada não dá baixa em pedido nenhum — nem nos dela, nem em um pedido de fora", async () => {
    const { pedidoA, pedidoB, rota } = await rotaCombinada(CA, CB);
    // Um pedido que não tem nada a ver com esta rota: chegou depois, está em outra formação.
    const deFora = await pedidoProntoEm(CX, PONTO_C);
    const formacaoDeFora = await saidaDoPedido(deFora.id);
    assert.ok(formacaoDeFora && formacaoDeFora.id !== rota.id, "rota fechada não recebe pedido novo");

    assert.equal(rota.status, "liberada_retirada");
    assert.equal((await ctx.api(E, "POST", `/entregas/saidas/${rota.id}/recusar`)).statusCode, 200);

    // Os pedidos da rota continuam PRONTOS e NA rota (que volta a esperar entregador); nada foi entregue.
    assert.deepEqual([(await pedidoAtual(pedidoA.id)).status, (await pedidoAtual(pedidoB.id)).status], ["pronto", "pronto"]);
    const recusada = (await listarSaidas()).find((saida) => saida.id === rota.id);
    assert.ok(recusada);
    assert.equal(ativas(recusada).length, 2, "as duas paradas continuam na rota");
    assert.notEqual(recusada.status, "concluida");
    // O pedido de fora não foi tocado: mesmo status, mesma formação.
    assert.equal((await pedidoAtual(deFora.id)).status, "pronto");
    assert.equal((await saidaDoPedido(deFora.id))?.id, formacaoDeFora.id);
    // E o entregador não consegue mais agir sobre a rota que recusou.
    assert.equal((await ctx.api(E, "POST", `/entregas/saidas/${rota.id}/iniciar`)).statusCode, 404);
  });
});
