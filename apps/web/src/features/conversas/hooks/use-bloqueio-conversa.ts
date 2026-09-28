"use client";

import { EVENTO_BLOQUEIO_ATUALIZADO, eventoBloqueioAtualizadoSchema, type SituacaoBloqueio } from "@jaa/contratos";
import { useCallback, useEffect, useState } from "react";
import { obterClienteRealtime } from "@/lib/realtime/cliente-realtime";
import { bloquearIdentidade, desbloquearIdentidade, obterSituacaoBloqueio } from "../lib/api-bloqueios";

/**
 * Situação de BLOQUEIO com a outra pessoa da conversa. O servidor é a verdade (ele recusa o envio de
 * qualquer jeito); aqui só se mostra o estado e se oferece bloquear/desbloquear. Quando a outra
 * pessoa bloqueia ou desbloqueia, `bloqueio:atualizado` chega e a situação é relida — sem F5.
 */
export function useBloqueioConversa(outraIdentidadeId: string) {
  const [estado, setEstado] = useState<{ de: string; situacao: SituacaoBloqueio } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const reler = useCallback(async () => {
    const resposta = await obterSituacaoBloqueio(outraIdentidadeId);
    if (resposta.ok) setEstado({ de: outraIdentidadeId, situacao: resposta.dados });
  }, [outraIdentidadeId]);

  useEffect(() => {
    void Promise.resolve().then(reler);
    const socket = obterClienteRealtime();
    const aoAtualizar = (evento: unknown) => {
      const lido = eventoBloqueioAtualizadoSchema.safeParse(evento);
      if (lido.success && lido.data.identidadeId === outraIdentidadeId) void reler();
    };
    socket.on(EVENTO_BLOQUEIO_ATUALIZADO, aoAtualizar);
    // Reconexão: relê o estado atual (um evento pode ter passado enquanto a conexão caiu).
    socket.on("connect", reler);
    return () => {
      socket.off(EVENTO_BLOQUEIO_ATUALIZADO, aoAtualizar);
      socket.off("connect", reler);
    };
  }, [outraIdentidadeId, reler]);

  async function aplicar(acao: (identidadeId: string) => ReturnType<typeof bloquearIdentidade>): Promise<boolean> {
    setOcupado(true);
    try {
      const resposta = await acao(outraIdentidadeId);
      if (!resposta.ok) {
        setErro(resposta.mensagem);
        return false;
      }
      setErro(null);
      setEstado({ de: outraIdentidadeId, situacao: resposta.dados });
      return true;
    } finally {
      setOcupado(false);
    }
  }

  return {
    // null enquanto carrega (ou de outra conversa): a tela não afirma nada sem saber.
    situacao: estado?.de === outraIdentidadeId ? estado.situacao : null,
    ocupado,
    erro,
    bloquear: () => aplicar(bloquearIdentidade),
    desbloquear: () => aplicar(desbloquearIdentidade),
    reler,
  };
}
