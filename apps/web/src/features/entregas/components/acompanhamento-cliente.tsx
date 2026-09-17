"use client";

import {
  EVENTO_PEDIDO_ACOMPANHAMENTO,
  eventoPedidoAcompanhamentoSchema,
  rotuloFila,
  rotuloUltimaPosicao,
  type AcompanhamentoPedido,
} from "@jaa/contratos";
import { useEffect, useRef, useState } from "react";
import { ATRIBUICAO_TILES, URL_TILES_MAPA } from "@/features/enderecos/mapa/configuracao-mapa";
import { montarMapaLeaflet, recalcularTamanho } from "@/lib/mapa/leaflet";
import { obterAcompanhamentoDoPedido } from "../lib/api-entregas";
import { obterClienteRealtime } from "@/lib/realtime/cliente-realtime";

/*
 * ACOMPANHAMENTO DO CLIENTE. Ele vê a fila de sempre ("3 entregas antes da sua") e, SÓ quando a
 * entrega dele vira a atual, o entregador no mapa.
 *
 * Quem decide isso é o SERVIDOR: a posição só chega no payload quando é a vez dele. A tela não
 * "esconde" nada — ela nem recebe. E nunca há destino, coordenada ou id de outro cliente aqui.
 */

// Apresentação pura: a fila e a idade da última posição (posição velha nunca é vendida como atual).
export function ResumoAcompanhamento({ acompanhamento, agora = new Date() }: { acompanhamento: AcompanhamentoPedido; agora?: Date }) {
  const { fila, posicaoEntregador } = acompanhamento;
  if (fila.situacao === "sem_saida" || fila.situacao === "encerrado") return null;

  return (
    <span className="flex flex-col gap-0.5">
      <span data-fila-pedido={fila.situacao} className={`text-xs ${fila.situacao === "indo_ate_voce" ? "font-semibold text-marca" : "text-conteudo-suave"}`}>
        {rotuloFila(fila)}
      </span>
      {fila.situacao === "indo_ate_voce" && (
        <span data-posicao-entregador={posicaoEntregador ? "disponivel" : "indisponivel"} className="text-xs text-conteudo-suave">
          {posicaoEntregador ? rotuloUltimaPosicao({ capturadaEm: posicaoEntregador.capturadaEm }, agora) : "Localização temporariamente indisponível"}
        </span>
      )}
    </span>
  );
}

/**
 * Container do cliente: busca o estado atual (é isto que resolve a RECONEXÃO, sem depender do último
 * evento) e acompanha o realtime do próprio pedido.
 */
export function AcompanhamentoDoPedido({ pedidoId, destino }: { pedidoId: string; destino?: { latitude: number; longitude: number } | undefined }) {
  const [acompanhamento, setAcompanhamento] = useState<AcompanhamentoPedido | null>(null);

  useEffect(() => {
    let ativo = true;
    void obterAcompanhamentoDoPedido(pedidoId).then((resultado) => {
      if (ativo && resultado.ok) setAcompanhamento(resultado.dados);
    });
    return () => {
      ativo = false;
    };
  }, [pedidoId]);

  useEffect(() => {
    const socket = obterClienteRealtime();
    const aoAtualizar = (evento: unknown) => {
      const resultado = eventoPedidoAcompanhamentoSchema.safeParse(evento);
      // Só o próprio pedido: o servidor já filtra, e a tela confere de novo.
      if (resultado.success && resultado.data.pedidoId === pedidoId) setAcompanhamento(resultado.data.acompanhamento);
    };
    socket.on(EVENTO_PEDIDO_ACOMPANHAMENTO, aoAtualizar);
    return () => {
      socket.off(EVENTO_PEDIDO_ACOMPANHAMENTO, aoAtualizar);
    };
  }, [pedidoId]);

  if (!acompanhamento) return null;

  return (
    <span className="flex flex-col gap-1">
      <ResumoAcompanhamento acompanhamento={acompanhamento} />
      {acompanhamento.posicaoEntregador && <MapaDoEntregador posicao={acompanhamento.posicaoEntregador} destino={destino} />}
    </span>
  );
}

/**
 * Mapa do cliente: só DOIS pontos — o entregador e o destino DELE. Nada de rota da saída (ela
 * revelaria por onde passam as outras entregas) e nada das demais paradas.
 */
function MapaDoEntregador({
  posicao,
  destino,
}: {
  posicao: { latitude: number; longitude: number; capturadaEm: string };
  destino?: { latitude: number; longitude: number } | undefined;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<{ atualizar: (ponto: { latitude: number; longitude: number }) => void } | null>(null);

  useEffect(() => {
    const elemento = containerRef.current;
    if (!elemento) return;

    // Montagem idempotente: o efeito pode rodar duas vezes e o container precisa ficar reutilizável.
    const montagem = montarMapaLeaflet(elemento, (L, container) => {
      const mapa = L.map(container, { zoomControl: true, attributionControl: true }).setView([posicao.latitude, posicao.longitude], 15);
      recalcularTamanho(mapa);
      if (URL_TILES_MAPA) L.tileLayer(URL_TILES_MAPA, { maxZoom: 19, attribution: ATRIBUICAO_TILES }).addTo(mapa);

      const marcador = L.circleMarker([posicao.latitude, posicao.longitude], { radius: 8, color: "#0f766e", fillColor: "#0f766e", fillOpacity: 0.9 })
        .addTo(mapa)
        .bindTooltip("Entregador");
      if (destino) {
        const seuPonto = L.circleMarker([destino.latitude, destino.longitude], { radius: 6, color: "#111", fillColor: "#fff", fillOpacity: 1 }).addTo(mapa).bindTooltip("Sua entrega");
        mapa.fitBounds(L.latLngBounds([marcador.getLatLng(), seuPonto.getLatLng()]), { padding: [30, 30] });
      }

      mapaRef.current = {
        atualizar(ponto) {
          marcador.setLatLng([ponto.latitude, ponto.longitude]);
        },
      };
      return mapa;
    });

    return () => {
      montagem.cancelar();
      mapaRef.current = null;
    };
    // Monta uma vez: cada nova posição só move o marcador (abaixo), sem recriar o mapa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    mapaRef.current?.atualizar(posicao);
  }, [posicao]);

  return (
    <span className="block h-48 w-full overflow-hidden rounded-jaa border border-borda">
      <span ref={containerRef} data-mapa-entregador className="block h-full w-full" />
    </span>
  );
}
