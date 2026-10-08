"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconeCliente, IconeMoto } from "@/components/ui/icones";
import { TOKEN_PUBLICO_MAPBOX } from "../mapa/configuracao-mapbox";

/*
 * MAPA DA ENTREGA PARA O CLIENTE — Mapbox, como os demais mapas de rota do Jaaa (era o último em
 * Leaflet/OpenStreetMap). Desenha só o que o servidor mandou para ESTE cliente:
 * - o entregador (moto) e o destino dele (cliente);
 * - a LINHA do trecho que falta, quando existe — a geometria real da rota, já recortada no servidor.
 *   Sem trecho, só os dois pontos: nenhuma linha reta é inventada.
 * Nada é calculado aqui e nenhuma outra parada existe neste mapa. Cada posição nova só move o
 * marcador e troca a linha; o mapa não é recriado.
 */

type Ponto = { latitude: number; longitude: number };
type Coordenada = [longitude: number, latitude: number];
const coordenada = (ponto: Ponto): Coordenada => [ponto.longitude, ponto.latitude];

const FONTE_DO_TRECHO = "trecho-da-entrega";

/** GeoJSON da linha do trecho, no formato que o Mapbox recebe (puro, testável). */
export function linhaDoTrecho(geometria: readonly Ponto[] | null) {
  return { type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: (geometria ?? []).map(coordenada) } };
}

/** O que precisa caber na tela: entregador, destino e o trecho. */
export function pontosParaEnquadrar(posicao: Ponto, destino: Ponto | undefined, geometria: readonly Ponto[] | null): Coordenada[] {
  return [coordenada(posicao), ...(destino ? [coordenada(destino)] : []), ...(geometria ?? []).map(coordenada)];
}

type Controle = {
  mapa: import("mapbox-gl").Map;
  entregador: import("mapbox-gl").Marker;
  enquadrar: (pontos: Coordenada[]) => void;
};

export function MapaDaEntregaDoCliente({ posicao, destino, geometria }: { posicao: Ponto; destino?: Ponto | undefined; geometria: readonly Ponto[] | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const controleRef = useRef<Controle | null>(null);
  const dadosRef = useRef({ posicao, destino, geometria });
  const [erro, setErro] = useState<string | null>(null);
  // Elementos dos marcadores: os ícones do Jaaa são desenhados neles por portal.
  const [elementos, setElementos] = useState<{ entregador: HTMLDivElement; destino: HTMLDivElement | null } | null>(null);
  const temDestino = destino !== undefined;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !TOKEN_PUBLICO_MAPBOX) return;
    let cancelado = false;
    let mapa: import("mapbox-gl").Map | null = null;

    void import("mapbox-gl")
      .then(({ default: mapboxgl }) => {
        if (cancelado) return;
        const inicial = dadosRef.current;
        mapboxgl.accessToken = TOKEN_PUBLICO_MAPBOX;
        mapa = new mapboxgl.Map({ container, style: "mapbox://styles/mapbox/streets-v12", center: coordenada(inicial.posicao), zoom: 15 });
        mapa.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");

        const elementoEntregador = document.createElement("div");
        const elementoDestino = inicial.destino ? document.createElement("div") : null;
        const entregador = new mapboxgl.Marker({ element: elementoEntregador }).setLngLat(coordenada(inicial.posicao)).addTo(mapa);
        if (elementoDestino && inicial.destino) new mapboxgl.Marker({ element: elementoDestino, anchor: "bottom" }).setLngLat(coordenada(inicial.destino)).addTo(mapa);

        const enquadrar = (pontos: Coordenada[]) => {
          if (!mapa || pontos.length === 0) return;
          const limites = new mapboxgl.LngLatBounds();
          for (const ponto of pontos) limites.extend(ponto);
          mapa.fitBounds(limites, { padding: 48, maxZoom: 16, duration: 600 });
        };

        mapa.on("load", () => {
          if (!mapa || cancelado) return;
          mapa.addSource(FONTE_DO_TRECHO, { type: "geojson", data: linhaDoTrecho(dadosRef.current.geometria) });
          // Contorno claro por baixo: a linha continua legível sobre ruas da mesma cor.
          mapa.addLayer({ id: `${FONTE_DO_TRECHO}-contorno`, type: "line", source: FONTE_DO_TRECHO, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#ffffff", "line-width": 8 } });
          mapa.addLayer({ id: FONTE_DO_TRECHO, type: "line", source: FONTE_DO_TRECHO, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#0f766e", "line-width": 5 } });
        });

        enquadrar(pontosParaEnquadrar(inicial.posicao, inicial.destino, inicial.geometria));
        controleRef.current = { mapa, entregador, enquadrar };
        setElementos({ entregador: elementoEntregador, destino: elementoDestino });
      })
      .catch(() => setErro("Não foi possível abrir o mapa da entrega."));

    return () => {
      cancelado = true;
      controleRef.current = null;
      setElementos(null);
      mapa?.remove();
    };
    // Monta uma vez por pedido; as atualizações chegam pelo efeito abaixo.
  }, [temDestino]);

  // Posição ou trecho novos: move o marcador, troca a linha e mantém os dois pontos à vista.
  useEffect(() => {
    dadosRef.current = { posicao, destino, geometria };
    const controle = controleRef.current;
    if (!controle) return;
    controle.entregador.setLngLat(coordenada(posicao));
    const fonte = controle.mapa.getSource(FONTE_DO_TRECHO) as import("mapbox-gl").GeoJSONSource | undefined;
    fonte?.setData(linhaDoTrecho(geometria));
    controle.enquadrar(pontosParaEnquadrar(posicao, destino, geometria));
  }, [posicao, destino, geometria]);

  if (!TOKEN_PUBLICO_MAPBOX || erro) {
    return (
      <p role="status" data-mapa-da-entrega="indisponivel" className="rounded-jaa-compacto bg-superficie-suave px-3 py-2.5 text-[13px] text-conteudo-suave">
        {erro ?? "O mapa não está disponível agora."}
      </p>
    );
  }

  return (
    <div className="aspect-[16/10] max-h-72 min-h-48 w-full overflow-hidden rounded-jaa-compacto border border-borda">
      <div ref={containerRef} data-mapa-da-entrega="mapbox" data-com-trecho={geometria ? "" : undefined} aria-label="Mapa com o entregador e o seu endereço" className="h-full w-full" />
      {elementos &&
        createPortal(
          <span aria-label="Entregador" className="grid h-9 w-9 place-items-center rounded-full border-[3px] border-white bg-marca text-marca-conteudo shadow-cartao">
            <IconeMoto className="h-5 w-5" />
          </span>,
          elementos.entregador,
        )}
      {elementos?.destino &&
        createPortal(
          <span aria-label="Seu endereço" className="grid h-8 w-8 place-items-center rounded-full border-2 border-conteudo bg-superficie text-conteudo shadow-cartao">
            <IconeCliente className="h-5 w-5" />
          </span>,
          elementos.destino,
        )}
    </div>
  );
}
