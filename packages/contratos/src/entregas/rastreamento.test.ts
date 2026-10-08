import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  POLITICA_RASTREAMENTO,
  decidirEnvioDePosicao,
  distanciaAproximadaMetros,
  enviarPosicaoEntradaSchema,
  posicaoEstaRecente,
  rotuloUltimaPosicao,
  avisoNoLugarDoMapa,
  formatarPrevisaoDoTrecho,
  trechoAteODestino,
  MAXIMO_DE_PONTOS_DO_TRECHO,
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

describe("trecho da rota para o cliente da vez", () => {
  // Uma rua de sul a norte (~111 m por 0,001° de latitude), com três entregas ao longo dela.
  const rua = Array.from({ length: 11 }, (_, indice) => ({ latitude: -19.93 + indice * 0.001, longitude: -43.94 }));
  const duracaoTotal = 600; // 10 min para ~1.113 m
  const primeiroCliente = { latitude: -19.927, longitude: -43.94 };
  const segundoCliente = { latitude: -19.922, longitude: -43.94 };

  it("sai só o pedaço entre o entregador e o destino DESTE cliente — nada do que vem depois", () => {
    const trecho = trechoAteODestino(rua, duracaoTotal, { latitude: -19.9295, longitude: -43.94 }, primeiroCliente);
    assert.ok(trecho);
    const latitudes = trecho.geometria.map((ponto) => ponto.latitude);
    assert.equal(latitudes[0], -19.9295, "começa onde o entregador está");
    assert.equal(latitudes.at(-1), -19.927, "termina no destino dele");
    assert.ok(latitudes.every((latitude) => latitude <= -19.927), "nenhum ponto além do destino dele (rumo às outras entregas)");
    assert.ok(Math.abs(trecho.distanciaMetros - 278) <= 3, `~278 m, veio ${trecho.distanciaMetros}`);
    // Previsão: a mesma fração da duração calculada pelo provedor (278 m de 1.113 m → ~150 s).
    assert.ok(Math.abs(trecho.duracaoSegundos - 150) <= 3, `~150 s, veio ${trecho.duracaoSegundos}`);
  });

  it("não revela por onde ele já passou: o trecho nunca começa antes da posição atual", () => {
    // Já entregou ao primeiro e segue para o segundo: o pedaço não inclui o endereço do primeiro.
    const trecho = trechoAteODestino(rua, duracaoTotal, { latitude: -19.925, longitude: -43.94 }, segundoCliente);
    assert.ok(trecho);
    assert.ok(trecho.geometria.every((ponto) => ponto.latitude >= -19.925 && ponto.latitude <= -19.922));
    assert.equal(trecho.geometria.some((ponto) => ponto.latitude === primeiroCliente.latitude), false);
  });

  it("sem base real não há trecho: entregador ou destino fora do traçado, ou já depois do destino", () => {
    assert.equal(trechoAteODestino(rua, duracaoTotal, { latitude: -19.9295, longitude: -43.93 }, primeiroCliente), null, "entregador a ~1 km do traçado");
    assert.equal(trechoAteODestino(rua, duracaoTotal, { latitude: -19.9295, longitude: -43.94 }, { latitude: -19.927, longitude: -43.95 }), null, "destino fora do traçado");
    assert.equal(trechoAteODestino(rua, duracaoTotal, { latitude: -19.9262, longitude: -43.94 }, { latitude: -19.9268, longitude: -43.94 }), null, "no mesmo quarteirão, já depois do destino");
    assert.equal(trechoAteODestino([rua[0]!], duracaoTotal, rua[0]!, primeiroCliente), null);
  });

  it("trecho longo é reduzido ao teto de pontos, mantendo as pontas", () => {
    const longa = Array.from({ length: 2000 }, (_, indice) => ({ latitude: -19.93 + indice * 0.00001, longitude: -43.94 }));
    const trecho = trechoAteODestino(longa, 900, longa[0]!, longa.at(-1)!);
    assert.ok(trecho && trecho.geometria.length <= MAXIMO_DE_PONTOS_DO_TRECHO);
    assert.equal(trecho?.geometria[0]?.latitude, -19.93);
    assert.equal(trecho?.geometria.at(-1)?.latitude, Number(longa.at(-1)!.latitude.toFixed(6)));
  });

  it("'Previsão' em minutos (nunca menos de 1) e a frase no lugar do mapa", () => {
    assert.equal(formatarPrevisaoDoTrecho(20), "1 min");
    assert.equal(formatarPrevisaoDoTrecho(1080), "18 min");
    assert.equal(formatarPrevisaoDoTrecho(3900), "1 h 5 min");
    const fila = (situacao: "na_fila" | "indo_ate_voce" | "sem_saida") => ({ pedidoId: "11111111-0000-4000-8000-000000000000", situacao, entregasAntes: 0 });
    assert.equal(avisoNoLugarDoMapa({ fila: fila("sem_saida"), posicaoEntregador: null }), null);
    assert.ok(avisoNoLugarDoMapa({ fila: fila("na_fila"), posicaoEntregador: null })?.includes("a caminho de você"));
    assert.ok(avisoNoLugarDoMapa({ fila: fila("indo_ate_voce"), posicaoEntregador: null })?.includes("Aguardando a localização"));
  });
});
