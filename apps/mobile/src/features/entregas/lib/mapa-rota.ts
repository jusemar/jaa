import { paradasAtivas, rotaCobreSequenciaAtual, rotaTemPercursoReal, type Coordenadas, type SaidaEntrega } from "@jaa/contratos";

/*
 * O QUE o mapa da rota mostra — a mesma leitura da saída que o mapa Mapbox da Web faz
 * (`mapa-percurso-mapbox.tsx`). Puro, testável sem aparelho.
 *
 * Uma fonte só: a geometria, a base e os destinos vêm da SAÍDA que a API devolveu (o percurso foi
 * calculado no servidor, uma vez, para aquela ordem). O app não calcula rota nem escolhe coordenada.
 */

// Token PÚBLICO (pk.): só desenha o mapa. O token que calcula rotas é segredo da API.
export const TOKEN_PUBLICO_MAPBOX = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? "";

export type Posicao = [longitude: number, latitude: number];
const posicao = ({ latitude, longitude }: Coordenadas): Posicao => [longitude, latitude];

export interface ParadaNoMapa {
  id: string;
  rotulo: string;
  proxima: boolean;
  posicao: Posicao;
}

export interface DesenhoDaRota {
  paradas: ParadaNoMapa[];
  // De onde a rota parte (base da empresa, snapshot da saída). null = a saída não tem rota calculada.
  base: Posicao | null;
  // Traçado REAL pelas ruas. null = não há percurso real para a ordem atual: nenhuma linha é inventada.
  tracado: Posicao[] | null;
  // Caixa que contém tudo o que está no mapa (para enquadrar). null = nada a mostrar.
  limites: { nordeste: Posicao; sudoeste: Posicao } | null;
}

export function desenhoDaRota(saida: SaidaEntrega): DesenhoDaRota {
  const { rota } = saida;
  const paradas = paradasAtivas(saida).map((parada, indice) => ({ id: parada.id, rotulo: String(indice + 1), proxima: indice === 0, posicao: posicao(parada.destino) }));
  const origem = rota?.inicio ?? rota?.origem ?? null;
  const base = origem ? posicao(origem) : null;
  // Só o percurso do Mapbox, real e da ordem que está valendo — a mesma condição da Web.
  const valido = rota?.provedor === "mapbox" && rotaTemPercursoReal(rota) && rotaCobreSequenciaAtual(rota, saida.versaoSequencia);
  const tracado = valido && rota?.geometria ? rota.geometria.map(posicao) : null;

  const pontos = [...paradas.map((parada) => parada.posicao), ...(base ? [base] : []), ...(tracado ?? [])];
  if (pontos.length === 0) return { paradas, base, tracado, limites: null };
  const longitudes = pontos.map((ponto) => ponto[0]);
  const latitudes = pontos.map((ponto) => ponto[1]);
  return { paradas, base, tracado, limites: { nordeste: [Math.max(...longitudes), Math.max(...latitudes)], sudoeste: [Math.min(...longitudes), Math.min(...latitudes)] } };
}

/** GeoJSON da linha do percurso, no formato que o mapa recebe. */
export function linhaDoPercurso(tracado: Posicao[]) {
  return { type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: tracado } };
}
