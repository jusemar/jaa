import type { EventosRealtimeClienteParaServidor, EventosRealtimeServidorParaCliente } from "@jaa/contratos";
import type { Server, Socket } from "socket.io";
import type { ContextoIdentidadeAutenticada } from "../features/autenticacao/casos-de-uso/autenticar-identidade.js";

// Pelo socket o cliente envia só atividade efêmera; comandos de negócio passam pela API HTTP.
// No servidor, todo payload e callback recebidos são `unknown` até serem validados.
export type EventosRecebidosDoCliente = {
  [Evento in keyof EventosRealtimeClienteParaServidor]: (dados: unknown, responder?: unknown) => void;
};

type SemEventos = Record<string, never>;

// Dados guardados SOMENTE no servidor para cada socket. Nunca contém token ou cookie.
export interface DadosSocketRealtime {
  contexto: ContextoIdentidadeAutenticada;
  // Conversas que esta conexão observa, já autorizadas, com os outros participantes de cada uma.
  observacoes: Map<string, string[]>;
}

export type ServidorRealtime = Server<EventosRecebidosDoCliente, EventosRealtimeServidorParaCliente, SemEventos, DadosSocketRealtime>;
export type SocketRealtime = Socket<EventosRecebidosDoCliente, EventosRealtimeServidorParaCliente, SemEventos, DadosSocketRealtime>;
