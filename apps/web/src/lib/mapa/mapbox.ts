import type { Coordenadas } from "@jaa/contratos";
import { TOKEN_PUBLICO_MAPBOX } from "@/features/entregas/mapa/configuracao-mapbox";

export type MapboxModulo = typeof import("mapbox-gl").default;

export interface MapaMapboxMontado {
  mapboxgl: MapboxModulo;
  mapa: import("mapbox-gl").Map;
  destruir(): void;
}

/**
 * Ponto único de inicialização do Mapbox GL no Web (irmão de `leaflet.ts`): estilo, orientação,
 * controles e o container de cada instância ficam aqui, para as telas não repetirem nada disso.
 *
 * Cada instância ganha um container PRÓPRIO dentro do elemento. Na remontagem do efeito (StrictMode)
 * duas instâncias chegam a coexistir no mesmo elemento e o `remove()` da antiga tira a classe
 * `mapboxgl-map` (position: relative) do container — o canvas e os marcadores da nova, absolutos,
 * escapavam para o topo da página. Com o container próprio, destruir uma nunca afeta a outra.
 */
export async function montarMapaMapbox({
  elemento,
  centro,
  zoom,
  doubleClickZoom = true,
}: {
  elemento: HTMLElement;
  centro: Coordenadas;
  zoom: number;
  doubleClickZoom?: boolean;
}): Promise<MapaMapboxMontado> {
  // Import dinâmico: o Mapbox GL precisa do navegador.
  const { default: mapboxgl } = await import("mapbox-gl");
  mapboxgl.accessToken = TOKEN_PUBLICO_MAPBOX;

  const container = document.createElement("div");
  container.style.width = "100%";
  container.style.height = "100%";
  elemento.appendChild(container);

  const mapa = new mapboxgl.Map({
    container,
    style: "mapbox://styles/mapbox/streets-v12",
    center: [centro.longitude, centro.latitude],
    zoom,
    // Abre sempre com o norte para cima; girar continua permitido e a bússola devolve ao norte.
    bearing: 0,
    pitch: 0,
    doubleClickZoom,
  });
  mapa.addControl(new mapboxgl.NavigationControl({ showCompass: true, showZoom: true }));

  return {
    mapboxgl,
    mapa,
    destruir() {
      mapa.remove();
      container.remove();
    },
  };
}
