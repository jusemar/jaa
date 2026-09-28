import type { Coordenadas, PoligonoZona } from "@jaa/contratos";
import { ATRIBUICAO_TILES, URL_TILES_MAPA } from "@/features/enderecos/mapa/configuracao-mapa";
import { montarMapaMapbox } from "@/lib/mapa/mapbox";
import { TOKEN_PUBLICO_MAPBOX } from "./configuracao-mapbox";
import { criarEditorVerticesZona } from "./editor-vertices-zona";
import { criarMapaZonaLeaflet } from "./mapa-zona-leaflet";
import type { CriarMapaZona } from "./provedor-mapa-zona";

const COR = "#0f766e";
const FONTE_ATUAL = "jaa-area-atual";
const FONTE_REFERENCIA = "jaa-areas-referencia";

type Posicao = [number, number];
const posicao = (vertice: Coordenadas): Posicao => [vertice.longitude, vertice.latitude];

/**
 * GeoJSON do contorno em desenho: com 3+ pontos, o polígono FECHADO (o fechamento é implícito, como
 * sempre foi); com 2, a linha que os liga; com menos, nada. Só apresentação: os vértices continuam
 * sendo a lista `PoligonoZona`, sem o ponto repetido de fechamento.
 */
export function geojsonDoContorno(vertices: PoligonoZona): GeoJSON.FeatureCollection {
  const pontos = vertices.map(posicao);
  const primeiro = pontos[0];
  if (pontos.length >= 3 && primeiro) {
    return { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[...pontos, primeiro]] } }] };
  }
  if (pontos.length === 2) {
    return { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: pontos } }] };
  }
  return { type: "FeatureCollection", features: [] };
}

