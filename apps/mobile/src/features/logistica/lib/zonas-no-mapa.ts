import type { Coordenadas, PoligonoZona } from "@jaa/contratos";

/*
 * O QUE o mapa de zonas desenha — as mesmas formas do editor de zonas da Web (`mapa-zona-mapbox.ts`).
 * Puro, testável sem aparelho. Os vértices continuam sendo a lista `PoligonoZona`, sem o ponto
 * repetido de fechamento; quem valida a geometria é o servidor.
 */

export type Posicao = [longitude: number, latitude: number];
export const posicao = (vertice: Coordenadas): Posicao => [vertice.longitude, vertice.latitude];

type Forma = { type: "Polygon"; coordinates: Posicao[][] } | { type: "LineString"; coordinates: Posicao[] };
export interface ColecaoDeFormas {
  type: "FeatureCollection";
  features: { type: "Feature"; properties: Record<string, never>; geometry: Forma }[];
}

/** Com 3+ pontos, o polígono FECHADO; com 2, a linha que os liga; com menos, nada. */
export function geojsonDoContorno(vertices: PoligonoZona): ColecaoDeFormas {
  const pontos = vertices.map(posicao);
  const primeiro = pontos[0];
  if (pontos.length >= 3 && primeiro) return { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[...pontos, primeiro]] } }] };
  if (pontos.length === 2) return { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: pontos } }] };
  return { type: "FeatureCollection", features: [] };
}

/** As OUTRAS zonas, só como referência visual (ajudam a não invadir a vizinha). */
export function geojsonDasReferencias(areas: readonly { vertices: PoligonoZona }[]): ColecaoDeFormas {
  return {
    type: "FeatureCollection",
    features: areas
      .filter((area) => area.vertices.length >= 3)
      .map((area) => {
        const pontos = area.vertices.map(posicao);
        return { type: "Feature" as const, properties: {}, geometry: { type: "Polygon" as const, coordinates: [[...pontos, pontos[0] as Posicao]] } };
      }),
  };
}

// Onde pôr o nome da área: média dos vértices (basta para rótulo; não é regra de geometria).
export function centroDoRotulo(vertices: PoligonoZona): Coordenadas | null {
  if (vertices.length < 3) return null;
  const soma = vertices.reduce((total, vertice) => ({ latitude: total.latitude + vertice.latitude, longitude: total.longitude + vertice.longitude }), { latitude: 0, longitude: 0 });
  return { latitude: soma.latitude / vertices.length, longitude: soma.longitude / vertices.length };
}

/** Caixa que contém todos os pontos (para o mapa abrir enquadrando a área). null = nada a enquadrar. */
export function limitesDosVertices(vertices: PoligonoZona): { nordeste: Posicao; sudoeste: Posicao } | null {
  if (vertices.length < 2) return null;
  const longitudes = vertices.map((vertice) => vertice.longitude);
  const latitudes = vertices.map((vertice) => vertice.latitude);
  return { nordeste: [Math.max(...longitudes), Math.max(...latitudes)], sudoeste: [Math.min(...longitudes), Math.min(...latitudes)] };
}

/** O que falta para "Salvar zona" — dito em texto, nunca um botão desabilitado sem explicação. */
export function pendenciasDaZona({ nome, freteCentavos, vertices, minimoVertices }: { nome: string; freteCentavos: number | null; vertices: number; minimoVertices: number }): string[] {
  return [nome.trim() === "" ? "dê um nome à zona" : null, freteCentavos === null ? "informe a taxa de entrega (0,00 = frete grátis)" : null, vertices < minimoVertices ? `marque ao menos ${minimoVertices} pontos no mapa` : null].filter(
    (pendencia): pendencia is string => pendencia !== null,
  );
}
