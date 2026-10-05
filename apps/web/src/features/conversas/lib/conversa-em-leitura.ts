/*
 * Qual conversa está ABERTA NA TELA do mensageiro agora. O som de mensagem vive no app inteiro
 * (`useAvisosMensagens`), fora do mensageiro; é por aqui que ele sabe qual conversa não deve tocar.
 *
 * A própria conversa se registra enquanto as MENSAGENS dela estão na tela (com o cardápio por cima,
 * fechada ou em outra área do Jaa, não há registro). Estar ABERTA não basta para silenciar: `conversaVisivelAgora` também exige que a página esteja visível e
 * em foco no momento do evento — conversa selecionada numa aba escondida continua tocando.
 */
let conversaAbertaId: string | null = null;

export function definirConversaAberta(id: string | null): void {
  conversaAbertaId = id;
}

export function conversaVisivelAgora(documento: Pick<Document, "visibilityState" | "hasFocus"> | undefined = typeof document === "undefined" ? undefined : document): string | null {
  if (!documento || documento.visibilityState !== "visible" || !documento.hasFocus()) return null;
  return conversaAbertaId;
}
