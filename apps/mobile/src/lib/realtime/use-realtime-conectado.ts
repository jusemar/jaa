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

const obterEstado = () => obterClienteRealtime().connected;

export function useRealtimeConectado(): boolean {
  return useSyncExternalStore(assinarEstado, obterEstado, () => false);
}

// Conecta quando há conta com cadastro completo; sair da conta derruba a conexão.
export function useConexaoRealtime(autenticadoComCadastroCompleto: boolean): void {
  useEffect(() => {
    if (autenticadoComCadastroCompleto) void conectarRealtime();
    else desconectarRealtime();
  }, [autenticadoComCadastroCompleto]);
}
