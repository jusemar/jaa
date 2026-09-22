import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CONFIGURACAO_DESPACHO_PADRAO,
  MAXIMO_PEDIDOS_POR_SAIDA_MAXIMO,
  TEMPO_FORMACAO_MAXIMO_MINUTOS,
  classificarPonto,
  configuracaoDespachoSchema,
  pontoDentroDaZona,
  salvarZonaEntradaSchema,
  zonaTemGeometriaValida,
  zonasSobrepoem,
  type PoligonoZona,
} from "./zonas.ts";

const uuid = (n: number) => `01a0a394-6225-75f2-b809-b26909935${String(n).padStart(3, "0")}`;

// Quadrado simples (lado ≈ 0,02°) para as verificações de dentro/fora.
const quadrado: PoligonoZona = [
  { latitude: -19.92, longitude: -43.95 },
  { latitude: -19.92, longitude: -43.93 },
  { latitude: -19.9, longitude: -43.93 },
  { latitude: -19.9, longitude: -43.95 },
];

// Encostado no anterior (divisa compartilhada em -43.93): zonas vizinhas são normais.
const vizinho: PoligonoZona = [
  { latitude: -19.92, longitude: -43.93 },
  { latitude: -19.92, longitude: -43.91 },
  { latitude: -19.9, longitude: -43.91 },
  { latitude: -19.9, longitude: -43.93 },
];

describe("polígono da zona", () => {
  it("exige ao menos 3 pontos e nome", () => {
    assert.equal(salvarZonaEntradaSchema.safeParse({ nome: "Centro", vertices: quadrado }).success, true);
    assert.equal(salvarZonaEntradaSchema.safeParse({ nome: "Centro", vertices: quadrado.slice(0, 2) }).success, false);
    assert.equal(salvarZonaEntradaSchema.safeParse({ nome: "  ", vertices: quadrado }).success, false);
    // Coordenada fora da faixa válida não vira zona.
    assert.equal(salvarZonaEntradaSchema.safeParse({ nome: "Centro", vertices: [...quadrado, { latitude: 91, longitude: 0 }] }).success, false);
  });

  it("recusa geometria degenerada ou com laço", () => {
    assert.equal(zonaTemGeometriaValida(quadrado), true);
    // Vértices repetidos em sequência.
    assert.equal(zonaTemGeometriaValida([quadrado[0] as never, quadrado[0] as never, quadrado[1] as never]), false);
    // Três pontos colineares: área nula.
    assert.equal(
      zonaTemGeometriaValida([
        { latitude: -19.92, longitude: -43.95 },
        { latitude: -19.91, longitude: -43.95 },
        { latitude: -19.9, longitude: -43.95 },
      ]),
      false,
    );
    // "Gravata": arestas que se cruzam tornariam "dentro da zona" ambíguo.
    assert.equal(
      zonaTemGeometriaValida([
        { latitude: -19.92, longitude: -43.95 },
        { latitude: -19.9, longitude: -43.93 },
        { latitude: -19.92, longitude: -43.93 },
        { latitude: -19.9, longitude: -43.95 },
      ]),
      false,
    );
  });
});

describe("ponto dentro da zona", () => {
  it("dentro, fora e na borda (borda conta como dentro, sempre igual)", () => {
    assert.equal(pontoDentroDaZona(quadrado, { latitude: -19.91, longitude: -43.94 }), true);
    assert.equal(pontoDentroDaZona(quadrado, { latitude: -19.95, longitude: -43.94 }), false);
    assert.equal(pontoDentroDaZona(quadrado, { latitude: -19.91, longitude: -43.95 }), true, "aresta");
    assert.equal(pontoDentroDaZona(quadrado, { latitude: -19.92, longitude: -43.95 }), true, "vértice");
  });

  it("ponto na divisa de duas zonas cai sempre na mesma (determinístico)", () => {
    const naDivisa = { latitude: -19.91, longitude: -43.93 };
    assert.equal(pontoDentroDaZona(quadrado, naDivisa), true);
    assert.equal(pontoDentroDaZona(vizinho, naDivisa), true);
    const zonas = [
      { id: uuid(2), nome: "Barreiro", vertices: vizinho, ativa: true },
      { id: uuid(1), nome: "Centro", vertices: quadrado, ativa: true },
    ];
    // A ordem estável (nome, id) faz a classificação repetir o mesmo resultado sempre.
    assert.equal(classificarPonto(zonas, naDivisa), uuid(2));
    assert.equal(classificarPonto([...zonas].reverse(), naDivisa), uuid(2));
  });
});

