"use client";

import { EVENTO_MENSAGEM_NOVA, eventoMensagemNovaSchema } from "@jaa/contratos";
import { useEffect } from "react";
import { obterClienteRealtime } from "@/lib/realtime/cliente-realtime";
import { confirmarRecebimentos } from "../lib/confirmar-recebimentos";

// Toda mensagem recebida em realtime por esta aba é confirmada como recebida, esteja a conversa
// aberta ou não. Receber NÃO é ler: a leitura é confirmada só pela conversa aberta e visível.
export function useConfirmacaoRecebimento(identidadeId: string) {
  useEffect(() => {
    const socket = obterClienteRealtime();
    const aoReceber = (evento: unknown) => {
      const resultado = eventoMensagemNovaSchema.safeParse(evento);
      if (resultado.success) confirmarRecebimentos(identidadeId, [resultado.data.mensagem]);
    };
    socket.on(EVENTO_MENSAGEM_NOVA, aoReceber);
    return () => {
      socket.off(EVENTO_MENSAGEM_NOVA, aoReceber);
    };
  }, [identidadeId]);
}
