/*
 * TEXTOS da entrada e do cadastro. Ficam aqui, fora do componente, para serem conferidos por teste.
 *
 * COMO A AUTENTICAÇÃO FUNCIONA (os textos só podem prometer isto):
 * - conta que já tem senha entra com celular ou @usuario + senha;
 * - o código recebido no celular serve para as duas coisas: CRIA a conta de quem é novo (e então a
 *   pessoa escolhe nome, @usuario e senha) e também ENTRA em conta que já existe, sem pedir senha;
 * - não existe "redefinir senha": quem esqueceu entra pelo código.
 *
 * EXEMPLOS (placeholders): sempre fictícios e iguais para todo mundo — nunca vêm de conta, banco ou
 * sessão. O DDD 00 não existe no Brasil, então o número é claramente só um modelo de formato.
 */
export const EXEMPLOS_ENTRADA = {
  identificador: "(00) 00000-0000 ou @seunome",
  celular: "(00) 00000-0000",
  codigo: "000000",
  nome: "Seu nome",
  usuario: "seunome",
} as const;

export const TEXTOS_ENTRADA = {
  entrar: {
    titulo: "Entrar",
    acao: "Entrar",
    semSenha: "Esqueci a senha — entrar com código",
  },
  novo: {
    titulo: "Novo no Jaa?",
    descricao: "Crie sua conta com o número do seu celular. Leva um minuto.",
    acao: "Criar conta",
  },
  celular: {
    criar: {
      titulo: "Criar conta",
      descricao: "Informe seu celular. Você recebe um código para confirmar que o número é seu.",
      observacao: "Já tem conta com este número? O mesmo código faz você entrar.",
    },
    codigo: {
      titulo: "Entrar com código",
      descricao: "Informe o celular da sua conta. Você recebe um código e entra sem precisar da senha.",
      observacao: null,
    },
    acao: "Receber código",
  },
  codigo: {
    titulo: "Digite o código",
    descricao: (telefone: string) => `Enviamos um código de 6 dígitos para ${telefone}.`,
    acao: "Confirmar",
    trocar: "Trocar número",
  },
  cadastro: {
    titulo: "Falta pouco",
    descricao: "Diga como você aparece no Jaa e crie uma senha para entrar nas próximas vezes.",
    acao: "Concluir cadastro",
  },
} as const;

/** Frase curta para quem chegou por um Link do Jaa: é rápido, e a pessoa continua com aquela identidade. */
export function fraseDoDestino(nome: string): string {
  return `É rápido: entre e continue com ${nome}.`;
}
