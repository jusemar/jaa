"use client";

import { useEffect, useSyncExternalStore } from "react";
import { conectarRealtime, obterClienteRealtime } from "./cliente-realtime";

function assinarEstado(notificar: () => void) {
  const socket = obterClienteRealtime();

  socket.on("connect", notificar);
  socket.on("disconnect", notificar);

  return () => {
    socket.off("connect", notificar);
    socket.off("disconnect", notificar);
  };
}

function obterEstado() {
  return obterClienteRealtime().connected;
}

function obterEstadoNoServidor() {
  return false;
}

export function useRealtimeConectado(): boolean {
  useEffect(() => {
    conectarRealtime();
  }, []);

  return useSyncExternalStore(assinarEstado, obterEstado, obterEstadoNoServidor);
}
