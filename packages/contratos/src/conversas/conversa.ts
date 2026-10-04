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

/**
 * Identidade pública EXIBIDA com avatar (lista de conversas, conversa aberta, contatos, busca).
 * `fotoUrl` já vem decidida pelo SERVIDOR com a privacidade do dono (`visibilidadeFoto` + exceções):
 * null = sem foto OU não é para você ver — o cliente não distingue e mostra as iniciais.
 * Nunca carrega a chave do arquivo no storage.
 */
export const identidadeVisivelSchema = participanteConversaSchema.extend({
  fotoUrl: z.url().nullable(),
});

export type IdentidadeVisivel = z.infer<typeof identidadeVisivelSchema>;

export const conversaDiretaSchema = z.object({
  id: z.uuid(),
  tipo: z.literal("direta"),
  participantes: z.array(identidadeVisivelSchema).length(2),
});

export type ConversaDireta = z.infer<typeof conversaDiretaSchema>;