export function geojsonDasReferencias(areas: Array<{ vertices: PoligonoZona }>): GeoJSON.FeatureCollection {
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

function elementoRotulo(texto: string): HTMLElement {
  const rotulo = document.createElement("span");
  rotulo.textContent = texto;
  rotulo.style.cssText = "pointer-events:none;padding:2px 6px;border-radius:6px;background:rgb(255 255 255 / .85);font-size:12px;font-weight:600;color:#111;white-space:nowrap";
  return rotulo;
}

function elementoVertice(indice: number): HTMLElement {
  const vertice = document.createElement("span");
  vertice.dataset.verticeZona = String(indice);
  vertice.title = `Vértice ${indice + 1}`;
  vertice.setAttribute("aria-label", `Vértice ${indice + 1}`);
  vertice.style.cssText = "display:block;width:18px;height:18px;border:2px solid #111;border-radius:9999px;background:#fff;box-shadow:0 1px 4px rgb(0 0 0 / .35);cursor:grab";
  return vertice;
}

/**
 * Implementação MAPBOX da fronteira `CriarMapaZona`: mesmo gesto da versão Leaflet — tocar no mapa
 * marca um canto, arrastar um canto o ajusta (o contorno acompanha na hora), duplo clique no canto o
 * exclui, "Desfazer" volta um passo. O contorno é uma fonte GeoJSON; os cantos são `Marker`s
 * arrastáveis. Nenhuma biblioteca de desenho extra, e nada aqui sabe de empresa, frete ou pedido.
 */
export const criarMapaZonaMapbox: CriarMapaZona = async ({
  elemento,
  centro,
  verticesIniciais,
  enquadrarInicial,
  nomeZona,
  aoMudarVertices,
  aoMudarPodeDesfazer,
  aoBloquearExclusao,
  outrasZonas,
}) => {
  // Duplo clique é "excluir canto", então não pode também aproximar o mapa.
  const { mapboxgl, mapa, destruir } = await montarMapaMapbox({ elemento, centro, zoom: 14, doubleClickZoom: false });

  let estiloPronto = false;
  let contornoAtual: PoligonoZona = [];
  let marcadores: import("mapbox-gl").Marker[] = [];
  let rotuloAtual: import("mapbox-gl").Marker | null = null;
  const rotulosReferencia: import("mapbox-gl").Marker[] = [];

  const desenharContorno = (vertices: PoligonoZona) => {
    contornoAtual = vertices;
    if (estiloPronto) (mapa.getSource(FONTE_ATUAL) as import("mapbox-gl").GeoJSONSource | undefined)?.setData(geojsonDoContorno(vertices));
    const centroRotulo = centroDoRotulo(vertices);
    if (!centroRotulo || !nomeZona) {
      rotuloAtual?.remove();
      rotuloAtual = null;
    } else if (rotuloAtual) rotuloAtual.setLngLat(posicao(centroRotulo));
    else rotuloAtual = new mapboxgl.Marker({ element: elementoRotulo(nomeZona) }).setLngLat(posicao(centroRotulo)).addTo(mapa);
  };

  const editor = criarEditorVerticesZona({
    verticesIniciais,
    aoMudarVertices,
    aoMudarPodeDesfazer,
    aoBloquearExclusao,
    aoMoverProvisorio: desenharContorno,
    aoRedesenhar: (vertices) => {
      for (const marcador of marcadores) marcador.remove();
      marcadores = vertices.map((vertice, indice) => {
        const elementoCanto = elementoVertice(indice);
        const marcador = new mapboxgl.Marker({ element: elementoCanto, draggable: true }).setLngLat(posicao(vertice)).addTo(mapa);
        const lido = () => ({ latitude: marcador.getLngLat().lat, longitude: marcador.getLngLat().lng });
        marcador.on("dragstart", () => editor.iniciarArraste());
        marcador.on("drag", () => editor.moverDuranteArraste(indice, lido()));
        marcador.on("dragend", () => editor.concluirArraste(indice, lido()));
        elementoCanto.addEventListener("dblclick", (evento) => {
          evento.stopPropagation();
          evento.preventDefault();
          editor.excluir(indice);
        });
        return marcador;
      });
      desenharContorno(vertices);
    },
  });

  mapa.on("load", () => {
    mapa.addSource(FONTE_REFERENCIA, { type: "geojson", data: geojsonDasReferencias(outrasZonas ?? []) });
    // As outras áreas aparecem apagadas, só como referência: a sobreposição quem recusa é o servidor.
    mapa.addLayer({ id: `${FONTE_REFERENCIA}-preenchimento`, type: "fill", source: FONTE_REFERENCIA, paint: { "fill-color": COR, "fill-opacity": 0.12 } });
    mapa.addLayer({ id: `${FONTE_REFERENCIA}-borda`, type: "line", source: FONTE_REFERENCIA, paint: { "line-color": COR, "line-width": 2 } });

    mapa.addSource(FONTE_ATUAL, { type: "geojson", data: geojsonDoContorno(contornoAtual) });
    mapa.addLayer({ id: `${FONTE_ATUAL}-preenchimento`, type: "fill", source: FONTE_ATUAL, filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": COR, "fill-opacity": 0.15 } });
    mapa.addLayer({ id: `${FONTE_ATUAL}-borda`, type: "line", source: FONTE_ATUAL, paint: { "line-color": COR, "line-width": 2 } });
    estiloPronto = true;
  });

  for (const outra of outrasZonas ?? []) {
    const centroRotulo = centroDoRotulo(outra.vertices);
    if (centroRotulo) rotulosReferencia.push(new mapboxgl.Marker({ element: elementoRotulo(outra.nome) }).setLngLat(posicao(centroRotulo)).addTo(mapa));
  }

  mapa.on("click", (evento) => {
    // Toque num canto (ou o fim de um arraste) não marca canto novo embaixo dele.
    const alvo = evento.originalEvent.target;
    if (alvo instanceof Element && alvo.closest("[data-vertice-zona]")) return;
    editor.adicionar({ latitude: evento.lngLat.lat, longitude: evento.lngLat.lng });
  });

  editor.publicar();

  const paraEnquadrar = [...(verticesIniciais ?? []), ...(outrasZonas ?? []).flatMap((outra) => outra.vertices)];
  if (enquadrarInicial && (verticesIniciais?.length ?? 0) >= 3) {
    const limites = new mapboxgl.LngLatBounds();
    for (const vertice of paraEnquadrar) limites.extend(posicao(vertice));
    // Sem animação e sem girar: o mapa abre já mostrando o desenho inteiro, norte para cima.
    mapa.fitBounds(limites, { padding: 48, duration: 0, maxZoom: 17, bearing: 0 });
  }

  return {
    desenhar: (novos) => editor.substituir(novos),
    desfazer: () => editor.desfazer(),
    limpar: () => editor.limpar(),
    destruir() {
      for (const marcador of [...marcadores, ...rotulosReferencia, ...(rotuloAtual ? [rotuloAtual] : [])]) marcador.remove();
      marcadores = [];
      rotuloAtual = null;
      destruir();
    },
  };
};

/**
 * Desenho de área para as telas: Mapbox quando há token público (NEXT_PUBLIC_MAPBOX_TOKEN); sem
 * ele, a implementação Leaflet existente — igual ao mapa de ponto (`criarMapaPontoPreferido`).
 */
export const criarMapaZonaPreferido: CriarMapaZona = (opcoes) =>
  TOKEN_PUBLICO_MAPBOX ? criarMapaZonaMapbox(opcoes) : criarMapaZonaLeaflet({ ...opcoes, urlTiles: URL_TILES_MAPA, atribuicao: ATRIBUICAO_TILES });
