"use client";

import { rotaCobreSequenciaAtual, rotaTemPercursoReal, type SaidaEntrega } from "@jaa/contratos";
import { useEffect, useRef } from "react";
import { ATRIBUICAO_TILES, URL_TILES_MAPA } from "@/features/enderecos/mapa/configuracao-mapa";
import { podeDesenharPercurso } from "./percurso-saida";

/**
 * MAPA DO PERCURSO: desenha o traçado real da saída (origem = base da empresa) para quem tem direito
 * a vê-lo — a empresa e o entregador daquela saída. O cliente NUNCA recebe este componente: ele veria
 * os destinos dos outros.
 *
 * Só desenha quando existe percurso REAL e atual: em fallback nenhuma linha é traçada, porque uma
 * linha reta fingiria representar ruas que ninguém calculou.
 */
export function MapaPercurso({ saida }: { saida: SaidaEntrega }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<{ destruir: () => void } | null>(null);

  const { rota } = saida;
  const desenhavel = rotaTemPercursoReal(rota) && rotaCobreSequenciaAtual(rota, saida.versaoSequencia) && podeDesenharPercurso(rota?.provedor ?? null);

  useEffect(() => {
    const elemento = containerRef.current;
    if (!elemento || !desenhavel || !rota?.geometria) return;
    let ativo = true;

    void (async () => {
      // Leaflet e o CSS dele entram sob demanda: só quem realmente desenha o percurso os carrega.
      await import("leaflet/dist/leaflet.css");
      const L = (await import("leaflet")).default;
      if (!ativo) return;
      const pontos = rota.geometria?.map((ponto) => [ponto.latitude, ponto.longitude] as [number, number]) ?? [];
      const mapa = L.map(elemento, { zoomControl: true, attributionControl: true });
      if (URL_TILES_MAPA) L.tileLayer(URL_TILES_MAPA, { maxZoom: 19, attribution: ATRIBUICAO_TILES }).addTo(mapa);

      const linha = L.polyline(pontos, { color: "#0f766e", weight: 4 }).addTo(mapa);
      // Origem (base) e destino final da saída, para o percurso ficar legível de relance.
      if (pontos[0]) L.circleMarker(pontos[0], { radius: 6, color: "#111", fillColor: "#fff", fillOpacity: 1 }).addTo(mapa).bindTooltip("Base");
      mapa.fitBounds(linha.getBounds(), { padding: [20, 20] });

      mapaRef.current = {
        destruir() {
          mapa.off();
          mapa.remove();
        },
      };
    })();

    return () => {
      ativo = false;
      mapaRef.current?.destruir();
      mapaRef.current = null;
    };
    // Redesenha quando o percurso muda (nova versão da sequência), não a cada render.
  }, [desenhavel, rota?.calculadaEm, rota?.geometria, rota?.versaoSequencia]);

  if (!desenhavel) return null;

  return (
    <div className="h-56 w-full overflow-hidden rounded border border-zinc-300">
      <div ref={containerRef} data-mapa-percurso className="h-full w-full" />
    </div>
  );
}
