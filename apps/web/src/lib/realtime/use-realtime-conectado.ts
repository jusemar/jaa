"use client";

import { useEffect, useSyncExternalStore } from "react";
import { conectarRealtime, desconectarRealtime, obterClienteRealtime } from "./cliente-realtime";

function assinarEstado(notificar: () => void) {
  const socket = obterClienteRealtime();

  socket.on("connect", notificar);
  socket.on("disconnect", notificar);
  socket.on("connect_error", notificar);

  return () => {
    socket.off("connect", notificar);
    socket.off("disconnect", notificar);
    socket.off("connect_error", notificar);
  };
}

function obterEstado() {
  return obterClienteRealtime().connected;
}

function obterEstadoNoServidor() {
  return false;
}

// Apenas observa o estado da conexão; quem decide conectar é useConexaoRealtime.
export function useRealtimeConectado(): boolean {
  return useSyncExternalStore(assinarEstado, obterEstado, obterEstadoNoServidor);
}

/**
 * Mantém o realtime conectado somente enquanto houver sessão com cadastro completo.
 * A API recusa qualquer outro caso; isto só evita tentativas que já se sabe que falhariam.
 * Quedas da API continuam sendo tratadas pela reconexão automática do Socket.IO.
 */
export function useConexaoRealtime(autenticadoComCadastroCompleto: boolean): void {
  useEffect(() => {
    if (autenticadoComCadastroCompleto) {
      conectarRealtime();
    } else {
      desconectarRealtime();
    }
  }, [autenticadoComCadastroCompleto]);
}