describe("sobreposição entre zonas", () => {
  it("zonas vizinhas que só dividem a fronteira são permitidas", () => {
    assert.equal(zonasSobrepoem(quadrado, vizinho), false);
  });

  it("área comum é bloqueada (classificação ficaria ambígua)", () => {
    const invasor: PoligonoZona = [
      { latitude: -19.915, longitude: -43.94 },
      { latitude: -19.915, longitude: -43.92 },
      { latitude: -19.905, longitude: -43.92 },
      { latitude: -19.905, longitude: -43.94 },
    ];
    assert.equal(zonasSobrepoem(quadrado, invasor), true);
    assert.equal(zonasSobrepoem(invasor, quadrado), true, "a verificação é simétrica");
  });

  it("zona idêntica a outra é sobreposição (a área seria a mesma)", () => {
    assert.equal(zonasSobrepoem(quadrado, [...quadrado]), true);
  });

  it("zona inteiramente dentro de outra também é sobreposição", () => {
    const dentro: PoligonoZona = [
      { latitude: -19.915, longitude: -43.945 },
      { latitude: -19.915, longitude: -43.935 },
      { latitude: -19.905, longitude: -43.935 },
      { latitude: -19.905, longitude: -43.945 },
    ];
    assert.equal(zonasSobrepoem(quadrado, dentro), true);
    assert.equal(zonasSobrepoem(dentro, quadrado), true);
  });
});

describe("classificação e configuração", () => {
  it("ponto fora de todas as zonas não recebe zona inventada", () => {
    const zonas = [{ id: uuid(1), nome: "Centro", vertices: quadrado, ativa: true }];
    assert.equal(classificarPonto(zonas, { latitude: -19.99, longitude: -43.99 }), null);
  });

  it("zona desativada não classifica pedido nenhum", () => {
    const zonas = [{ id: uuid(1), nome: "Centro", vertices: quadrado, ativa: false }];
    assert.equal(classificarPonto(zonas, { latitude: -19.91, longitude: -43.94 }), null);
  });

  it("quantidade e tempo são configuráveis, com limites seguros", () => {
    assert.deepEqual(CONFIGURACAO_DESPACHO_PADRAO, { maxPedidosPorSaida: 5, tempoFormacaoMinutos: 15, combinarZonas: true, liberacaoAutomatica: true });
    assert.equal(configuracaoDespachoSchema.safeParse({ maxPedidosPorSaida: 0, tempoFormacaoMinutos: 15, combinarZonas: true, liberacaoAutomatica: true }).success, false);
    assert.equal(
      configuracaoDespachoSchema.safeParse({ maxPedidosPorSaida: MAXIMO_PEDIDOS_POR_SAIDA_MAXIMO + 1, tempoFormacaoMinutos: 15, combinarZonas: true, liberacaoAutomatica: true }).success,
      false,
    );
    assert.equal(
      configuracaoDespachoSchema.safeParse({ maxPedidosPorSaida: 5, tempoFormacaoMinutos: TEMPO_FORMACAO_MAXIMO_MINUTOS + 1, combinarZonas: true, liberacaoAutomatica: true }).success,
      false,
    );
    assert.equal(configuracaoDespachoSchema.safeParse({ maxPedidosPorSaida: 5, tempoFormacaoMinutos: 1.5, combinarZonas: true, liberacaoAutomatica: true }).success, false);
  });
});
