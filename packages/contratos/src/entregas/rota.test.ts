import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatarDistanciaRota,
  formatarDuracaoPercurso,
  rotaCobreSequenciaAtual,
  rotaDaSaidaSchema,
  rotaTemPercursoReal,
  rotuloRota,
  type RotaDaSaida,
} from "./rota.ts";

const rota = (dados: Partial<RotaDaSaida> = {}): RotaDaSaida => ({
  estado: "percurso_real",
  motivoFallback: null,
  provedor: "mapbox",
  origem: { latitude: -19.9191, longitude: -43.9386 },
  sequenciaDoProvedor: true,
  geometria: [
    { latitude: -19.9191, longitude: -43.9386 },
    { latitude: -19.93, longitude: -43.93 },
  ],
  distanciaMetros: 5300,
  duracaoSegundos: 840,
  calculadaEm: "2026-09-16T12:00:00.000Z",
  versaoSequencia: 2,
  ...dados,
});

describe("rota da saída", () => {
  it("percurso real exige traçado de verdade", () => {
    assert.equal(rotaTemPercursoReal(rota()), true);
    assert.equal(rotaTemPercursoReal(rota({ geometria: null })), false);
    assert.equal(rotaTemPercursoReal(rota({ estado: "aproximacao_local" })), false);
    assert.equal(rotaTemPercursoReal(null), false);
  });

  it("reordenar a sequência envelhece o percurso", () => {
    assert.equal(rotaCobreSequenciaAtual(rota(), 2), true);
    assert.equal(rotaCobreSequenciaAtual(rota(), 3), false);
    assert.equal(rotaCobreSequenciaAtual(null, 1), false);
  });

  it("o contrato aceita o fallback sem números (e ele é o esperado)", () => {
    const fallback = rotaDaSaidaSchema.parse(
      rota({ estado: "aproximacao_local", motivoFallback: "provedor_indisponivel", provedor: null, geometria: null, distanciaMetros: null, duracaoSegundos: null }),
    );
    assert.equal(fallback.distanciaMetros, null);
    assert.equal(rotuloRota(fallback, 2), "Sequência sugerida pelo Jaa (sem cálculo de percurso)");
  });

  it("os rótulos falam em trajeto, nunca em melhor rota ou previsão de entrega", () => {
    const rotulo = rotuloRota(rota(), 2);
    assert.ok(rotulo.includes("Percurso calculado pelas ruas"));
    assert.ok(rotulo.includes("de trajeto"));
    for (const proibido of ["melhor rota", "mais rápida", "previsão", "chega às"]) {
      assert.equal(rotulo.toLowerCase().includes(proibido), false, proibido);
    }
    assert.equal(rotuloRota(rota(), 3), "Sequência alterada: percurso será recalculado");
    assert.equal(rotuloRota(null, 1), "Sequência sugerida pelo Jaa");
  });

  it("formata distância e duração de forma legível", () => {
    assert.equal(formatarDistanciaRota(850), "850 m");
    assert.equal(formatarDistanciaRota(5321), "5,3 km");
    assert.equal(formatarDuracaoPercurso(30), "1 min");
    assert.equal(formatarDuracaoPercurso(840), "14 min");
    assert.equal(formatarDuracaoPercurso(3600), "1 h");
    assert.equal(formatarDuracaoPercurso(4500), "1 h 15 min");
  });
});
