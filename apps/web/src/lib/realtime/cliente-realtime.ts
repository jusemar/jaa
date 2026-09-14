import { io, type Socket } from "socket.io-client";

const URL_REALTIME = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3333";

let cliente: Socket | null = null;

// Uma única conexão por aba: todas as partes do Web compartilham o mesmo socket.
// Criado sob demanda para nunca ser instanciado durante a renderização no servidor.
export function obterClienteRealtime(): Socket {
  if (!cliente) {
    cliente = io(URL_REALTIME, {
      autoConnect: false,
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
