import { arredondarCoordenadas } from "@/features/enderecos/mapa/provedor-mapa";
import { destruirMapa, liberarContainer, recalcularTamanho, registrarMapa } from "@/lib/mapa/leaflet";
import type { CriarMapaZona } from "./provedor-mapa-zona";

/**
 * Implementação Web do desenho de zona com Leaflet + tiles OpenStreetMap — a mesma biblioteca livre
 * já usada para confirmar o ponto de entrega, sem chave e sem cobrança.
 *
 * UX: o gestor TOCA no mapa para marcar cada canto da área; o contorno vai se fechando sozinho (o
 * fechamento é implícito). "Desfazer" remove o último ponto. Nenhuma biblioteca de desenho extra:
 * marcadores + um polígono bastam, e o resultado é a lista de vértices que o servidor valida.
 */
export const criarMapaZonaLeaflet: CriarMapaZona = async ({ elemento, centro, verticesIniciais, aoMudarVertices, outrasZonas, urlTiles, atribuicao }) => {
  // Import dinâmico: Leaflet precisa de `window` e só roda no navegador.
  const L = (await import("leaflet")).default;

  // Remontagem do efeito: destrói a instância anterior antes de criar outra no mesmo elemento.
  liberarContainer(elemento);

  const mapa = L.map(elemento, { zoomControl: true, attributionControl: true }).setView([centro.latitude, centro.longitude], 14);
  registrarMapa(elemento, mapa);
  recalcularTamanho(mapa);
  if (urlTiles) L.tileLayer(urlTiles, { maxZoom: 19, ...(atribuicao ? { attribution: atribuicao } : {}) }).addTo(mapa);

  // As outras zonas aparecem apagadas, só como referência: a sobreposição quem recusa é o servidor.
  for (const outra of outrasZonas ?? []) {
    L.polygon(
      outra.vertices.map((vertice) => [vertice.latitude, vertice.longitude] as [number, number]),
      { color: "#a1a1aa", weight: 1, fillOpacity: 0.05, interactive: false },
    )
      .addTo(mapa)
      .bindTooltip(outra.nome, { permanent: false });
  }

  let vertices = [...(verticesIniciais ?? [])];
  const marcadores: ReturnType<typeof L.circleMarker>[] = [];
  let contorno: ReturnType<typeof L.polygon> | null = null;

  const redesenhar = () => {
    for (const marcador of marcadores.splice(0)) marcador.remove();
    contorno?.remove();
    contorno = null;

    for (const [indice, vertice] of vertices.entries()) {
      marcadores.push(
        L.circleMarker([vertice.latitude, vertice.longitude], { radius: 5, color: "#111", fillColor: "#fff", fillOpacity: 1 })
          .addTo(mapa)
          .bindTooltip(String(indice + 1)),
      );
    }
    if (vertices.length >= 3) {
      contorno = L.polygon(
        vertices.map((vertice) => [vertice.latitude, vertice.longitude] as [number, number]),
        { color: "#0f766e", weight: 2, fillOpacity: 0.15 },
      ).addTo(mapa);
    }
    aoMudarVertices([...vertices]);
  };

  mapa.on("click", (evento) => {
    vertices.push(arredondarCoordenadas({ latitude: evento.latlng.lat, longitude: evento.latlng.lng }));
    redesenhar();
  });

  if (vertices.length > 0) redesenhar();

  return {
    desenhar(novos) {
      vertices = [...novos];
      redesenhar();
    },
    limpar() {
      vertices = [];
      redesenhar();
    },
    destruir() {
      // Mesma proteção do mapa de ponto: nunca deixar um mapa visível e sem ouvintes na tela.
      destruirMapa(elemento, mapa);
    },
  };
};
