import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { criarMotorDeRotas, ErroRespostaProvedor, type ParadaDeRota, type Percurso, type ProvedorRoteamento } from "../src/features/entregas/lib/motor-rotas.js";
import { criarProvedorMapbox } from "../src/features/entregas/lib/provedores/provedor-mapbox.js";

/*
 * MOTOR DE ROTAS e PROVEDOR MAPBOX — testes com provedor FAKE e `fetch` FAKE.
 * Nenhum teste automatizado do Jaa faz chamada externa real: o provedor é injetado.
 */

const BASE = { latitude: -19.9191, longitude: -43.9386 };
const parada = (pedidoId: string, latitude: number): ParadaDeRota => ({ pedidoId, coordenadas: { latitude, longitude: -43.93 } });
const PARADAS = [parada("a", -19.93), parada("b", -19.92), parada("c", -19.94)];

const percursoFalso: Percurso = {
  geometria: [
    { latitude: -19.9191, longitude: -43.9386 },
    { latitude: -19.93, longitude: -43.93 },
  ],
  distanciaMetros: 4200,
  duracaoSegundos: 600,
};

interface FakeProvedor extends ProvedorRoteamento {
  chamadas: string[];
}

function criarProvedorFake(comportamento: { ordem?: string[]; falharEm?: "otimizacao" | "percurso"; erro?: Error } = {}): FakeProvedor {
  const chamadas: string[] = [];
  return {
    nome: "fake",
    maximoParadasOtimizacao: 11,
    maximoParadasPercurso: 24,
    chamadas,
    async otimizarSequencia(_origem, paradas) {
      chamadas.push("otimizacao");
      if (comportamento.falharEm === "otimizacao") throw comportamento.erro ?? new Error("indisponível");
      return { ordem: comportamento.ordem ?? paradas.map((item) => item.pedidoId) };
    },
    async calcularPercurso(_origem, paradas) {
      chamadas.push(`percurso:${paradas.map((item) => item.pedidoId).join(",")}`);
      if (comportamento.falharEm === "percurso") throw comportamento.erro ?? new Error("indisponível");
      return percursoFalso;
    },
  };
}

describe("motor de rotas — planejamento", () => {
  it("usa a ordem do provedor e o percurso real dela", async () => {
    const provedor = criarProvedorFake({ ordem: ["c", "a", "b"] });
    const { rota, consumos } = await criarMotorDeRotas(provedor).planejar(BASE, PARADAS);

    assert.deepEqual(rota.ordem, ["c", "a", "b"]);
    assert.equal(rota.estado, "percurso_real");
    assert.equal(rota.sequenciaDoProvedor, true);
    assert.equal(rota.provedor, "fake");
    assert.deepEqual(rota.origem, BASE, "a origem é a base da empresa, nunca a localização de alguém");
    assert.equal(rota.percurso?.distanciaMetros, 4200);
    // O percurso é calculado para a ordem OTIMIZADA (e não para a ordem de entrada).
    assert.ok(provedor.chamadas.includes("percurso:c,a,b"), provedor.chamadas.join("|"));
    assert.deepEqual(
      consumos.map((consumo) => `${consumo.operacao}:${consumo.resultado}`),
      ["otimizacao:sucesso"],
    );
  });

  it("uma parada só não é otimizada — só tem percurso", async () => {
    const provedor = criarProvedorFake();
    const { rota } = await criarMotorDeRotas(provedor).planejar(BASE, [PARADAS[0] as ParadaDeRota]);
    assert.deepEqual(provedor.chamadas, ["percurso:a"]);
    assert.equal(rota.estado, "percurso_real");
  });

  it("a ordem do ENTREGADOR prevalece: recalcular percurso nunca reotimiza", async () => {
    const provedor = criarProvedorFake({ ordem: ["a", "b", "c"] });
    const escolhaDele = [PARADAS[2] as ParadaDeRota, PARADAS[0] as ParadaDeRota, PARADAS[1] as ParadaDeRota];
    const { rota } = await criarMotorDeRotas(provedor).recalcularPercurso(BASE, escolhaDele);

    assert.deepEqual(rota.ordem, ["c", "a", "b"], "a ordem enviada é preservada");
    assert.equal(rota.sequenciaDoProvedor, false);
    assert.deepEqual(provedor.chamadas, ["percurso:c,a,b"], "nenhuma otimização foi pedida");
  });
});

