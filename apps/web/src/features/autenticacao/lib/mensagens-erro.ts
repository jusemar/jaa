// Mensagens para os códigos retornados pelos endpoints de código (celular e e-mail).
// Mensagens genéricas: não indicam se já existe conta, nem falam de fornecedor ou de status técnico.
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
  // PIN do dispositivo: uma frase só para PIN errado, dispositivo desconhecido ou autorização encerrada.
  PIN_NAO_ACEITO: "Não foi possível entrar com o PIN. Confira o PIN ou use SMS ou e-mail.",
  PIN_BLOQUEADO: "Muitas tentativas. Aguarde alguns minutos ou use SMS ou e-mail.",
  PIN_INVALIDO: "O PIN deve ter 6 números, iguais nos dois campos.",
  CODIGO_NECESSARIO: "Para criar o PIN, entre de novo com o código por SMS ou e-mail.",
};

export function mensagemDeErroAutenticacao(erro: { status: number; code?: string | undefined }): string {
  if (erro.code && MENSAGENS[erro.code]) {
    return MENSAGENS[erro.code];
  }
  if (erro.status === 429) {
    return "Muitas solicitações. Tente novamente em instantes.";
  }
  return "Não foi possível concluir. Tente novamente.";
}
