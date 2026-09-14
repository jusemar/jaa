"use client";

import { useRealtimeConectado } from "@/lib/realtime/use-realtime-conectado";

// Indicador temporário para validar o fluxo Web → Socket.IO → API.
export function IndicadorRealtime() {
  const conectado = useRealtimeConectado();

  return (
    <p
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300"
    >
      <span
        aria-hidden="true"
        className={`h-2.5 w-2.5 rounded-full ${conectado ? "bg-green-500" : "bg-red-500"}`}
      />
      Realtime: {conectado ? "Conectado" : "Desconectado"}
    </p>
  );
}
