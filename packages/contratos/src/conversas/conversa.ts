import * as z from "zod";
import { tipoIdentidadeSchema } from "../identidades/identidade-operavel.ts";
import { nomeUsuarioSchema } from "../identidades/identidade-pessoal.ts";

// A identidade de ORIGEM nunca vai no corpo: é a identidade atuante autorizada pelo servidor
// (pessoal por padrão; empresarial via CABECALHO_IDENTIDADE_ATUANTE). O destino pode ser pessoa ou empresa ativa.
export const abrirConversaDiretaEntradaSchema = z.object({
  nomeUsuario: nomeUsuarioSchema,
});

export type AbrirConversaDiretaEntrada = z.input<typeof abrirConversaDiretaEntradaSchema>;

// Dados PÚBLICOS de quem participa. `tipo` permite ao cliente oferecer ações de empresa (ex.: Ver produtos);
// nunca revela a conta ou a pessoa que opera uma identidade empresarial.
export const participanteConversaSchema = z.object({
  identidadeId: z.uuid(),
  tipo: tipoIdentidadeSchema,
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
