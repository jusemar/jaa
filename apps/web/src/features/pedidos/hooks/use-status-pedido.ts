"use client";

import { EVENTO_PEDIDO_STATUS_ATUALIZADO, eventoPedidoStatusAtualizadoSchema, type EventoPedidoStatusAtualizado } from "@jaa/contratos";
import { useEffect, useRef } from "react";
import { obterClienteRealtime } from "@/lib/realtime/cliente-realtime";

/**
 * Mudanças de status do Pedido entregues pela conexão realtime já autenticada (o servidor só envia a
 * quem tem relação com o pedido). É reconciliação de interface: a fonte da verdade continua sendo a
 * API — por isso quem usa pode reconsultar o pedido quando precisar de detalhe.
 */
export function useStatusPedido(aoAtualizar: (evento: EventoPedidoStatusAtualizado) => void) {
  // O ouvinte vive enquanto a conexão existir; a ref mantém o callback atual sem reassinar o evento.
  const aoAtualizarRef = useRef(aoAtualizar);
  useEffect(() => {
    aoAtualizarRef.current = aoAtualizar;
  }, [aoAtualizar]);

  useEffect(() => {
    const socket = obterClienteRealtime();
    const aoReceber = (evento: unknown) => {
      const resultado = eventoPedidoStatusAtualizadoSchema.safeParse(evento);
      if (resultado.success) aoAtualizarRef.current(resultado.data);
    };
    socket.on(EVENTO_PEDIDO_STATUS_ATUALIZADO, aoReceber);
    return () => {
      socket.off(EVENTO_PEDIDO_STATUS_ATUALIZADO, aoReceber);
    };
  }, []);
}
