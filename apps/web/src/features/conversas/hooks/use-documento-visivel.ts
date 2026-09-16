"use client";

import { useSyncExternalStore } from "react";

function assinar(notificar: () => void) {
  document.addEventListener("visibilitychange", notificar);
  return () => document.removeEventListener("visibilitychange", notificar);
}

// Aba/janela visível para o usuário (Page Visibility API). Aba em segundo plano não conta como leitura.
export function useDocumentoVisivel(): boolean {
  return useSyncExternalStore(
    assinar,
    () => document.visibilityState === "visible",
    () => false,
  );
}
