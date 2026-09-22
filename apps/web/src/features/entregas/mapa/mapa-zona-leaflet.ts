import type { PoligonoZona } from "@jaa/contratos";
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
export const criarMapaZonaLeaflet: CriarMapaZona = async ({
  elemento,
  centro,
  verticesIniciais,
  nomeZona,
  aoMudarVertices,
  aoMudarPodeDesfazer,
  aoBloquearExclusao,
  outrasZonas,
  urlTiles,
  atribuicao,
}) => {
  // Import dinâmico: Leaflet precisa de `window` e só roda no navegador.
  const L = (await import("leaflet")).default;

  // Remontagem do efeito: destrói a instância anterior antes de criar outra no mesmo elemento.
  liberarContainer(elemento);

  const mapa = L.map(elemento, { zoomControl: true, attributionControl: true, doubleClickZoom: false }).setView([centro.latitude, centro.longitude], 14);
  registrarMapa(elemento, mapa);
  recalcularTamanho(mapa);
  if (urlTiles) L.tileLayer(urlTiles, { maxZoom: 19, ...(atribuicao ? { attribution: atribuicao } : {}) }).addTo(mapa);

  // As outras zonas aparecem apagadas, só como referência: a sobreposição quem recusa é o servidor.
  for (const outra of outrasZonas ?? []) {
    L.polygon(
      outra.vertices.map((vertice) => [vertice.latitude, vertice.longitude] as [number, number]),
      { color: "#0f766e", weight: 2, fillColor: "#0f766e", fillOpacity: 0.12, interactive: false },
    )
      .addTo(mapa)
      .bindTooltip(outra.nome, { permanent: true, direction: "center", className: "font-semibold" });
  }

  let vertices = [...(verticesIniciais ?? [])];
  let historico: PoligonoZona[] = [];
  const marcadores: ReturnType<typeof L.marker>[] = [];
  let contorno: ReturnType<typeof L.polygon> | null = null;

  const copiar = (lista: PoligonoZona): PoligonoZona => lista.map((vertice) => ({ ...vertice }));
  const mesmasCoordenadas = (a: PoligonoZona, b: PoligonoZona) =>
    a.length === b.length && a.every((vertice, indice) => vertice.latitude === b[indice]?.latitude && vertice.longitude === b[indice]?.longitude);

  const publicarEstado = () => {
    aoMudarVertices(copiar(vertices));
    aoMudarPodeDesfazer?.(historico.length > 0);
  };

  const atualizarContorno = () => {
    const pontos = vertices.map((vertice) => [vertice.latitude, vertice.longitude] as [number, number]);
    if (vertices.length >= 3) {
      if (contorno) contorno.setLatLngs(pontos);
      else {
        contorno = L.polygon(pontos, { color: "#0f766e", weight: 2, fillOpacity: 0.15, interactive: false }).addTo(mapa);
        if (nomeZona) contorno.bindTooltip(nomeZona, { permanent: true, direction: "center", className: "font-semibold" });
      }
    } else {
      contorno?.remove();
      contorno = null;
    }
  };

  const redesenhar = () => {
    for (const marcador of marcadores.splice(0)) marcador.remove();
    contorno?.remove();
    contorno = null;

    for (const [indice, vertice] of vertices.entries()) {
      const marcador = L.marker([vertice.latitude, vertice.longitude], {
        draggable: true,
        bubblingMouseEvents: false,
        keyboard: true,
        title: `Vértice ${indice + 1}`,
        icon: L.divIcon({
          className: "",
          html: `<span aria-hidden="true" style="display:block;width:18px;height:18px;border:2px solid #111;border-radius:9999px;background:#fff;box-shadow:0 1px 4px rgb(0 0 0 / .35)"></span>`,
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        }),
      })
        .addTo(mapa)
        .bindTooltip(String(indice + 1));

      let antesDoArraste: PoligonoZona | null = null;
      marcador.on("dragstart", () => {
        antesDoArraste = copiar(vertices);
      });
      marcador.on("drag", () => {
        const ponto = marcador.getLatLng();
        vertices[indice] = { latitude: ponto.lat, longitude: ponto.lng };
        atualizarContorno();
      });
      marcador.on("dragend", () => {
        if (!antesDoArraste) return;
        const ponto = marcador.getLatLng();
        const finais = copiar(vertices);
        finais[indice] = arredondarCoordenadas({ latitude: ponto.lat, longitude: ponto.lng });
        if (!mesmasCoordenadas(antesDoArraste, finais)) historico.push(antesDoArraste);
        vertices = finais;
        antesDoArraste = null;
        redesenhar();
      });
      marcador.on("dblclick", (evento) => {
        L.DomEvent.stopPropagation(evento.originalEvent);
        if (vertices.length <= 3) {
          aoBloquearExclusao?.();
          return;
        }
        historico.push(copiar(vertices));
        vertices = vertices.filter((_, atual) => atual !== indice);
        redesenhar();
      });
      marcadores.push(marcador);
    }
    atualizarContorno();
    publicarEstado();
  };

  const alterar = (novos: PoligonoZona) => {
    if (mesmasCoordenadas(vertices, novos)) return;
    historico.push(copiar(vertices));
    vertices = copiar(novos);
    redesenhar();
  };

  mapa.on("click", (evento) => {
    alterar([...vertices, arredondarCoordenadas({ latitude: evento.latlng.lat, longitude: evento.latlng.lng })]);
  });

  redesenhar();

  return {
    desenhar(novos) {
      vertices = copiar(novos);
      historico = [];
      redesenhar();
    },
    desfazer() {
      const anteriores = historico.pop();
      if (!anteriores) return;
      vertices = anteriores;
      redesenhar();
    },
    limpar() {
      alterar([]);
    },
    destruir() {
      // Mesma proteção do mapa de ponto: nunca deixar um mapa visível e sem ouvintes na tela.
      destruirMapa(elemento, mapa);
    },
  };
};
