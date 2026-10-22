import * as z from "zod";
import { nomeExibicaoSchema } from "../identidades/identidade-pessoal.ts";

/*
 * VISITANTE: quem abriu o Link do Jaa (`/@usuario`) sem conta e quis conversar mesmo assim.
 *
 * Não é um tipo novo de identidade (pessoal × empresarial continua fechado): é uma CONTA TEMPORÁRIA do
 * Better Auth (plugin oficial `anonymous`, com sessão normal) dona de uma identidade pessoal marcada
 * como visitante no servidor. A conversa e as mensagens são as de sempre — nada paralelo.
 *
 * O que o visitante pode: conversar (texto, foto, áudio), ver perfis/empresas/cardápios públicos e
 * bloquear. Tudo que depende de identidade permanente (pedido, endereço, empresa, perfil profissional,
 * contatos, editar o próprio perfil...) responde `CONTA_NECESSARIA`.
 */

// Sem atividade por este tempo, a identidade visitante expira. Nova atividade válida reinicia o prazo.
export const VISITANTE_INATIVIDADE_MAXIMA_MS = 24 * 60 * 60 * 1000;

// Quantas conversas DIFERENTES um visitante pode abrir: o link serve para falar com quem o enviou,
// não para disparar mensagens a qualquer @usuario.
export const LIMITE_CONVERSAS_VISITANTE = 5;

// @usuario técnico da identidade visitante (nunca encontrável): o prefixo fica reservado.
export const PREFIXO_NOME_USUARIO_VISITANTE = "visitante_";

// Nome padrão quando o visitante não diz como quer ser chamado.
export const NOME_PADRAO_VISITANTE = "Visitante";

export const criarVisitanteEntradaSchema = z.strictObject({
  // Opcional: só para quem recebe saber com quem fala. Não é cadastro.
  nomeExibicao: nomeExibicaoSchema.optional(),
});

export type CriarVisitanteEntrada = z.input<typeof criarVisitanteEntradaSchema>;

// O que a própria sessão visitante sabe de si (nunca a conta técnica nem o @usuario técnico).
export const visitanteAtualSchema = z.object({
  identidadeId: z.uuid(),
  nomeExibicao: z.string(),
  // Até quando vale SE não houver nova atividade (o servidor renova a cada uso).
  expiraEm: z.iso.datetime(),
});

export type VisitanteAtual = z.infer<typeof visitanteAtualSchema>;

// Código de erro das ações que exigem conta permanente (apresentar "Criar conta" / "Entrar").
export const CODIGO_CONTA_NECESSARIA = "CONTA_NECESSARIA";
