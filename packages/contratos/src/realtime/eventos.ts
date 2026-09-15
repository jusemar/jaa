import * as z from "zod";
import { mensagemSchema } from "../mensagens/mensagem.ts";

// Emitido SOMENTE depois que a mensagem foi persistida no PostgreSQL.
export const EVENTO_MENSAGEM_NOVA = "mensagem:nova";

export const eventoMensagemNovaSchema = z.object({
  mensagem: mensagemSchema,
});

export type EventoMensagemNova = z.infer<typeof eventoMensagemNovaSchema>;

// Eventos que a API envia ao cliente. O cliente ainda não envia eventos funcionais.
export interface EventosRealtimeServidorParaCliente {
  [EVENTO_MENSAGEM_NOVA]: (evento: EventoMensagemNova) => void;
}
