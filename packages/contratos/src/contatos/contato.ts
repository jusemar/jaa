import * as z from "zod";
import { participanteConversaSchema } from "../conversas/conversa.ts";

/*
 * CONTATOS e BUSCA.
 *
 * Contato é relação UNILATERAL e por IDENTIDADE: salvar alguém coloca a pessoa na MINHA agenda e não
 * me coloca na dela; a agenda pessoal nunca se mistura com a da empresa que eu opero.
 *
 * Contato também não é autorização: dá para conversar com quem não está salvo, e salvar alguém não
 * dá acesso a nada além do que já era público.
 */

export const APELIDO_CONTATO_TAMANHO_MAXIMO = 40;

export const contatoSchema = z.object({
  // Identidade pública de quem foi salvo (nome, @usuario) — nunca telefone, conta ou e-mail.
  identidade: participanteConversaSchema,
  // Como EU chamo essa pessoa na minha agenda; não altera o nome público dela.
  apelido: z.string().nullable(),
  favorito: z.boolean(),
  criadoEm: z.iso.datetime(),
});

export type Contato = z.infer<typeof contatoSchema>;

export const listaContatosSchema = z.object({ contatos: z.array(contatoSchema) });

export type ListaContatos = z.infer<typeof listaContatosSchema>;

export const salvarContatoEntradaSchema = z.object({
  identidadeId: z.uuid(),
  apelido: z.string().trim().max(APELIDO_CONTATO_TAMANHO_MAXIMO).optional(),
});

export type SalvarContatoEntrada = z.infer<typeof salvarContatoEntradaSchema>;

/* ---------- Busca única ---------- */

// Descoberta é limitada de propósito: a busca serve para achar quem você procura, não para varrer o Jaa.
export const LIMITE_RESULTADOS_EXTERNOS = 5;
export const TERMO_BUSCA_TAMANHO_MINIMO = 2;

/**
 * Resultado de busca. É a mesma identidade pública de sempre, com o mínimo para a pessoa reconhecer
 * quem é: nome, @usuario e se é empresa. TELEFONE NUNCA aparece aqui — nem quando a busca foi feita
 * por telefone.
 */
export const resultadoBuscaSchema = z.object({
  identidade: participanteConversaSchema,
  // true quando já está na minha agenda (a interface separa "meus contatos" de "no Jaa").
  ehContato: z.boolean(),
  apelido: z.string().nullable(),
});

export type ResultadoBusca = z.infer<typeof resultadoBuscaSchema>;

export const respostaBuscaSchema = z.object({
  // Meus contatos primeiro: é quem eu procuro na maior parte das vezes.
  contatos: z.array(resultadoBuscaSchema),
  // Descoberta no Jaa, limitada a LIMITE_RESULTADOS_EXTERNOS.
  externos: z.array(resultadoBuscaSchema),
});

export type RespostaBusca = z.infer<typeof respostaBuscaSchema>;

/** Só dígitos e comprimento de celular brasileiro: é assim que a busca decide se parece telefone. */
export function termoParecePelefone(termo: string): boolean {
  const digitos = termo.replace(/\D/g, "");
  return digitos.length >= 10 && digitos.length <= 13 && /^[\d\s()+-]+$/.test(termo.trim());
}

/** Iniciais para o avatar quando não há foto: "Junior Rocha" → "JR", "Pizzaria" → "PI". */
export function iniciaisDoNome(nome: string): string {
  const partes = nome
    .trim()
    .split(/\s+/)
    .filter((parte) => parte.length > 0);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return (partes[0] as string).slice(0, 2).toLocaleUpperCase("pt-BR");
  return `${(partes[0] as string)[0]}${(partes.at(-1) as string)[0]}`.toLocaleUpperCase("pt-BR");
}
