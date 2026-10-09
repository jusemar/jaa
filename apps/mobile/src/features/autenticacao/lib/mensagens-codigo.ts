/*
 * MENSAGENS DO CÓDIGO (celular ou e-mail) — a parte PURA, testada com `node:test`.
 *
 * Mesmos textos da Web (os apps não importam código um do outro; mudou lá, muda aqui). São genéricos
 * de propósito: não dizem se existe conta, nem falam de fornecedor, de status técnico ou do que a
 * pessoa digitou.
 */
const MENSAGENS: Record<string, string> = {
  INVALID_PHONE_NUMBER: "Número de celular inválido.",
  INVALID_EMAIL: "E-mail inválido.",
  FALHA_AO_ENVIAR_CODIGO: "Não foi possível enviar o código. Tente novamente.",
  MUITOS_PEDIDOS_DE_CODIGO: "Muitas solicitações de código. Tente novamente mais tarde.",
  OTP_SOLICITADO_RECENTEMENTE: "Aguarde um minuto antes de pedir um novo código.",
  INVALID_OTP: "Código incorreto.",
  OTP_EXPIRED: "Código expirado. Peça um novo código.",
  OTP_NOT_FOUND: "Código não encontrado. Peça um novo código.",
  TOO_MANY_ATTEMPTS: "Muitas tentativas. Peça um novo código.",
  // PIN do dispositivo: uma frase só para PIN errado, aparelho desconhecido ou autorização encerrada.
  PIN_NAO_ACEITO: "Não foi possível entrar com o PIN. Confira o PIN ou use SMS ou e-mail.",
  PIN_BLOQUEADO: "Muitas tentativas. Aguarde alguns minutos ou use SMS ou e-mail.",
  PIN_INVALIDO: "O PIN deve ter 6 números, iguais nos dois campos.",
  CODIGO_NECESSARIO: "Para criar o PIN, entre de novo com o código por SMS ou e-mail.",
};

export function mensagemDoCodigo(erro: unknown): string {
  const dados = typeof erro === "object" && erro !== null ? (erro as Record<string, unknown>) : {};
  const codigo = typeof dados.code === "string" ? dados.code : "";
  const status = typeof dados.status === "number" ? dados.status : 0;
  if (MENSAGENS[codigo]) return MENSAGENS[codigo];
  if (status === 0) return "Sem conexão com o Jaaa.";
  if (status === 429) return "Muitas solicitações. Tente novamente em instantes.";
  return "Não foi possível concluir. Tente novamente.";
}
