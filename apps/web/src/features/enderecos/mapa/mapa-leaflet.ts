import { destruirMapa, liberarContainer, recalcularTamanho, registrarMapa } from "@/lib/mapa/leaflet";
import { arredondarCoordenadas, type CriarMapaPonto } from "./provedor-mapa";

/**
 * Implementação Web do mapa com Leaflet + tiles OpenStreetMap: biblioteca livre, sem chave e sem
 * cobrança, com boa cobertura no Brasil. É só uma implementação da fronteira `CriarMapaPonto`.
 *
 * UX escolhida (robusta no celular): o marcador fica FIXO no centro da tela e o cliente arrasta o
 * MAPA embaixo dele — não exige mira fina no pin, funciona com uma mão e nunca "perde" o marcador.
 * Também dá para tocar em um ponto para levá-lo até ali.
 */
export const criarMapaLeaflet: CriarMapaPonto = async ({ elemento, centro, aoMoverPonto, urlTiles, atribuicao }) => {
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

  const avisar = () => aoMoverPonto(arredondarCoordenadas({ latitude: mapa.getCenter().lat, longitude: mapa.getCenter().lng }));
  mapa.on("moveend", avisar);
  mapa.on("click", (evento) => mapa.panTo(evento.latlng));

  return {
    centralizar(coordenadas) {
      mapa.setView([coordenadas.latitude, coordenadas.longitude], mapa.getZoom());
      avisar();
    },
    destruir() {
      // Sem `off()` antes: se o `remove()` falhasse, sobraria um mapa visível e sem ouvintes — ou
      // seja, um mapa que não deixa mais arrastar nem clicar. `destruirMapa` já protege tudo.
      destruirMapa(elemento, mapa);
    },
  };
};
