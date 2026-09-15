import * as z from "zod";
import { nomeUsuarioSchema } from "../identidades/identidade-pessoal.ts";

// A identidade de ORIGEM nunca é enviada: o servidor a deriva da sessão.
export const abrirConversaDiretaEntradaSchema = z.object({
  nomeUsuario: nomeUsuarioSchema,
});

export type AbrirConversaDiretaEntrada = z.input<typeof abrirConversaDiretaEntradaSchema>;

export const participanteConversaSchema = z.object({
  identidadeId: z.uuid(),
  nomeExibicao: z.string(),
  nomeUsuario: z.string(),
});

export type ParticipanteConversa = z.infer<typeof participanteConversaSchema>;

export const conversaDiretaSchema = z.object({
  id: z.uuid(),
  tipo: z.literal("direta"),
  participantes: z.array(participanteConversaSchema).length(2),
});

export type ConversaDireta = z.infer<typeof conversaDiretaSchema>;
