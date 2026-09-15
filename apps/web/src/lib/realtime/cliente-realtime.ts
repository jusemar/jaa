import type { EventosRealtimeServidorParaCliente } from "@jaa/contratos";
import { io, type Socket } from "socket.io-client";
import { URL_API } from "@/lib/configuracao";

export type ClienteRealtime = Socket<EventosRealtimeServidorParaCliente>;

let cliente: ClienteRealtime | null = null;

// Uma única conexão por aba: todas as partes do Web compartilham o mesmo socket.
// Criado sob demanda para nunca ser instanciado durante a renderização no servidor.
export function obterClienteRealtime(): ClienteRealtime {
  if (!cliente) {
    cliente = io(URL_API, {
      autoConnect: false,
      // Envia o cookie HttpOnly de sessão no handshake; a API identifica a conta a partir dele.
      withCredentials: true,
    });
  }

  return cliente;
}

export function conectarRealtime(): void {
  const socket = obterClienteRealtime();

  // `active` cobre também o período de reconexão automática em andamento.
  if (!socket.active) {
    socket.connect();
  }
}

export function desconectarRealtime(): void {
  obterClienteRealtime().disconnect();
}
