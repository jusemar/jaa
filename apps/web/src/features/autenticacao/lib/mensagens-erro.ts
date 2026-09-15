// Mensagens para os códigos retornados pelos endpoints de telefone/OTP.
// Mensagens genéricas: não indicam se já existe conta para o número.
const MENSAGENS: Record<string, string> = {
  INVALID_PHONE_NUMBER: "Número de celular inválido.",
  OTP_SOLICITADO_RECENTEMENTE: "Aguarde um minuto antes de pedir um novo código.",
  INVALID_OTP: "Código incorreto.",
  OTP_EXPIRED: "Código expirado. Peça um novo código.",
  OTP_NOT_FOUND: "Código não encontrado. Peça um novo código.",
  TOO_MANY_ATTEMPTS: "Muitas tentativas. Peça um novo código.",
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
