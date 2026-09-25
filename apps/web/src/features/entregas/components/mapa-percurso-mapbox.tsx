"use client";

import {
  paradasAtivas,
  posicaoEstaRecente,
  rotaCobreSequenciaAtual,
  rotaTemPercursoReal,
  type PosicaoEntregador,
  type SaidaEntrega,
} from "@jaa/contratos";
import { useEffect, useMemo, useRef, useState } from "react";
import { TOKEN_PUBLICO_MAPBOX } from "../mapa/configuracao-mapbox";

type ControleMapa = {
  mapa: import("mapbox-gl").Map;
  marcadorEntregador: import("mapbox-gl").Marker;
};

function elementoMarcador(rotulo: string, destaque = false): HTMLDivElement {
  const elemento = document.createElement("div");
  elemento.textContent = rotulo;
  elemento.setAttribute(
    "aria-label",
    destaque ? `Próxima parada: ${rotulo}` : rotulo,
  );
  Object.assign(elemento.style, {
    alignItems: "center",
    background: destaque ? "#0f766e" : "#ffffff",
    border: destaque ? "3px solid #ffffff" : "2px solid #0f172a",
    borderRadius: "9999px",
    boxShadow: "0 1px 5px rgb(0 0 0 / 35%)",
    color: destaque ? "#ffffff" : "#0f172a",
    display: "flex",
    fontSize: "12px",
    fontWeight: "700",
    height: destaque ? "32px" : "26px",
    justifyContent: "center",
    width: destaque ? "32px" : "26px",
  });
  return elemento;
}

/**
 * Renderizador Mapbox da rota do entregador. O Directions permanece no servidor: este componente
 * desenha exatamente a geometria persistida para a sequência atual, sem recalcular nem reordenar.
 */
export function MapaPercursoMapbox({
  saida,
  posicao,
}: {
  saida: SaidaEntrega;
  posicao?: PosicaoEntregador | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const controleRef = useRef<ControleMapa | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const { rota } = saida;
  const paradas = useMemo(() => paradasAtivas(saida), [saida]);
  const posicaoRef = useRef(posicao);
  const erroConfiguracao = TOKEN_PUBLICO_MAPBOX
    ? null
    : "Mapa indisponível: configure o token público do Mapbox.";
  const tracadoValido =
    rota?.provedor === "mapbox" &&
    rotaTemPercursoReal(rota) &&
    rotaCobreSequenciaAtual(rota, saida.versaoSequencia);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || paradas.length === 0) return;
    if (!TOKEN_PUBLICO_MAPBOX) return;

    let cancelado = false;
    let mapa: import("mapbox-gl").Map | null = null;
    void import("mapbox-gl")
      .then(({ default: mapboxgl }) => {
        if (cancelado) return;
        mapboxgl.accessToken = TOKEN_PUBLICO_MAPBOX;
        mapa = new mapboxgl.Map({
          container,
          style: "mapbox://styles/mapbox/streets-v12",
          center: [paradas[0]!.destino.longitude, paradas[0]!.destino.latitude],
          zoom: 14,
        });
        mapa.addControl(new mapboxgl.NavigationControl(), "top-right");

        const limites = new mapboxgl.LngLatBounds();
        for (const [indice, parada] of paradas.entries()) {
          const coordenada: [number, number] = [
            parada.destino.longitude,
            parada.destino.latitude,
          ];
          limites.extend(coordenada);
          new mapboxgl.Marker({
            element: elementoMarcador(String(indice + 1), indice === 0),
          })
            .setLngLat(coordenada)
            .setPopup(
              new mapboxgl.Popup({ offset: 18 }).setText(
                `${indice === 0 ? "Próxima parada" : `${indice + 1}ª parada`} · Pedido #${parada.numeroPedido}`,
              ),
            )
            .addTo(mapa);
        }

        if (tracadoValido && rota?.geometria) {
          const coordenadas = rota.geometria.map(
            (ponto) => [ponto.longitude, ponto.latitude] as [number, number],
          );
          for (const coordenada of coordenadas) limites.extend(coordenada);
          mapa.on("load", () => {
            if (!mapa) return;
            mapa.addSource("percurso-rota", {
              type: "geojson",
              data: {
                type: "Feature",
                properties: {},
                geometry: { type: "LineString", coordinates: coordenadas },
              },
            });
            mapa.addLayer({
              id: "percurso-rota",
              type: "line",
              source: "percurso-rota",
              layout: { "line-cap": "round", "line-join": "round" },
              paint: { "line-color": "#0f766e", "line-width": 5 },
            });
          });

          const origem = rota.origem ?? rota.geometria[0];
          if (origem) {
            const coordenada: [number, number] = [
              origem.longitude,
              origem.latitude,
            ];
            limites.extend(coordenada);
            new mapboxgl.Marker({ color: "#2563eb" })
              .setLngLat(coordenada)
              .setPopup(
                new mapboxgl.Popup({ offset: 18 }).setText("Origem da rota"),
              )
              .addTo(mapa);
          }
        }

        const marcadorEntregador = new mapboxgl.Marker({ color: "#f59e0b" });
        const posicaoInicial = posicaoRef.current;
        if (posicaoInicial && posicaoEstaRecente(posicaoInicial)) {
          const coordenada: [number, number] = [
            posicaoInicial.longitude,
            posicaoInicial.latitude,
          ];
          marcadorEntregador.setLngLat(coordenada).addTo(mapa);
          limites.extend(coordenada);
        }
        mapa.fitBounds(limites, { padding: 40, maxZoom: 16 });
        controleRef.current = { mapa, marcadorEntregador };
      })
      .catch(() => setErro("Não foi possível abrir o mapa da rota."));

    return () => {
      cancelado = true;
      controleRef.current = null;
      mapa?.remove();
    };
  }, [paradas, rota, saida.versaoSequencia, tracadoValido]);

  useEffect(() => {
    posicaoRef.current = posicao;
    const controle = controleRef.current;
    if (!controle || !posicao || !posicaoEstaRecente(posicao)) return;
    controle.marcadorEntregador
      .setLngLat([posicao.longitude, posicao.latitude])
      .addTo(controle.mapa);
  }, [posicao]);

  if (paradas.length === 0) return null;
  return (
    <div className="h-56 w-full overflow-hidden rounded-jaa border border-borda">
      {(erroConfiguracao ?? erro) ? (
        <p role="alert" className="p-3 text-sm text-perigo">
          {erroConfiguracao ?? erro}
        </p>
      ) : null}
      <div
        ref={containerRef}
        data-mapa-percurso-mapbox
        className="h-full w-full"
      />
    </div>
  );
}
