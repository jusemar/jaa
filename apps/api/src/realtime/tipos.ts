import type { EventosRealtimeServidorParaCliente } from "@jaa/contratos";
import type { Server, Socket } from "socket.io";
import type { ContextoIdentidadeAutenticada } from "../features/autenticacao/casos-de-uso/autenticar-identidade.js";

// O cliente ainda não envia eventos funcionais: comandos (ex.: enviar mensagem) passam pela API HTTP.
type SemEventos = Record<string, never>;

// Dados guardados SOMENTE no servidor para cada socket. Nunca contém token ou cookie.
export interface DadosSocketRealtime {
  contexto: ContextoIdentidadeAutenticada;
}

export type ServidorRealtime = Server<SemEventos, EventosRealtimeServidorParaCliente, SemEventos, DadosSocketRealtime>;
export type SocketRealtime = Socket<SemEventos, EventosRealtimeServidorParaCliente, SemEventos, DadosSocketRealtime>;
