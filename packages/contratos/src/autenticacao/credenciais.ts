import * as z from "zod";

/*
 * ENTRAR NO JAA com IDENTIFICADOR + SENHA.
 *
 * O identificador é o que a pessoa já conhece de si: o CELULAR, o E-MAIL da conta ou o @usuario —
 * nunca um terceiro identificador inventado para o login.
 *
 * A senha é uma credencial do Better Auth, não um sistema paralelo: o OTP continua existindo para
 * CADASTRO e RECUPERAÇÃO. Quem nunca definiu senha continua entrando por OTP — nenhuma conta antiga
 * fica de fora.
 */

export const SENHA_TAMANHO_MINIMO = 8;
export const SENHA_TAMANHO_MAXIMO = 128;

export const senhaSchema = z
  .string()
  .min(SENHA_TAMANHO_MINIMO, `A senha deve ter pelo menos ${SENHA_TAMANHO_MINIMO} caracteres.`)
  .max(SENHA_TAMANHO_MAXIMO, `A senha deve ter no máximo ${SENHA_TAMANHO_MAXIMO} caracteres.`);

export const entrarComSenhaEntradaSchema = z.object({
  // Telefone com ou sem máscara, e-mail, ou @usuario com ou sem "@". Quem decide o que é é o servidor.
  identificador: z.string().trim().min(1, "Informe seu celular, e-mail ou @usuario."),
  senha: z.string().min(1, "Informe sua senha."),
});

export type EntrarComSenhaEntrada = z.input<typeof entrarComSenhaEntradaSchema>;

export const definirSenhaEntradaSchema = z.object({
  senha: senhaSchema,
  // Só é exigida quando já existe senha. Trocar senha sem saber a atual não pode ser possível com a
  // sessão apenas: o caminho para quem esqueceu é a recuperação por OTP.
  senhaAtual: z.string().min(1).optional(),
});

export type DefinirSenhaEntrada = z.input<typeof definirSenhaEntradaSchema>;

export const situacaoSenhaSchema = z.object({ definida: z.boolean() });
export type SituacaoSenha = z.infer<typeof situacaoSenhaSchema>;

/**
 * E-mail da conta, para a tela saber se oferece "Adicionar e-mail" ou "Trocar e-mail".
 * `email` é o endereço REAL e verificado da pessoa, ou null enquanto ela não cadastrou nenhum.
 * `disponivel` diz se o código por e-mail está ligado neste servidor.
 */
export const situacaoEmailContaSchema = z.object({ email: z.string().nullable(), disponivel: z.boolean() });
export type SituacaoEmailConta = z.infer<typeof situacaoEmailContaSchema>;

/*
 * TELEFONE DA CONTA (Perfil → Conta e segurança). É um dado da CONTA — não tem relação com a
 * preferência de privacidade "deixar que me encontrem pelo meu celular".
 *
 * Cadastrar ou alterar é sempre em dois passos: pedir o código, que vai por SMS para o NÚMERO NOVO, e
 * confirmar. Só a confirmação grava. Número que já é de outra conta é recusado ANTES de qualquer SMS.
 */
export const situacaoTelefoneContaSchema = z.object({
  // Como a pessoa lê o próprio número: "(31) 98765-4321". Null = conta sem telefone (nasceu por e-mail).
  telefone: z.string().nullable(),
});
export type SituacaoTelefoneConta = z.infer<typeof situacaoTelefoneContaSchema>;

// DDD + número, com ou sem máscara; o servidor normaliza e valida (só celular brasileiro).
const telefoneDigitadoSchema = z.string().trim().min(1, "Informe o celular com DDD.").max(32);

export const pedirCodigoTelefoneEntradaSchema = z.object({ telefone: telefoneDigitadoSchema });
export type PedirCodigoTelefoneEntrada = z.input<typeof pedirCodigoTelefoneEntradaSchema>;

export const confirmarTelefoneEntradaSchema = z.object({
  telefone: telefoneDigitadoSchema,
  codigo: z.string().regex(/^\d{6}$/, "O código tem 6 números."),
});
export type ConfirmarTelefoneEntrada = z.input<typeof confirmarTelefoneEntradaSchema>;

export const codigoTelefoneEnviadoSchema = z.object({ enviado: z.literal(true) });

/**
 * COMO a pessoa pode receber o código para criar a conta ou entrar. Consulta pública e sem dados de
 * ninguém: só diz quais canais este servidor tem ligados, para a tela oferecer "Continuar com
 * telefone" e/ou "Continuar com e-mail".
 */
export const metodosDeEntradaSchema = z.object({ telefone: z.boolean(), email: z.boolean() });
export type MetodosDeEntrada = z.infer<typeof metodosDeEntradaSchema>;

/** Um identificador é E-MAIL quando tem "@" no meio (o @usuario só tem "@" no começo, ou nenhum). */
export function identificadorPareceEmail(identificador: string): boolean {
  return identificador.trim().indexOf("@") > 0;
}

/**
 * Um identificador é TELEFONE quando tem dígitos suficientes para um celular brasileiro; caso
 * contrário é tratado como @usuario. A decisão é do SERVIDOR — o cliente não escolhe o tipo.
 */
export function identificadorParecePelefone(identificador: string): boolean {
  const digitos = identificador.replace(/\D/g, "");
  return digitos.length >= 10 && /^[\d\s()+-]+$/.test(identificador.trim());
}
