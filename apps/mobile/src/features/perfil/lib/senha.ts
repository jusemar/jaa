import { SENHA_TAMANHO_MINIMO } from "@jaa/contratos";

/**
 * O botão de senha só libera quando há o que enviar: senha nova com o tamanho mínimo e, se a conta já
 * tem senha, a atual preenchida. É só para não mandar o que já se sabe incompleto — quem valida a
 * senha (tamanho, a atual correta) é o servidor.
 */
export function podeEnviarSenha({ definida, senha, senhaAtual }: { definida: boolean; senha: string; senhaAtual: string }): boolean {
  if (senha.length < SENHA_TAMANHO_MINIMO) return false;
  return !definida || senhaAtual.length > 0;
}
