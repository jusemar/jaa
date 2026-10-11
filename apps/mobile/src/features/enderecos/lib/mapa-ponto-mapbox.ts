import type { Coordenadas } from "@jaa/contratos";
import { arredondarCoordenadas } from "./mapa-ponto";

/*
 * MAPA DE PONTO com o Mapbox nativo — as mesmas escolhas do mapa de ponto da Web
 * (`apps/web/src/features/enderecos/mapa/mapa-mapbox.ts` + `lib/mapa/mapbox.ts`), para as duas telas
 * mostrarem o mesmo lugar do mesmo jeito. Mudou lá, muda aqui. Puro, testável sem aparelho.
 */

// A mesma cartografia da Web.
export const ESTILO_DO_MAPA_DE_PONTO = "mapbox://styles/mapbox/streets-v12";
// A Web abre o mapa de ponto neste zoom.
export const ZOOM_DO_MAPA_DE_PONTO = 16;
export const ZOOM_MINIMO_DO_MAPA_DE_PONTO = 3;
export const ZOOM_MAXIMO_DO_MAPA_DE_PONTO = 20;
// Cor do marcador da Web (`new mapboxgl.Marker({ color })`).
export const COR_DO_MARCADOR = "#0f766e";

export type PosicaoNoMapa = [longitude: number, latitude: number];

export const posicaoNoMapa = ({ latitude, longitude }: Coordenadas): PosicaoNoMapa => [longitude, latitude];

/**
 * Ponto de um toque no mapa ou do fim do arraste do marcador (GeoJSON: longitude antes da latitude),
 * com a precisão que o servidor guarda. Evento sem coordenada válida não vira ponto.
 */
export function pontoDoEvento(evento: { geometry?: { coordinates?: unknown } | null } | null | undefined): Coordenadas | null {
  const coordenadas = evento?.geometry?.coordinates;
  if (!Array.isArray(coordenadas)) return null;
  const [longitude, latitude] = coordenadas as unknown[];
  if (typeof longitude !== "number" || typeof latitude !== "number" || !Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return arredondarCoordenadas({ latitude, longitude });
}

export const proximoZoom = (zoom: number, passo: 1 | -1) => Math.min(ZOOM_MAXIMO_DO_MAPA_DE_PONTO, Math.max(ZOOM_MINIMO_DO_MAPA_DE_PONTO, Math.round(zoom) + passo));

/** A frase acima do mapa — as da Web quando o marcador é um objeto real (toque e arraste). */
export function orientacaoDoMapaDePonto({ semSugestao }: { semSugestao: boolean }): string {
  return semSugestao ? "Não achamos o endereço no mapa. Toque no local exato." : "Confira o marcador. Arraste ou toque no mapa para ajustar.";
}
