"use client";

import {
  EVENTO_CONVERSA_NAO_LIDAS,
  EVENTO_NOTIFICACAO_NOVA_MENSAGEM,
  EVENTO_PEDIDO_ENTREGA_PROXIMA,
  EVENTO_PEDIDO_NOVO,
  TEXTO_AVISO_ENTREGA_PROXIMA,
  deveTocarSomDeMensagem,
  eventoPedidoNovoSchema,
  eventoPedidoEntregaProximaSchema,
  resumoNaoLidasSchema,
  type EventoConversaNaoLidas,
  type EventoNotificacaoNovaMensagem,
} from "@jaa/contratos";
import { useEffect, useRef, useState } from "react";
import { avisarEmDestaque } from "@/components/ui/avisos";
import { requisitarApi } from "@/lib/api";
import { cabecalhosIdentidadeAtuante } from "@/lib/identidade-atuante";
import { obterClienteRealtime } from "@/lib/realtime/cliente-realtime";
import { conversaVisivelAgora } from "../lib/conversa-em-leitura";
import { aplicarNaoLidas, combinarResumo, totalNaoLidas, type NaoLidasPorConversa } from "../lib/nao-lidas-globais";
import { PADRAO_SOM_ENTREGA_PROXIMA, PADRAO_SOM_NOVO_PEDIDO, criarTocadorSom, criarTocadorSomMensagem, type ContextoAudioMinimo, type TocadorSomMensagem } from "../lib/som-mensagem";

// UM contexto de áudio para a aba, liberado na primeira interação e usado pelos dois sons.
let contexto: AudioContext | null = null;
const contextoCompartilhado = (): ContextoAudioMinimo | null => {
  if (typeof window === "undefined" || !("AudioContext" in window)) return null;
  contexto ??= new window.AudioContext();
  return contexto;
};
let tocador: TocadorSomMensagem | null = null;
let tocadorEntrega: TocadorSomMensagem | null = null;
let tocadorPedido: TocadorSomMensagem | null = null;

function obterTocador(): TocadorSomMensagem {
  tocador ??= criarTocadorSomMensagem(contextoCompartilhado);
  return tocador;
}
function obterTocadorPedido(): TocadorSomMensagem {
  tocadorPedido ??= criarTocadorSom(contextoCompartilhado, PADRAO_SOM_NOVO_PEDIDO);
  return tocadorPedido;
}
function obterTocadorEntrega(): TocadorSomMensagem {
  tocadorEntrega ??= criarTocadorSom(contextoCompartilhado, PADRAO_SOM_ENTREGA_PROXIMA);
  return tocadorEntrega;
}

/**
 * AVISOS DE MENSAGEM em qualquer área do Jaa (vive no app, não só na tela de Conversas):
 * - total de NÃO LIDAS da identidade ATUANTE, para o indicador da navegação;
 * - SOM curto quando chega mensagem RECEBIDA (`notificacao:nova-mensagem`, que o servidor só manda a
 *   destinatários — nunca a quem enviou), EXCETO da conversa que a pessoa está vendo agora;
 * - "Sua entrega é a próxima" (`pedido:entrega-proxima`): aviso em destaque + som próprio. O servidor
 *   manda só ao cliente dono do pedido, uma vez por parada; aqui o mesmo aviso nunca toca duas vezes.
 *
 * O socket da aba age como UMA identidade: os eventos já chegam só da identidade atuante. Ao trocar
 * de identidade, o estado da anterior é descartado (fica associado ao id) e o resumo é relido.
 */
