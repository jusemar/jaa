import type { EventosRealtimeClienteParaServidor, EventosRealtimeServidorParaCliente } from "@jaa/contratos";
import { io, type Socket } from "socket.io-client";
import { URL_API } from "@/lib/configuracao";
import { aoMudarIdentidadeAtuante, obterIdentidadeAtuante } from "@/lib/identidade-atuante";

export type ClienteRealtime = Socket<EventosRealtimeServidorParaCliente, EventosRealtimeClienteParaServidor>;

let cliente: ClienteRealtime | null = null;

// Uma única conexão por aba: todas as partes do Web compartilham o mesmo socket.
// Criado sob demanda para nunca ser instanciado durante a renderização no servidor.
export function obterClienteRealtime(): ClienteRealtime {
  if (!cliente) {
    const socket: ClienteRealtime = io(URL_API, {
      autoConnect: false,
      // Envia o cookie HttpOnly de sessão no handshake; a API identifica a conta a partir dele.
      withCredentials: true,
      // Identidade atuante pedida a CADA (re)conexão; a API recusa se a conta não puder operá-la.
      auth: (responder) => {
        const identidadeId = obterIdentidadeAtuante();
        responder(identidadeId ? { identidadeId } : {});
      },
    });
    // Uma conexão age como UMA identidade: trocar de identidade = reconectar com nova autorização.
    aoMudarIdentidadeAtuante(() => {
      if (!socket.active) return;
      socket.disconnect();
      socket.connect();
    });
    cliente = socket;
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