describe("motor de rotas — fallback seguro", () => {
  const semNumeros = (rota: { estado: string; percurso: Percurso | null; provedor: string | null }) => {
    assert.equal(rota.estado, "aproximacao_local");
    assert.equal(rota.percurso, null, "fallback não inventa distância, duração nem traçado");
    assert.equal(rota.provedor, null);
  };

  it("sem provedor configurado, a operação segue na aproximação local", async () => {
    const { rota, consumos } = await criarMotorDeRotas(null).planejar(BASE, PARADAS);
    semNumeros(rota);
    assert.equal(rota.motivoFallback, "provedor_nao_configurado");
    assert.equal(rota.ordem.length, 3, "nenhuma parada é perdida");
    assert.deepEqual([...rota.ordem].sort(), ["a", "b", "c"]);
    assert.equal(consumos[0]?.resultado, "nao_aplicavel");
  });

  it("provedor fora do ar não derruba a saída", async () => {
    const { rota, consumos } = await criarMotorDeRotas(criarProvedorFake({ falharEm: "otimizacao" })).planejar(BASE, PARADAS);
    semNumeros(rota);
    assert.equal(rota.motivoFallback, "provedor_indisponivel");
    assert.deepEqual([...rota.ordem].sort(), ["a", "b", "c"]);
    assert.equal(consumos[0]?.resultado, "falha");
  });

  it("resposta inválida do provedor é tratada como resposta inválida (não como rota)", async () => {
    const invalido = criarProvedorFake({ falharEm: "otimizacao", erro: new ErroRespostaProvedor("formato inesperado") });
    const { rota } = await criarMotorDeRotas(invalido).planejar(BASE, PARADAS);
    assert.equal(rota.motivoFallback, "resposta_invalida");

    // Ordem que não cobre todas as paradas também é resposta inválida — nada é perdido.
    const incompleto = criarProvedorFake({ ordem: ["a", "b"] });
    const parcial = await criarMotorDeRotas(incompleto).planejar(BASE, PARADAS);
    assert.equal(parcial.rota.motivoFallback, "resposta_invalida");
    assert.deepEqual([...parcial.rota.ordem].sort(), ["a", "b", "c"]);
  });

  it("capacidade excedida não trunca pedidos: cai no fallback com o motivo explícito", async () => {
    const provedor = criarProvedorFake();
    const muitas = Array.from({ length: 12 }, (_, indice) => parada(`p${indice}`, -19.9 - indice / 100));
    const { rota, consumos } = await criarMotorDeRotas(provedor).planejar(BASE, muitas);

    assert.equal(rota.motivoFallback, "capacidade_excedida");
    assert.equal(rota.ordem.length, 12, "as 12 paradas continuam na saída");
    assert.deepEqual(provedor.chamadas, [], "nem chegou a chamar o provedor");
    assert.equal(consumos[0]?.paradas, 12);
  });

  it("sem ponto da base confirmado não há origem — e a saída continua utilizável", async () => {
    const { rota } = await criarMotorDeRotas(criarProvedorFake()).planejar(null, PARADAS);
    assert.equal(rota.motivoFallback, "sem_base_confirmada");
    assert.equal(rota.origem, null);
    assert.equal(rota.ordem.length, 3);
  });
});

