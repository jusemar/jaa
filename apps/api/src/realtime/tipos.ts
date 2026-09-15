import type { Server, Socket } from "socket.io";
import type { ContextoConexaoAutenticada } from "../features/autenticacao/casos-de-uso/autenticar-conexao-realtime.js";

// Nenhum evento funcional existe ainda: mensagens, presença e afins não foram iniciados.
type SemEventos = Record<string, never>;

// Dados guardados SOMENTE no servidor para cada socket. Nunca contém token ou cookie.
export interface DadosSocketRealtime {
  contexto: ContextoConexaoAutenticada;
}

export type ServidorRealtime = Server<SemEventos, SemEventos, SemEventos, DadosSocketRealtime>;
export type SocketRealtime = Socket<SemEventos, SemEventos, SemEventos, DadosSocketRealtime>;
