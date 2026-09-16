import type { Coordenadas } from "@jaa/contratos";
import * as z from "zod";
import { ErroRespostaProvedor, type ParadaDeRota, type Percurso, type ProvedorRoteamento, type SequenciaOtimizada } from "../motor-rotas.js";

/*
 * PROVEDOR MAPBOX — infraestrutura. Tudo que é específico do fornecedor (endpoints, parâmetros,
 * formato das respostas, limites) vive AQUI e em nenhum outro lugar do Jaa.
 *
 * O token é segredo de SERVIDOR: nunca vai para o Web nem para o Mobile, e nunca é registrado em log.
 */

const MAPBOX_URL_PADRAO = "https://api.mapbox.com";
const TIMEOUT_PADRAO_MS = 6000;

/*
 * LIMITES DO FORNECEDOR (a razão de o motor recusar antes de chamar, em vez de truncar pedidos):
 * - Optimization API v1: até 12 coordenadas por requisição → origem + 11 paradas;
 * - Directions API v5: até 25 coordenadas por requisição → origem + 24 paradas.
 */
const MAXIMO_COORDENADAS_OTIMIZACAO = 12;
const MAXIMO_COORDENADAS_DIRECTIONS = 25;

export type BuscarHttp = (url: string, opcoes: { signal: AbortSignal }) => Promise<Response>;

export interface OpcoesProvedorMapbox {
  token: string;
  urlBase?: string | undefined;
  // Injetável para os testes: nenhum teste automatizado do Jaa chama a internet.
  buscar?: BuscarHttp | undefined;
  timeoutMs?: number | undefined;
  perfil?: string | undefined;
}

const respostaOtimizacaoSchema = z.object({
  code: z.string(),
  waypoints: z.array(z.object({ waypoint_index: z.number().int().min(0) })),
});

const respostaDirectionsSchema = z.object({
  code: z.string(),
  routes: z
    .array(
      z.object({
        distance: z.number().finite().min(0),
        duration: z.number().finite().min(0),
        geometry: z.object({ coordinates: z.array(z.tuple([z.number(), z.number()])).min(2) }),
      }),
    )
    .min(1),
});

const paraCoordenada = (ponto: Coordenadas) => `${ponto.longitude.toFixed(6)},${ponto.latitude.toFixed(6)}`;

export function criarProvedorMapbox({ token, urlBase = MAPBOX_URL_PADRAO, buscar, timeoutMs = TIMEOUT_PADRAO_MS, perfil = "driving" }: OpcoesProvedorMapbox): ProvedorRoteamento {
  const requisitar = buscar ?? ((url, opcoes) => fetch(url, opcoes));

  async function pedir(caminho: string, parametros: Record<string, string>): Promise<unknown> {
    const url = new URL(`${urlBase}${caminho}`);
    for (const [chave, valor] of Object.entries(parametros)) url.searchParams.set(chave, valor);
    // O token entra só aqui, na hora da chamada; não circula pelo domínio nem aparece em erro algum.
    url.searchParams.set("access_token", token);

    const controle = new AbortController();
    const expirar = setTimeout(() => controle.abort(), timeoutMs);
    try {
      const resposta = await requisitar(url.toString(), { signal: controle.signal });
      // HTTP com erro é indisponibilidade (cai no fallback); corpo estranho é resposta inválida.
      if (!resposta.ok) throw new Error(`Mapbox respondeu ${resposta.status}.`);
      try {
        return await resposta.json();
      } catch {
        throw new ErroRespostaProvedor("Mapbox devolveu um corpo que não é JSON.");
      }
    } finally {
      clearTimeout(expirar);
    }
  }

  return {
    nome: "mapbox",
    maximoParadasOtimizacao: MAXIMO_COORDENADAS_OTIMIZACAO - 1,
    maximoParadasPercurso: MAXIMO_COORDENADAS_DIRECTIONS - 1,

    /**
     * ORDEM das paradas.
     *
     * LIMITAÇÃO REAL do fornecedor, tratada aqui e não escondida: a Optimization API v1 só resolve
     * "destino final livre" quando a viagem é CIRCULAR (`roundtrip=true`); com `roundtrip=false` ela
     * exige que o destino seja informado, e o Jaa não sabe (nem quer fixar) qual será a última
     * entrega. Como no Jaa o entregador NÃO precisa voltar à empresa, a estratégia é:
     *
     *   1. pedir a ordem com viagem circular a partir da base (`source=first`, `destination=any`);
     *   2. DESCARTAR a volta e calcular o percurso ABERTO dessa ordem na Directions API.
     *
     * Ou seja: o Mapbox ordena, o Jaa não finge que ele otimizou uma rota aberta — por isso a
     * interface continua dizendo "sequência sugerida", nunca "melhor rota" ou "rota mais rápida".
     */
    async otimizarSequencia(origem: Coordenadas, paradas: ParadaDeRota[]): Promise<SequenciaOtimizada> {
      const pontos = [origem, ...paradas.map((parada) => parada.coordenadas)].map(paraCoordenada).join(";");
      const corpo = await pedir(`/optimized-trips/v1/mapbox/${perfil}/${pontos}`, {
        source: "first",
        destination: "any",
        roundtrip: "true",
        overview: "false",
      });

      const resultado = respostaOtimizacaoSchema.safeParse(corpo);
      if (!resultado.success || resultado.data.code !== "Ok") throw new ErroRespostaProvedor("Otimização do Mapbox inválida.");
      const { waypoints } = resultado.data;
      if (waypoints.length !== paradas.length + 1) throw new ErroRespostaProvedor("Otimização do Mapbox não cobre todas as paradas.");

      // `waypoint_index` é a posição de cada ponto ENVIADO dentro da viagem otimizada.
      const ordenadas = paradas
        .map((parada, indice) => ({ parada, posicao: waypoints[indice + 1]?.waypoint_index ?? Number.MAX_SAFE_INTEGER }))
        .sort((a, b) => a.posicao - b.posicao)
        .map((item) => item.parada.pedidoId);

      // O percurso vem numa chamada separada, já sem a volta à base.
      return { ordem: ordenadas };
    },

    /** PERCURSO real da ordem informada (aberto: termina na última parada, sem retorno à empresa). */
    async calcularPercurso(origem: Coordenadas, paradas: ParadaDeRota[]): Promise<Percurso> {
      const pontos = [origem, ...paradas.map((parada) => parada.coordenadas)].map(paraCoordenada).join(";");
      const corpo = await pedir(`/directions/v5/mapbox/${perfil}/${pontos}`, {
        geometries: "geojson",
        overview: "full",
        // Continuação natural: o entregador sai da base seguindo o trânsito, sem meia-volta forçada.
        continue_straight: "false",
      });

      const resultado = respostaDirectionsSchema.safeParse(corpo);
      if (!resultado.success || resultado.data.code !== "Ok") throw new ErroRespostaProvedor("Percurso do Mapbox inválido.");
      const rota = resultado.data.routes[0];
      if (!rota) throw new ErroRespostaProvedor("Percurso do Mapbox sem rota.");

      return {
        // GeoJSON vem [longitude, latitude]; o Jaa fala sempre em {latitude, longitude}.
        geometria: rota.geometry.coordinates.map(([longitude, latitude]) => ({ latitude, longitude })),
        distanciaMetros: Math.round(rota.distance),
        duracaoSegundos: Math.round(rota.duration),
      };
    },
  };
}
