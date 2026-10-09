/*
 * TEXTOS da entrada e do cadastro. Ficam aqui, fora do componente, para serem conferidos por teste.
 *
 * PRIMEIRA TELA, limpa (a mesma hierarquia do aplicativo): Usuário, Senha, [Entrar], "ou",
 * [Entrar com código] e [Criar conta] — sem título e sem frase. As duas ações secundárias abrem UMA
 * etapa de escolha do canal (SMS/Celular ou E-mail) e seguem pelos fluxos de código de sempre.
 *
 * COMO A AUTENTICAÇÃO FUNCIONA (os textos só podem prometer isto):
 * - conta que já tem senha entra com celular, e-mail ou @usuario + senha;
 * - o código — recebido no CELULAR ou no E-MAIL, à escolha da pessoa — serve para as duas coisas:
 *   CRIA a conta de quem é novo (e então a pessoa escolhe nome, @usuario e senha) e também ENTRA em
 *   conta que já existe, sem pedir senha. O e-mail só é oferecido quando o servidor o tem ligado;
 * - não existe "redefinir senha": quem esqueceu entra pelo código.
 *
 * EXEMPLOS (placeholders): sempre fictícios e iguais para todo mundo — nunca vêm de conta, banco ou
 * sessão. O DDD 00 não existe no Brasil, então o número é claramente só um modelo de formato.
 */
export const EXEMPLOS_ENTRADA = {
  // Não é dado de ninguém: só diz o que o campo aceita.
  identificador: "@usuario, celular ou e-mail",
  celular: "(00) 00000-0000",
  email: "voce@exemplo.com",
  codigo: "000000",
  pin: "000000",
  nome: "Seu nome",
  usuario: "seunome",
} as const;

export const TEXTOS_ENTRADA = {
  entrar: {
    identificador: "Usuário",
    senha: "Senha",
    acao: "Entrar",
    ou: "ou",
    comCodigo: "Entrar com código",
    criarConta: "Criar conta",
  },
  // Escolha do canal: o título repete a ação que a pessoa tocou; só o nome do primeiro canal muda.
  canal: {
    codigo: { titulo: "Entrar com código", telefone: "SMS" },
    criar: { titulo: "Criar conta", telefone: "Celular" },
    email: "E-mail",
    voltar: "Voltar",
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
    trocarCanal: "Usar e-mail",
  },
  email: {
    criar: {
      titulo: "Criar conta",
      descricao: "Informe seu e-mail. Você recebe um código para confirmar que o endereço é seu.",
      observacao: "Já tem conta com este e-mail? O mesmo código faz você entrar.",
    },
    codigo: {
      titulo: "Entrar com código",
      descricao: "Informe o e-mail da sua conta. Você recebe um código e entra sem precisar da senha.",
      observacao: null,
    },
    acao: "Receber código",
    trocarCanal: "Usar telefone",
  },
  codigo: {
    titulo: "Digite o código",
    descricao: (destino: string) => `Enviamos um código de 6 dígitos para ${destino}.`,
    validade: "O código vale por 5 minutos.",
    acao: "Confirmar",
    trocar: { telefone: "Trocar número", email: "Trocar e-mail" },
  },
  /*
   * PIN DO DISPOSITIVO: só vale neste navegador, depois de a pessoa ter entrado com o código. Em
   * outro aparelho ele não serve — por isso a alternativa "Usar SMS ou e-mail" está sempre à vista.
   */
  pin: {
    entrar: {
      titulo: "Entrar com PIN",
      descricao: "Digite o PIN de 6 números que você criou neste dispositivo.",
      acao: "Entrar",
      atalho: "Entrar com PIN",
      usarCodigo: "Usar SMS ou e-mail",
      remover: "Não usar mais PIN neste dispositivo",
    },
    criar: {
      titulo: "Criar PIN",
      descricao: "Com um PIN de 6 números você entra neste dispositivo sem precisar de um novo código. Ele só vale aqui.",
      acao: "Criar PIN",
      agoraNao: "Agora não",
    },
    campo: "PIN",
    confirmar: "Confirmar PIN",
    diferentes: "Os dois PINs não são iguais.",
  },
  cadastro: {
    titulo: "Falta pouco",
    descricao: "Diga como você aparece no Jaaa e crie uma senha para entrar nas próximas vezes.",
    acao: "Concluir cadastro",
  },
} as const;

/** Frase curta para quem chegou por um Link do Jaa: é rápido, e a pessoa continua com aquela identidade. */
export function fraseDoDestino(nome: string): string {
  return `É rápido: entre e continue com ${nome}.`;
}
