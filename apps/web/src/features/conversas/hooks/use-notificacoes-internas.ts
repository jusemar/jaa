"use client";

import { EVENTO_NOTIFICACAO_NOVA_MENSAGEM, eventoNotificacaoNovaMensagemSchema, type EventoNotificacaoNovaMensagem } from "@jaa/contratos";
import { useCallback, useEffect, useRef, useState } from "react";
import { obterClienteRealtime } from "@/lib/realtime/cliente-realtime";
import { deveExibirNotificacao, registrarAviso } from "../lib/notificacoes";

const DURACAO_AVISO_MS = 6000;

/**
 * Avisos in-app de nova mensagem (sem permissão do navegador e sem provedor externo).
 * Não substitui o estado: lista e não lidas continuam sendo a fonte da verdade. Cada aba decide
 * se exibe; nada aqui é persistido.
 */
export function useNotificacoesInternas({ identidadeId, conversaEmLeituraId }: { identidadeId: string; conversaEmLeituraId: string | null }) {
  const [avisos, setAvisos] = useState<EventoNotificacaoNovaMensagem[]>([]);
  const jaExibidasRef = useRef(new Set<string>());
  const conversaEmLeituraRef = useRef(conversaEmLeituraId);

  useEffect(() => {
    conversaEmLeituraRef.current = conversaEmLeituraId;
  }, [conversaEmLeituraId]);

  const dispensar = useCallback((mensagemId: string) => {
    setAvisos((atuais) => atuais.filter((aviso) => aviso.mensagemId !== mensagemId));
  }, []);

  useEffect(() => {
    const socket = obterClienteRealtime();
    const temporizadores = new Set<ReturnType<typeof setTimeout>>();

    const aoNotificar = (evento: unknown) => {
      const resultado = eventoNotificacaoNovaMensagemSchema.safeParse(evento);
      if (!resultado.success) return;
      const notificacao = resultado.data;
      const contexto = { notificacao, identidadeId, conversaEmLeituraId: conversaEmLeituraRef.current, jaExibidas: jaExibidasRef.current };
      if (!deveExibirNotificacao(contexto)) return;

      setAvisos((atuais) => registrarAviso(atuais, jaExibidasRef.current, notificacao));
      const temporizador = setTimeout(() => {
        temporizadores.delete(temporizador);
        dispensar(notificacao.mensagemId);
      }, DURACAO_AVISO_MS);
      temporizadores.add(temporizador);
    };

    socket.on(EVENTO_NOTIFICACAO_NOVA_MENSAGEM, aoNotificar);
    return () => {
      socket.off(EVENTO_NOTIFICACAO_NOVA_MENSAGEM, aoNotificar);
      for (const temporizador of temporizadores) clearTimeout(temporizador);
    };
  }, [identidadeId, dispensar]);

  // Abrir a conversa (pela lista ou pelo aviso) remove os avisos dela.
  useEffect(() => {
    if (!conversaEmLeituraId) return;
    const temporizador = setTimeout(() => setAvisos((atuais) => atuais.filter((aviso) => aviso.conversaId !== conversaEmLeituraId)), 0);
    return () => clearTimeout(temporizador);
  }, [conversaEmLeituraId]);

  return { avisos, dispensar };
}
