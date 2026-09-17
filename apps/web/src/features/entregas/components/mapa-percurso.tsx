"use client";

import { paradasAtivas, posicaoEstaRecente, rotaCobreSequenciaAtual, rotaTemPercursoReal, type PosicaoEntregador, type SaidaEntrega } from "@jaa/contratos";
import { useEffect, useRef } from "react";
import { ATRIBUICAO_TILES, URL_TILES_MAPA } from "@/features/enderecos/mapa/configuracao-mapa";
import { montarMapaLeaflet, recalcularTamanho } from "@/lib/mapa/leaflet";
import { podeDesenharPercurso } from "./percurso-saida";

/**
 * MAPA OPERACIONAL DA SAÍDA, para quem tem direito a vê-la — a EMPRESA e o ENTREGADOR daquela saída.
 * O cliente NUNCA recebe este componente: ele veria os destinos dos outros.
 *
 * Duas camadas com origens diferentes, de propósito:
 * - PARADAS e POSIÇÃO do entregador são dados do próprio Jaa: aparecem sempre que existem;
 * - o TRAÇADO pelas ruas vem do provedor de rotas e só é desenhado quando existe percurso real,
 *   atual, e sobre o mapa do mesmo provedor (termos de uso). Em fallback nenhuma linha é traçada,
 *   porque uma linha reta fingiria representar ruas que ninguém calculou.
 */
export function MapaPercurso({ saida, posicao }: { saida: SaidaEntrega; posicao?: PosicaoEntregador | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<{ moverEntregador: (ponto: { latitude: number; longitude: number }) => void } | null>(null);

  const { rota } = saida;
  const traçarPercurso = rotaTemPercursoReal(rota) && rotaCobreSequenciaAtual(rota, saida.versaoSequencia) && podeDesenharPercurso(rota?.provedor ?? null);
  const paradas = paradasAtivas(saida);
  // Sem parada e sem percurso não há o que mostrar (ex.: saída recém-concluída).
  const temMapa = traçarPercurso || paradas.length > 0;

  useEffect(() => {
    const elemento = containerRef.current;
    if (!elemento || !temMapa) return;

    // Montagem idempotente (o efeito pode rodar duas vezes em desenvolvimento).
    const montagem = montarMapaLeaflet(elemento, (L, container) => {
      const mapa = L.map(container, { zoomControl: true, attributionControl: true });
      recalcularTamanho(mapa);
      if (URL_TILES_MAPA) L.tileLayer(URL_TILES_MAPA, { maxZoom: 19, attribution: ATRIBUICAO_TILES }).addTo(mapa);

      const enquadrar: [number, number][] = [];

      // Destinos snapshot da saída, na ordem da sequência (é o que a operação vai percorrer).
      for (const [indice, parada] of paradas.entries()) {
        const ponto: [number, number] = [parada.destino.latitude, parada.destino.longitude];
        enquadrar.push(ponto);
        L.circleMarker(ponto, { radius: 6, color: "#111", fillColor: "#fff", fillOpacity: 1 })
          .addTo(mapa)
          .bindTooltip(`${indice + 1}. ${parada.cliente.nomeExibicao}`);
      }

      if (traçarPercurso && rota?.geometria) {
        const pontos = rota.geometria.map((ponto) => [ponto.latitude, ponto.longitude] as [number, number]);
        L.polyline(pontos, { color: "#0f766e", weight: 4 }).addTo(mapa);
        // A origem do percurso é a base da empresa (snapshot da saída).
        if (pontos[0]) {
          enquadrar.push(pontos[0]);
          L.circleMarker(pontos[0], { radius: 6, color: "#0f766e", fillColor: "#0f766e", fillOpacity: 0.6 }).addTo(mapa).bindTooltip("Base");
        }
        enquadrar.push(...pontos);
      }

      // Onde o entregador está AGORA: só aparece com posição recente e nunca recalcula rota.
      const entregador = L.circleMarker(enquadrar[0] ?? [0, 0], { radius: 8, color: "#b45309", fillColor: "#f59e0b", fillOpacity: 0.9 }).bindTooltip("Entregador");
      if (posicao && posicaoEstaRecente(posicao)) {
        entregador.setLatLng([posicao.latitude, posicao.longitude]).addTo(mapa);
        enquadrar.push([posicao.latitude, posicao.longitude]);
      }

      if (enquadrar.length > 1) mapa.fitBounds(L.latLngBounds(enquadrar), { padding: [25, 25] });
      else if (enquadrar[0]) mapa.setView(enquadrar[0], 15);

      mapaRef.current = {
        moverEntregador(ponto) {
          entregador.setLatLng([ponto.latitude, ponto.longitude]);
          if (!mapa.hasLayer(entregador)) entregador.addTo(mapa);
        },
      };
      return mapa;
    });

    return () => {
      montagem.cancelar();
      mapaRef.current = null;
    };
    // Redesenha quando a saída muda de verdade (sequência/percurso), não a cada posição recebida:
    // posição nova só move o marcador no efeito abaixo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [temMapa, traçarPercurso, rota?.calculadaEm, rota?.versaoSequencia, saida.versaoSequencia]);

  // Posição nova só move o marcador — mapa não é recriado e nada é recalculado.
  useEffect(() => {
    if (posicao && posicaoEstaRecente(posicao)) mapaRef.current?.moverEntregador(posicao);
  }, [posicao]);

  if (!temMapa) return null;

  return (
    <div className="h-56 w-full overflow-hidden rounded-jaa border border-borda">
      <div ref={containerRef} data-mapa-percurso className="h-full w-full" />
    </div>
  );
}