describe("provedor Mapbox (fetch fake)", () => {
  const respostaOk = (corpo: unknown) => ({ ok: true, status: 200, json: async () => corpo }) as unknown as Response;

  function fakeFetch(respostas: Record<string, unknown>, urls: string[] = []) {
    return async (url: string) => {
      urls.push(url);
      const chave = url.includes("/optimized-trips/") ? "otimizacao" : "percurso";
      const corpo = respostas[chave];
      if (corpo === undefined) throw new Error("rota não simulada");
      return respostaOk(corpo);
    };
  }

  it("otimiza com viagem circular e calcula o percurso ABERTO da ordem resultante", async () => {
    const urls: string[] = [];
    const provedor = criarProvedorMapbox({
      token: "token-de-teste",
      buscar: fakeFetch(
        {
          otimizacao: { code: "Ok", waypoints: [{ waypoint_index: 0 }, { waypoint_index: 3 }, { waypoint_index: 1 }, { waypoint_index: 2 }] },
          percurso: {
            code: "Ok",
            routes: [{ distance: 5321.4, duration: 812.7, geometry: { coordinates: [[-43.9386, -19.9191], [-43.93, -19.92]] } }],
          },
        },
        urls,
      ),
    });

    const otimizada = await provedor.otimizarSequencia(BASE, PARADAS);
    // waypoint_index: a=3, b=1, c=2 → ordem b, c, a.
    assert.deepEqual(otimizada.ordem, ["b", "c", "a"]);
    assert.equal(otimizada.percurso, undefined, "o percurso vem numa chamada separada, já sem a volta");

    const percurso = await provedor.calcularPercurso(BASE, PARADAS);
    assert.equal(percurso.distanciaMetros, 5321);
    assert.equal(percurso.duracaoSegundos, 813);
    assert.deepEqual(percurso.geometria[0], { latitude: -19.9191, longitude: -43.9386 }, "GeoJSON [lng,lat] vira {latitude, longitude}");

    const [urlOtimizacao, urlPercurso] = urls;
    assert.ok(urlOtimizacao?.includes("/optimized-trips/v1/mapbox/driving/"));
    // A Optimization v1 só resolve destino livre em viagem circular: a volta é descartada depois.
    assert.ok(urlOtimizacao?.includes("roundtrip=true") && urlOtimizacao.includes("source=first") && urlOtimizacao.includes("destination=any"));
    assert.ok(urlOtimizacao?.includes("driving/-43.938600,-19.919100;"), "a origem é a primeira coordenada");
    assert.ok(urlPercurso?.includes("/directions/v5/mapbox/driving/") && urlPercurso.includes("geometries=geojson"));
    assert.equal(urlPercurso?.includes("roundtrip"), false, "o percurso é aberto: não volta à empresa");
  });

  it("limites do fornecedor viram capacidade do provedor (12 e 25 coordenadas)", () => {
    const provedor = criarProvedorMapbox({ token: "token-de-teste", buscar: fakeFetch({}) });
    assert.equal(provedor.maximoParadasOtimizacao, 11);
    assert.equal(provedor.maximoParadasPercurso, 24);
  });

  it("HTTP com erro é indisponibilidade; corpo estranho é resposta inválida", async () => {
    const comErro = criarProvedorMapbox({
      token: "token-de-teste",
      buscar: async () => ({ ok: false, status: 503, json: async () => ({}) }) as unknown as Response,
    });
    await assert.rejects(() => comErro.calcularPercurso(BASE, PARADAS), (erro: Error) => !(erro instanceof ErroRespostaProvedor));

    const comCorpoInvalido = criarProvedorMapbox({
      token: "token-de-teste",
      buscar: fakeFetch({ percurso: { code: "Ok", routes: [] }, otimizacao: { code: "NoRoute", waypoints: [] } }),
    });
    await assert.rejects(() => comCorpoInvalido.calcularPercurso(BASE, PARADAS), ErroRespostaProvedor);
    await assert.rejects(() => comCorpoInvalido.otimizarSequencia(BASE, PARADAS), ErroRespostaProvedor);
  });

  it("o token vai só para o provedor, na própria chamada", async () => {
    const urls: string[] = [];
    const provedor = criarProvedorMapbox({
      token: "token-de-teste",
      buscar: fakeFetch({ percurso: { code: "Ok", routes: [{ distance: 1, duration: 1, geometry: { coordinates: [[0, 0], [1, 1]] } }] } }, urls),
    });
    await provedor.calcularPercurso(BASE, PARADAS);
    assert.equal(urls.length, 1);
    assert.ok(urls[0]?.startsWith("https://api.mapbox.com/"), urls[0]);
    assert.ok(urls[0]?.includes("access_token=token-de-teste"));
  });
});
