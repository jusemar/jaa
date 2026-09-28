import { TOKEN_PUBLICO_MAPBOX } from "@/features/entregas/mapa/configuracao-mapbox";
import { montarMapaMapbox } from "@/lib/mapa/mapbox";
import { criarMapaLeaflet } from "./mapa-leaflet";
import { arredondarCoordenadas, type CriarMapaPonto } from "./provedor-mapa";
import { ATRIBUICAO_TILES, URL_TILES_MAPA } from "./configuracao-mapa";

/**
 * Implementação MAPBOX da fronteira `CriarMapaPonto` (direção do projeto para telas novas). Mesmo
 * comportamento da versão Leaflet: o marcador é um objeto real; só arrastá-lo ou tocar no mapa move o
 * ponto — navegar (zoom, arrastar o mapa) é só visualização. Nada é confirmado aqui.
 */
export const criarMapaMapbox: CriarMapaPonto = async ({ elemento, centro, pontoInicial, aoMoverPonto }) => {
  // Estilo, orientação, bússola e o container próprio por instância (StrictMode) vêm da base comum.
  const { mapboxgl, mapa, destruir } = await montarMapaMapbox({ elemento, centro, zoom: 16 });

  let marcador: import("mapbox-gl").Marker | null = null;
  const avisar = (lngLat: { lng: number; lat: number }) => aoMoverPonto(arredondarCoordenadas({ latitude: lngLat.lat, longitude: lngLat.lng }));

  function posicionar(lngLat: { lng: number; lat: number }) {
    if (marcador) marcador.setLngLat(lngLat);
    else {
      const novo = new mapboxgl.Marker({ draggable: true, color: "#0f766e" }).setLngLat(lngLat).addTo(mapa);
      novo.on("dragend", () => avisar(novo.getLngLat()));
      marcador = novo;
    }
    avisar(lngLat);
  }

  if (pontoInicial) posicionar({ lng: pontoInicial.longitude, lat: pontoInicial.latitude });
  mapa.on("click", (evento) => posicionar(evento.lngLat));

  return {
    centralizar(coordenadas) {
      mapa.setCenter([coordenadas.longitude, coordenadas.latitude]);
      posicionar({ lng: coordenadas.longitude, lat: coordenadas.latitude });
    },
    destruir,
  };
};

/**
 * Mapa de ponto para telas NOVAS: Mapbox quando há token público configurado
 * (NEXT_PUBLIC_MAPBOX_TOKEN); sem ele, a implementação Leaflet já existente — a tela continua
 * utilizável em desenvolvimento. As telas antigas seguem usando o que já usavam.
 */
export const criarMapaPontoPreferido: CriarMapaPonto = (opcoes) =>
  TOKEN_PUBLICO_MAPBOX ? criarMapaMapbox(opcoes) : criarMapaLeaflet({ ...opcoes, urlTiles: URL_TILES_MAPA, atribuicao: ATRIBUICAO_TILES });
