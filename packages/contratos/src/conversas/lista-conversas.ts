import * as z from "zod";
import { mensagemSchema } from "../mensagens/mensagem.ts";
import { participanteConversaSchema } from "./conversa.ts";

export const LIMITE_PAGINA_CONVERSAS_PADRAO = 20;
export const LIMITE_PAGINA_CONVERSAS_MAXIMO = 50;

// A identidade dona da lista nunca é enviada: o servidor a deriva da sessão.
// Paginação por cursor, da atividade mais recente para a mais antiga.
export const listarConversasConsultaSchema = z.object({
  // `ultimaMensagem.id` do último item recebido.
  antesDe: z.uuid().optional(),
  limite: z.coerce
    .number()
    .int()
    .min(1)
    .max(LIMITE_PAGINA_CONVERSAS_MAXIMO)
    .default(LIMITE_PAGINA_CONVERSAS_PADRAO),
});

export type ListarConversasConsulta = z.input<typeof listarConversasConsultaSchema>;

// Somente dados públicos da outra identidade: nunca telefone, e-mail ou conta.
export const itemListaConversasSchema = z.object({
  id: z.uuid(),
  tipo: z.literal("direta"),
  outraIdentidade: participanteConversaSchema,
  // A atividade da conversa é a sua mensagem mais recente; o id (UUIDv7) define a ordem da lista.
  ultimaMensagem: mensagemSchema,
});

export type ItemListaConversas = z.infer<typeof itemListaConversasSchema>;

export const paginaConversasSchema = z.object({
  // Da atividade mais recente para a mais antiga.
  conversas: z.array(itemListaConversasSchema),
  // Passe como `antesDe` para buscar a próxima página; null quando não houver mais.
  proximoCursor: z.uuid().nullable(),
});

export type PaginaConversas = z.infer<typeof paginaConversasSchema>;
