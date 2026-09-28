import * as z from "zod";
import { mensagemSchema } from "../mensagens/mensagem.ts";
import { participanteConversaSchema } from "./conversa.ts";

export const LIMITE_PAGINA_CONVERSAS_PADRAO = 20;

// A contagem de não lidas para neste valor: `naoLidas === LIMITE_CONTAGEM_NAO_LIDAS` significa
// "este número ou mais" (a interface exibe "99+"). Mantém o custo por conversa limitado.
export const LIMITE_CONTAGEM_NAO_LIDAS = 100;

// Mensagens recebidas (de outras identidades) depois do marcador de leitura, sem as excluídas para
// todos e sem as excluídas para quem conta. Calculada pelo servidor a partir do estado persistido.
export const contagemNaoLidasSchema = z.number().int().min(0).max(LIMITE_CONTAGEM_NAO_LIDAS);
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
  // Mensagem mais recente que ESTA identidade vê. null = ela LIMPOU a conversa e nada novo chegou.
  ultimaMensagem: mensagemSchema.nullable(),
  // Ordem e cursor da lista (UUIDv7): a última mensagem visível ou, na conversa limpa, até onde limpou.
  atividadeId: z.uuid(),
  naoLidas: contagemNaoLidasSchema,
  // Há bloqueio de comunicação (qualquer sentido) com a outra PESSOA: a lista mostra 🚫.
  comunicacaoBloqueada: z.boolean(),
});

export type ItemListaConversas = z.infer<typeof itemListaConversasSchema>;

export const paginaConversasSchema = z.object({
  // Da atividade mais recente para a mais antiga.
  conversas: z.array(itemListaConversasSchema),
  // Passe como `antesDe` para buscar a próxima página; null quando não houver mais.
  proximoCursor: z.uuid().nullable(),
});

export type PaginaConversas = z.infer<typeof paginaConversasSchema>;

/**
 * RESUMO DE NÃO LIDAS da identidade ATUANTE (para o indicador de Conversas em qualquer área): só as
 * conversas que têm não lidas, com a MESMA contagem derivada do marcador de leitura que a lista usa
 * — não é um contador paralelo. O cliente combina com `conversa:nao-lidas` (valor absoluto).
 */
export const resumoNaoLidasSchema = z.object({
  conversas: z.array(z.object({ conversaId: z.uuid(), naoLidas: contagemNaoLidasSchema })),
});

export type ResumoNaoLidas = z.infer<typeof resumoNaoLidasSchema>;

/**
 * A PRÓPRIA identidade limpou ou apagou a conversa (só para ela). Vai para todas as conexões dela, que
 * esvaziam o histórico mostrado ("limpa") ou tiram a conversa da lista ("apagada"). O outro participante
 * não recebe nada: para ele, nada mudou.
 */
export const EVENTO_CONVERSA_ESTADO_PESSOAL = "conversa:estado-pessoal";

export const eventoConversaEstadoPessoalSchema = z.object({ conversaId: z.uuid(), acao: z.enum(["limpa", "apagada"]) });

export type EventoConversaEstadoPessoal = z.infer<typeof eventoConversaEstadoPessoalSchema>;
