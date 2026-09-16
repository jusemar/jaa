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

  const mapa = L.map(elemento, { zoomControl: true, attributionControl: true }).setView([centro.latitude, centro.longitude], 17);

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
      mapa.off();
      mapa.remove();
    },
  };
};
