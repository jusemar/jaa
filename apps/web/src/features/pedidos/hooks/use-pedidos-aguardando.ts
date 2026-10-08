"use client";

import { EVENTO_PEDIDO_NOVO, EVENTO_PEDIDO_STATUS_ATUALIZADO } from "@jaa/contratos";
import { useEffect, useState } from "react";
import { obterClienteRealtime } from "@/lib/realtime/cliente-realtime";
import { listarPedidosDaEmpresa } from "../lib/api-pedidos";

/**
 * CONTADOR DO ITEM "PEDIDOS" (empresa): quantos pedidos estão RECEBIDOS, isto é, aguardando a empresa
 * agir. Mesmo desenho das não lidas de Conversas: não há contador paralelo — o número é derivado do
 * estado real no servidor (o `total` do filtro "Recebidos" da lista de pedidos) e é o mesmo para
 * todos os operadores e depois de recarregar. Sobe quando chega pedido novo e desce quando a empresa
 * o atende (inicia a preparação ou cancela); só olhar a lista não o esconde, porque o pedido continua
 * esperando ação.
 *
 * Relê nos MOMENTOS em que pode mudar (`pedido:novo`, `pedido:status-atualizado`, reconexão) — nunca
 * de tempos em tempos. `empresaId` nulo (agindo como pessoa) = sem contador.
 */
export function usePedidosAguardando(empresaId: string | null): number {
  const [estado, setEstado] = useState<{ empresaId: string | null; total: number }>({ empresaId: null, total: 0 });

  useEffect(() => {
    if (!empresaId) return;
    const socket = obterClienteRealtime();
    let ativo = true;
    let geracao = 0;

    async function recarregar() {
      const minha = ++geracao;
      const resposta = await listarPedidosDaEmpresa(empresaId as string, { filtro: "recebidos", limite: 1 });
      // Resposta atrasada (outra releitura já saiu, ou a identidade mudou) não sobrescreve a atual.
      if (!ativo || minha !== geracao || !resposta.ok) return;
      setEstado({ empresaId, total: resposta.dados.total });
    }
    const aoMudar = () => void recarregar();

    socket.on("connect", aoMudar);
    socket.on(EVENTO_PEDIDO_NOVO, aoMudar);
    socket.on(EVENTO_PEDIDO_STATUS_ATUALIZADO, aoMudar);
    void recarregar();

    return () => {
      ativo = false;
      socket.off("connect", aoMudar);
      socket.off(EVENTO_PEDIDO_NOVO, aoMudar);
      socket.off(EVENTO_PEDIDO_STATUS_ATUALIZADO, aoMudar);
    };
  }, [empresaId]);

  return estado.empresaId === empresaId ? estado.total : 0;
}
