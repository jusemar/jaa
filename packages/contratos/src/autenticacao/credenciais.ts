import * as z from "zod";

/*
 * ENTRAR NO JAA com IDENTIFICADOR + SENHA.
 *
 * O identificador é o que a pessoa já conhece de si: o CELULAR ou o @usuario. Não é o e-mail (o Jaa
 * não pede e-mail) e não é um terceiro identificador inventado para o login.
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
  // Telefone com ou sem máscara, ou @usuario com ou sem "@". Quem decide o que é vem a seguir.
  identificador: z.string().trim().min(1, "Informe seu celular ou @usuario."),
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
 * Um identificador é TELEFONE quando tem dígitos suficientes para um celular brasileiro; caso
 * contrário é tratado como @usuario. A decisão é do SERVIDOR — o cliente não escolhe o tipo.
 */
export function identificadorParecePelefone(identificador: string): boolean {
  const digitos = identificador.replace(/\D/g, "");
  return digitos.length >= 10 && /^[\d\s()+-]+$/.test(identificador.trim());
}
