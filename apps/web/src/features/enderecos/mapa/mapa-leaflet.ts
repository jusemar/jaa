import { destruirMapa, liberarContainer, recalcularTamanho, registrarMapa } from "@/lib/mapa/leaflet";
import { arredondarCoordenadas, type CriarMapaPonto } from "./provedor-mapa";

/**
 * Implementação Web do mapa com Leaflet + tiles OpenStreetMap: biblioteca livre, sem chave e sem
 * cobrança, com boa cobertura no Brasil. É só uma implementação da fronteira `CriarMapaPonto`.
 *
 * UX: o marcador é um objeto REAL no mapa. A coordenada muda apenas quando a pessoa o reposiciona —
 * arrastando o próprio marcador ou tocando em outro lugar do mapa.
 *
 * Antes o marcador ficava preso ao centro da tela e a coordenada era lida do centro a cada `moveend`.
 * Com isso o ZOOM DA RODA movia o ponto sem querer: o Leaflet aproxima em direção ao cursor, o centro
 * do mapa muda e a coordenada ia junto. Agora navegar (zoom e arrastar o mapa) é só visualização.
 */
export const criarMapaLeaflet: CriarMapaPonto = async ({ elemento, centro, pontoInicial, aoMoverPonto, urlTiles, atribuicao }) => {
  // Import dinâmico: Leaflet precisa de `window` e só roda no navegador.
  const L = (await import("leaflet")).default;

  // O container pode ter sido usado por um mapa anterior (remontagem do efeito): liberar evita o
  // "Map container is already initialized", que deixava a tela cinza.
  // Remontagem do efeito: destrói a instância anterior antes de criar outra no mesmo elemento.
  liberarContainer(elemento);

  const mapa = L.map(elemento, { zoomControl: true, attributionControl: true }).setView([centro.latitude, centro.longitude], 17);
  registrarMapa(elemento, mapa);
  // Container ainda sendo medido nasce 0×0 e não pede tile nenhum: recalcular resolve.
  recalcularTamanho(mapa);

  // Sem serviço de tiles configurado o mapa continua utilizável (fundo vazio): o ponto é o que importa.
  if (urlTiles) {
    L.tileLayer(urlTiles, { maxZoom: 19, ...(atribuicao ? { attribution: atribuicao } : {}) }).addTo(mapa);
  }

  /*
   * Ícone em HTML (divIcon): o ícone padrão do Leaflet depende de imagens servidas por caminho
   * relativo, que no Next não são encontradas — e o marcador aparecia quebrado.
   */
  const icone = L.divIcon({ html: "📍", className: "text-2xl leading-none", iconSize: [24, 24], iconAnchor: [12, 24] });
  let marcador: ReturnType<typeof L.marker> | null = null;

  const avisar = (latLng: { lat: number; lng: number }) => aoMoverPonto(arredondarCoordenadas({ latitude: latLng.lat, longitude: latLng.lng }));

  function posicionar(latLng: { lat: number; lng: number }) {
    if (marcador) marcador.setLatLng(latLng);
    else {
      marcador = L.marker(latLng, { icon: icone, draggable: true, autoPan: true }).addTo(mapa);
      // Arrastar o MARCADOR é a ação intencional de reposicionar; arrastar o mapa não mexe nele.
      marcador.on("dragend", () => avisar(marcador!.getLatLng()));
    }
    avisar(latLng);
  }

  if (pontoInicial) posicionar({ lat: pontoInicial.latitude, lng: pontoInicial.longitude });
  // Tocar no mapa também reposiciona (e é como o primeiro marcador aparece, quando não há palpite).
  mapa.on("click", (evento) => posicionar(evento.latlng));

  return {
    centralizar(coordenadas) {
      mapa.setView([coordenadas.latitude, coordenadas.longitude], mapa.getZoom());
      // `centralizar` só é chamado por ação explícita (ex.: "Usar onde estou agora"): leva o ponto junto.
      posicionar({ lat: coordenadas.latitude, lng: coordenadas.longitude });
    },
    destruir() {
      // Sem `off()` antes: se o `remove()` falhasse, sobraria um mapa visível e sem ouvintes — ou
      // seja, um mapa que não deixa mais arrastar nem clicar. `destruirMapa` já protege tudo.
      destruirMapa(elemento, mapa);
    },
  };
};
