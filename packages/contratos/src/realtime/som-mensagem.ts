/*
 * QUANDO uma mensagem recebida toca som — a MESMA regra na Web e no app (cada um toca do seu jeito).
 *
 * - mensagem da própria identidade: nunca;
 * - mensagem da conversa que a pessoa está VENDO agora: silêncio (ela já está lendo);
 * - qualquer outra — outra conversa, outra área do Jaa, app/aba fora de vista: toca.
 *
 * "Vendo" é decidido por quem chama, no momento do evento: conversa aberta na tela E aplicação
 * visível/em foco. Conversa selecionada com a aba escondida não conta — nesse caso o som toca.
 */
export function deveTocarSomDeMensagem(entrada: {
  remetenteIdentidadeId: string;
  conversaId: string;
  identidadeAtivaId: string;
  /** Conversa efetivamente visível agora; null quando nenhuma está à vista. */
  conversaVisivelId: string | null;
}): boolean {
  if (entrada.remetenteIdentidadeId === entrada.identidadeAtivaId) return false;
  return entrada.conversaId !== entrada.conversaVisivelId;
}