export function useAvisosMensagens(identidadeAtivaId: string | null, agindoComoEmpresa = false): number {
  const [estado, setEstado] = useState<{ identidadeId: string | null; porConversa: NaoLidasPorConversa }>({ identidadeId: null, porConversa: new Map() });
  const atualizadasDuranteBusca = useRef(new Set<string>());
  const geracao = useRef(0);

  // O navegador só libera áudio depois de uma interação: a primeira delas habilita o som.
  useEffect(() => {
    const habilitar = () => {
      obterTocador().habilitar();
      obterTocadorEntrega().habilitar();
      obterTocadorPedido().habilitar();
      for (const evento of ["pointerdown", "keydown", "touchstart"] as const) window.removeEventListener(evento, habilitar);
    };
    for (const evento of ["pointerdown", "keydown", "touchstart"] as const) window.addEventListener(evento, habilitar, { passive: true });
    return () => {
      for (const evento of ["pointerdown", "keydown", "touchstart"] as const) window.removeEventListener(evento, habilitar);
    };
  }, []);

  useEffect(() => {
    if (!identidadeAtivaId) return;
    const socket = obterClienteRealtime();
    const doEstado = (atual: { identidadeId: string | null; porConversa: NaoLidasPorConversa }) =>
      atual.identidadeId === identidadeAtivaId ? atual.porConversa : new Map<string, number>();

    async function recarregar() {
      const minha = ++geracao.current;
      atualizadasDuranteBusca.current.clear();
      const resposta = await requisitarApi("/conversas/nao-lidas", resumoNaoLidasSchema, { headers: cabecalhosIdentidadeAtuante() });
      // Resposta de uma identidade/conexão anterior não sobrescreve a atual.
      if (minha !== geracao.current || !resposta.ok) return;
      setEstado((atual) => ({ identidadeId: identidadeAtivaId, porConversa: combinarResumo(doEstado(atual), resposta.dados, atualizadasDuranteBusca.current) }));
    }

    const aoMudarNaoLidas = (evento: EventoConversaNaoLidas) => {
      atualizadasDuranteBusca.current.add(evento.conversaId);
      setEstado((atual) => ({ identidadeId: identidadeAtivaId, porConversa: aplicarNaoLidas(doEstado(atual), evento) }));
    };
    const aoReceberMensagem = (evento: EventoNotificacaoNovaMensagem) => {
      // Conversa que a pessoa está VENDO agora (aberta + página visível e em foco) não faz barulho.
      const tocar = deveTocarSomDeMensagem({
        remetenteIdentidadeId: evento.remetente.identidadeId,
        conversaId: evento.conversaId,
        identidadeAtivaId,
        conversaVisivelId: conversaVisivelAgora(),
      });
      if (tocar) obterTocador().tocar(evento.mensagemId);
      else obterTocador().silenciar(evento.mensagemId);
    };

    /*
     * NOVO PEDIDO para a EMPRESA (`pedido:novo`, que o servidor manda só à identidade da empresa):
     * toca o som de PEDIDO, uma vez por pedido — reentrega ou reconexão não repetem. Pedido não gera
     * mensagem nem notificação para a empresa, então o som de mensagem não toca junto.
     */
    const aoChegarPedido = (evento: unknown) => {
      if (!agindoComoEmpresa) return;
      const lido = eventoPedidoNovoSchema.safeParse(evento);
      if (lido.success) obterTocadorPedido().tocar(lido.data.pedidoId);
    };

    const aoVirarProxima = (evento: unknown) => {
      const aviso = eventoPedidoEntregaProximaSchema.safeParse(evento);
      // Mesmo aviso (reconexão, evento repetido, outra aba do mesmo aviso) não repete som nem aviso.
      if (!aviso.success || !obterTocadorEntrega().tocar(aviso.data.avisoId)) return;
      avisarEmDestaque(TEXTO_AVISO_ENTREGA_PROXIMA.titulo, TEXTO_AVISO_ENTREGA_PROXIMA.orientacao);
    };

    socket.on("connect", recarregar);
    socket.on(EVENTO_CONVERSA_NAO_LIDAS, aoMudarNaoLidas);
    socket.on(EVENTO_PEDIDO_NOVO, aoChegarPedido);
    socket.on(EVENTO_NOTIFICACAO_NOVA_MENSAGEM, aoReceberMensagem);
    socket.on(EVENTO_PEDIDO_ENTREGA_PROXIMA, aoVirarProxima);
    if (socket.connected) void recarregar();

    return () => {
      geracao.current += 1;
      socket.off("connect", recarregar);
      socket.off(EVENTO_CONVERSA_NAO_LIDAS, aoMudarNaoLidas);
      socket.off(EVENTO_PEDIDO_NOVO, aoChegarPedido);
      socket.off(EVENTO_NOTIFICACAO_NOVA_MENSAGEM, aoReceberMensagem);
      socket.off(EVENTO_PEDIDO_ENTREGA_PROXIMA, aoVirarProxima);
    };
  }, [identidadeAtivaId, agindoComoEmpresa]);

  return estado.identidadeId === identidadeAtivaId ? totalNaoLidas(estado.porConversa) : 0;
}
