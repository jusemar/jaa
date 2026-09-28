"use client";

import {
  EVENTO_PEDIDO_ACOMPANHAMENTO,
  EVENTO_PEDIDO_FILA,
  TEXTO_AVISO_ENTREGA_PROXIMA,
  eventoPedidoAcompanhamentoSchema,
  eventoPedidoFilaSchema,
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
 * ACOMPANHAMENTO DO CLIENTE. Ele vê a posição na fila ("Você é o 3º na fila de entregas.") e, SÓ quando a
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
      {fila.situacao === "indo_ate_voce" && <span className="text-xs text-conteudo">{TEXTO_AVISO_ENTREGA_PROXIMA.orientacao}</span>}
      {fila.situacao === "indo_ate_voce" && (
        <span data-posicao-entregador={posicaoEntregador ? "disponivel" : "indisponivel"} className="text-xs text-conteudo-suave">
          {posicaoEntregador ? rotuloUltimaPosicao({ capturadaEm: posicaoEntregador.capturadaEm }, agora) : "Localização temporariamente indisponível"}
        </span>
      )}
    </span>
  );
}

/**
 * QUEM ESTÁ COM A ENTREGA: identidade pública do Jaa (nome e @usuario). Aparece mesmo se houver
 * bloqueio de mensagens entre os dois — bloqueio corta a conversa, nunca a operação. "Conversar" abre
 * a conversa direta de sempre; se estiver bloqueada, ela abre com o envio desabilitado.
 */
export function EntregadorDaEntrega({ acompanhamento, aoConversarCom }: { acompanhamento: AcompanhamentoPedido; aoConversarCom?: ((nomeUsuario: string) => void) | undefined }) {
  const { entregador, fila } = acompanhamento;
  if (!entregador || fila.situacao === "encerrado") return null;
  return (
    <span data-entregador-da-entrega={entregador.nomeUsuario} className="flex flex-wrap items-center gap-2 text-xs text-conteudo-suave">
      Entregador: <strong className="font-semibold text-conteudo">{entregador.nomeExibicao}</strong> @{entregador.nomeUsuario}
      {aoConversarCom && (
        <button
          type="button"
          data-conversar-entregador={entregador.nomeUsuario}
          onClick={() => aoConversarCom(entregador.nomeUsuario)}
          className="rounded-full border border-borda px-2 py-0.5 text-[11px] font-medium text-marca"
        >
          Conversar
        </button>
      )}
    </span>
  );
}

/**
 * Container do cliente: busca o estado atual (é isto que resolve a RECONEXÃO, sem depender do último
 * evento) e acompanha o realtime do próprio pedido.
 */
export function AcompanhamentoDoPedido({
  pedidoId,
  destino,
  aoConversarCom,
}: {
  pedidoId: string;
  destino?: { latitude: number; longitude: number } | undefined;
  // Abre a conversa DIRETA de sempre com o entregador (nada de chat de entrega).
  aoConversarCom?: ((nomeUsuario: string) => void) | undefined;
}) {
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
    /*
     * A FILA muda sem posição de GPS nenhuma (entrega anterior concluída, cancelamento, reordenação):
     * `pedido:fila` traz a posição atual do PRÓPRIO pedido. Virando a vez dele, relê o acompanhamento
     * completo (com o ponto do entregador, se houver).
     */
    const aoMudarFila = (evento: unknown) => {
      const resultado = eventoPedidoFilaSchema.safeParse(evento);
      if (!resultado.success || resultado.data.pedidoId !== pedidoId) return;
      const fila = resultado.data;
      setAcompanhamento((atual) => ({
        fila,
        entregador: atual?.entregador ?? null,
        posicaoEntregador: fila.situacao === "indo_ate_voce" ? (atual?.posicaoEntregador ?? null) : null,
      }));
      // Relê o todo (entregador atual e, se for a vez dele, o ponto): o evento só avisa.
      void obterAcompanhamentoDoPedido(pedidoId).then((relido) => {
        if (relido.ok) setAcompanhamento(relido.dados);
      });
    };
    socket.on(EVENTO_PEDIDO_ACOMPANHAMENTO, aoAtualizar);
    socket.on(EVENTO_PEDIDO_FILA, aoMudarFila);
    return () => {
      socket.off(EVENTO_PEDIDO_ACOMPANHAMENTO, aoAtualizar);
      socket.off(EVENTO_PEDIDO_FILA, aoMudarFila);
    };
  }, [pedidoId]);

  if (!acompanhamento) return null;

  return (
    <span className="flex flex-col gap-1">
      <ResumoAcompanhamento acompanhamento={acompanhamento} />
      <EntregadorDaEntrega acompanhamento={acompanhamento} {...(aoConversarCom ? { aoConversarCom } : {})} />
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
