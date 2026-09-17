import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  POLITICA_RASTREAMENTO,
  decidirEnvioDePosicao,
  distanciaAproximadaMetros,
  enviarPosicaoEntradaSchema,
  posicaoEstaRecente,
  rotuloUltimaPosicao,
  type LeituraGps,
} from "./rastreamento.ts";

/*
 * A política de envio é função PURA: dá para testá-la inteira sem GPS físico, sem aparelho e sem
 * rede — que é exatamente o que os testes automatizados do Jaa fazem.
 */

const base = { latitude: -19.92, longitude: -43.94 };
const em = (segundos: number) => new Date(Date.UTC(2026, 8, 16, 12, 0, segundos));
const leitura = (dados: Partial<LeituraGps> & { capturadaEm: Date }): LeituraGps => ({ ...base, ...dados });

describe("política de envio de posição", () => {
  it("a primeira leitura sempre vai", () => {
    assert.deepEqual(decidirEnvioDePosicao(null, leitura({ capturadaEm: em(0) })), { enviar: true, motivo: "primeira" });
  });

  it("leitura imprecisa demais é descartada antes de qualquer coisa", () => {
    const ruim = leitura({ capturadaEm: em(1), precisaoMetros: POLITICA_RASTREAMENTO.precisaoMaximaMetros + 1 });
    assert.deepEqual(decidirEnvioDePosicao(null, ruim), { enviar: false, motivo: "imprecisa" });
  });

  it("parado no mesmo lugar não vira requisição", () => {
    const anterior = leitura({ capturadaEm: em(0) });
    // 15 s depois, praticamente na mesma esquina.
    const quase = leitura({ capturadaEm: em(15), latitude: -19.920002 });
    assert.deepEqual(decidirEnvioDePosicao(anterior, quase), { enviar: false, motivo: "parado" });
  });

  it("andou o suficiente dentro da janela: envia", () => {
    const anterior = leitura({ capturadaEm: em(0) });
    const moveu = leitura({ capturadaEm: em(12), latitude: -19.9215 });
    assert.deepEqual(decidirEnvioDePosicao(anterior, moveu), { enviar: true, motivo: "moveu" });
  });

  it("respeita o intervalo mínimo mesmo com movimento (bateria e rede)", () => {
    const anterior = leitura({ capturadaEm: em(0) });
    const cedo = leitura({ capturadaEm: em(5), latitude: -19.93 });
    assert.deepEqual(decidirEnvioDePosicao(anterior, cedo), { enviar: false, motivo: "cedo-demais" });
  });

  it("passado o intervalo máximo, manda sinal de vida mesmo parado", () => {
    const anterior = leitura({ capturadaEm: em(0) });
    const parado = leitura({ capturadaEm: em(25) });
    assert.deepEqual(decidirEnvioDePosicao(anterior, parado), { enviar: true, motivo: "sinal-de-vida" });
  });

  it("a política é configurável — 10/20 s não é regra rígida do domínio", () => {
    const politica = { ...POLITICA_RASTREAMENTO, intervaloMinimoMs: 2000, intervaloMaximoMs: 4000, distanciaMinimaMetros: 5 };
    const anterior = leitura({ capturadaEm: em(0) });
    const nova = leitura({ capturadaEm: em(3), latitude: -19.9202 });
    assert.equal(decidirEnvioDePosicao(anterior, nova, politica).enviar, true);
  });

  it("a distância aproximada serve para decidir movimento", () => {
    assert.ok(distanciaAproximadaMetros(base, { latitude: -19.9215, longitude: -43.94 }) > 150);
    assert.ok(distanciaAproximadaMetros(base, { latitude: -19.920002, longitude: -43.94 }) < 1);
  });
});

describe("posição recente x desatualizada", () => {
  const capturadaEm = "2026-09-16T12:00:00.000Z";

  it("recente é o que dá para mostrar como 'onde ele está'", () => {
    assert.equal(posicaoEstaRecente({ capturadaEm }, new Date("2026-09-16T12:00:30.000Z")), true);
    assert.equal(posicaoEstaRecente({ capturadaEm }, new Date("2026-09-16T12:05:00.000Z")), false);
    assert.equal(posicaoEstaRecente(null), false);
  });

  it("o rótulo nunca apresenta coordenada antiga como se fosse atual", () => {
    assert.equal(rotuloUltimaPosicao({ capturadaEm }, new Date("2026-09-16T12:00:35.000Z")), "Última atualização há 35 s");
    assert.equal(rotuloUltimaPosicao({ capturadaEm }, new Date("2026-09-16T12:03:00.000Z")), "Última atualização há 3 min");
    assert.equal(rotuloUltimaPosicao({ capturadaEm }, new Date("2026-09-16T14:00:00.000Z")), "Localização temporariamente indisponível");
    assert.equal(rotuloUltimaPosicao(null), "Localização indisponível");
  });
});

describe("contrato do envio", () => {
  it("aceita só o necessário e recusa coordenada inválida", () => {
    const valida = { latitude: -19.92, longitude: -43.94, precisaoMetros: 12, capturadaEm: "2026-09-16T12:00:00.000Z" };
    assert.equal(enviarPosicaoEntradaSchema.safeParse(valida).success, true);
    assert.equal(enviarPosicaoEntradaSchema.safeParse({ ...valida, latitude: 91 }).success, false);
    assert.equal(enviarPosicaoEntradaSchema.safeParse({ ...valida, longitude: -181 }).success, false);
    assert.equal(enviarPosicaoEntradaSchema.safeParse({ ...valida, capturadaEm: "ontem" }).success, false);
    assert.equal(enviarPosicaoEntradaSchema.safeParse({ latitude: -19.92, longitude: -43.94 }).success, false, "sem horário da captura não dá para saber a idade");
    // O aparelho nunca informa empresa nem "estou entregando": isso é decisão do servidor.
    const comEmpresa = enviarPosicaoEntradaSchema.safeParse({ ...valida, empresaId: "qualquer" });
    assert.equal(comEmpresa.success && "empresaId" in comEmpresa.data, false);
  });
});
