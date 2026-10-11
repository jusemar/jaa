/// <reference types="node" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SaidaEntrega } from "@jaa/contratos";
import { adotarSaidaNaOperacao, filtrarSaidasDaOperacao, formatarEspera, nomeDaRota, podeLiberarSaida, resumoDaRota, resumoDosPedidos, rotuloStatusSaida, tomDoStatusSaida } from "./operacao.ts";

const parada = (numeroPedido: number, encerradaEm: string | null = null) => ({ numeroPedido, encerradaEm }) as SaidaEntrega["paradas"][number];
const saida = (extra: Partial<SaidaEntrega>): SaidaEntrega => ({ id: "s1", status: "em_formacao", zonaPrincipal: null, zonasCombinadas: [], paradas: [], prazoFormacaoEm: null, liberadaEm: null, ...extra }) as SaidaEntrega;

describe("operação das rotas (empresa)", () => {
  it("os filtros agrupam os status como na Web", () => {
    const todas = [saida({ id: "a", status: "em_formacao" }), saida({ id: "b", status: "preparada" }), saida({ id: "c", status: "liberada_retirada" }), saida({ id: "d", status: "em_andamento" }), saida({ id: "e", status: "concluida" }), saida({ id: "f", status: "aguardando_entregador" })];
    assert.equal(filtrarSaidasDaOperacao(todas, "todos").length, 6);
    assert.deepEqual(filtrarSaidasDaOperacao(todas, "formacao").map((item) => item.id), ["a"]);
    assert.deepEqual(filtrarSaidasDaOperacao(todas, "retirada").map((item) => item.id), ["b", "c", "f"]);
    assert.deepEqual(filtrarSaidasDaOperacao(todas, "andamento").map((item) => item.id), ["d"]);
    assert.deepEqual(filtrarSaidasDaOperacao(todas, "concluidas").map((item) => item.id), ["e"]);
  });

  it("rótulo, tom e nome da rota", () => {
    assert.equal(rotuloStatusSaida({ status: "em_andamento" }), "Em entrega");
    assert.equal(tomDoStatusSaida("em_formacao"), "atencao");
    assert.equal(tomDoStatusSaida("liberada_retirada"), "marca");
    assert.equal(tomDoStatusSaida("concluida"), "neutro");
    assert.equal(nomeDaRota({ zonaPrincipal: null, zonasCombinadas: [] }), "Rota manual");
    assert.equal(nomeDaRota({ zonaPrincipal: { id: "z1", nome: "Centro" }, zonasCombinadas: [{ id: "z2", nome: "Leste" }] }), "Rota Centro + Leste");
  });

  it("resume os pedidos e o prazo da formação", () => {
    assert.equal(resumoDosPedidos([1, 2, 3, 4, 5]), "#1, #2, #3 +2");
    assert.equal(resumoDosPedidos([7]), "#7");
    const agora = new Date("2026-10-11T12:00:00.000Z");
    assert.equal(formatarEspera({ prazoFormacaoEm: null }, agora), "");
    assert.equal(formatarEspera({ prazoFormacaoEm: "2026-10-11T12:03:10.000Z" }, agora), "fecha em 4 min");
    assert.equal(formatarEspera({ prazoFormacaoEm: "2026-10-11T12:00:30.000Z" }, agora), "fecha em 1 min");
    assert.equal(formatarEspera({ prazoFormacaoEm: "2026-10-11T11:59:00.000Z" }, agora), "fechando…");
    assert.equal(resumoDaRota(saida({ status: "em_formacao", paradas: [parada(1), parada(2)], prazoFormacaoEm: "2026-10-11T12:02:00.000Z" }), 5, agora), "2 pedidos · Pedidos #1, #2 de 5 · fecha em 2 min");
    // Concluída conta todas as paradas; as demais, só as ativas.
    assert.equal(resumoDaRota(saida({ status: "concluida", paradas: [parada(1, "2026-10-11T11:00:00.000Z")] }), 5, agora), "1 pedido · Pedido #1");
    assert.equal(resumoDaRota(saida({ status: "em_andamento", paradas: [parada(1, "2026-10-11T11:00:00.000Z"), parada(2)] }), null, agora), "1 pedido · Pedido #2");
  });

  it("liberar só vale antes da liberação e antes de a rota sair", () => {
    assert.equal(podeLiberarSaida({ status: "em_formacao", liberadaEm: null }), true);
    assert.equal(podeLiberarSaida({ status: "preparada", liberadaEm: null }), true);
    assert.equal(podeLiberarSaida({ status: "aguardando_entregador", liberadaEm: "2026-10-11T11:00:00.000Z" }), false);
    assert.equal(podeLiberarSaida({ status: "liberada_retirada", liberadaEm: null }), false);
    assert.equal(podeLiberarSaida({ status: "em_andamento", liberadaEm: null }), false);
  });

  it("evento de rota substitui a conhecida ou entra no começo", () => {
    const lista = [saida({ id: "a" }), saida({ id: "b" })];
    assert.deepEqual(adotarSaidaNaOperacao(lista, saida({ id: "b", status: "concluida" })).map((item) => `${item.id}:${item.status}`), ["a:em_formacao", "b:concluida"]);
    assert.deepEqual(adotarSaidaNaOperacao(lista, saida({ id: "c" })).map((item) => item.id), ["c", "a", "b"]);
  });
});
