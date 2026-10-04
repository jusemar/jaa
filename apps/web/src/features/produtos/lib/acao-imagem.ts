/*
 * Uma ação sobre a IMAGEM do produto (enviar, trocar, remover) vista pela tela de administração.
 *
 * Sucesso → relê o produto do servidor (a tela passa a mostrar a imagem nova, ou o marcador sem
 * imagem). Falha → lança a mensagem REAL da API e NÃO relê nada: a tela continua com o produto que
 * tinha, isto é, com a imagem anterior — que no servidor também não mudou.
 */
export async function executarAcaoDeImagem(
  acao: () => Promise<{ ok: true } | { ok: false; mensagem: string }>,
  recarregar: () => Promise<void>,
): Promise<void> {
  const resposta = await acao();
  if (!resposta.ok) throw new Error(resposta.mensagem);
  await recarregar();
}
