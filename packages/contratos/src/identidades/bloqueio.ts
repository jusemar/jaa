import * as z from "zod";

/*
 * BLOQUEIO DE COMUNICAÇÃO entre PESSOAS. Quem bloqueia decide sozinho e só ele desfaz, mas o efeito
 * vale nos dois sentidos: ninguém manda mensagem para ninguém enquanto existir um bloqueio entre as
 * duas. Não afeta pedidos, entregas, rastreamento nem despacho — só mensagens.
 */

// Situação vista pela identidade da SESSÃO em relação à outra pessoa.
export const situacaoBloqueioSchema = z.object({
  // Pode bloquear/desbloquear? Só pessoa ↔ pessoa (empresa fica de fora nesta etapa).
  podeBloquear: z.boolean(),
  // EU bloqueei (e posso desbloquear).
  euBloqueei: z.boolean(),
  // A outra pessoa me bloqueou (não posso desfazer o bloqueio dela).
  fuiBloqueado: z.boolean(),
});

export type SituacaoBloqueio = z.infer<typeof situacaoBloqueioSchema>;

export function comunicacaoBloqueada(situacao: Pick<SituacaoBloqueio, "euBloqueei" | "fuiBloqueado">): boolean {
  return situacao.euBloqueei || situacao.fuiBloqueado;
}

// Quem bloqueia vem da sessão; o corpo só diz QUEM será bloqueado.
export const bloquearIdentidadeEntradaSchema = z.object({ identidadeId: z.uuid() }).strict();

export type BloquearIdentidadeEntrada = z.infer<typeof bloquearIdentidadeEntradaSchema>;

/**
 * A situação de bloqueio com `identidadeId` mudou (alguém bloqueou ou desbloqueou). Vai só para as
 * duas pessoas envolvidas; a tela relê a situação (o evento avisa, o servidor é a verdade).
 */
export const EVENTO_BLOQUEIO_ATUALIZADO = "bloqueio:atualizado";

export const eventoBloqueioAtualizadoSchema = z.object({ identidadeId: z.uuid() });

export type EventoBloqueioAtualizado = z.infer<typeof eventoBloqueioAtualizadoSchema>;
