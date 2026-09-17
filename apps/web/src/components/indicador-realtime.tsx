"use client";

import { useRealtimeConectado } from "@/lib/realtime/use-realtime-conectado";

/*
 * Estado da conexão em tempo real.
 *
 * Só APARECE quando a conexão cai: num mensageiro, "conectado" é o esperado e anunciá-lo o tempo
 * todo é ruído. Quando cai, porém, a pessoa precisa saber na hora — senão acha que a mensagem foi
 * entregue e ela não foi. Fica no topo, centralizado e flutuando — sem empurrar o conteúdo e sem
 * disputar espaço com os avisos de mensagem nova, que ficam no rodapé.
 */
export function IndicadorRealtime() {
  const conectado = useRealtimeConectado();

  return (
    <p
      role="status"
      aria-live="polite"
      data-realtime={conectado ? "conectado" : "desconectado"}
      className={`pointer-events-none fixed inset-x-0 top-3 z-40 mx-auto flex w-fit max-w-[calc(100vw-2rem)] items-center gap-2 rounded-full bg-conteudo/90 px-3 py-1.5 text-xs font-medium text-marca-conteudo shadow-suave ${
        conectado ? "sr-only" : ""
      }`}
    >
      <span aria-hidden className="h-2 w-2 rounded-full bg-perigo" />
      {conectado ? "Conectado" : "Sem conexão com o Jaa. Tentando reconectar…"}
    </p>
  );
}
