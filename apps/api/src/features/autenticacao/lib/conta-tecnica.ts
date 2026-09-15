import { createHmac } from "node:crypto";

/*
 * Valores TÉCNICOS exigidos pelo Better Auth ao criar a conta na verificação do telefone
 * (signUpOnVerification). Não são dados do usuário:
 * - nunca exibir, nunca usar para comunicação, nunca buscar conta por eles;
 * - o nome público verdadeiro vive em identidades.nome_exibicao;
 * - um e-mail real, se existir no futuro, substituirá o técnico.
 */

// ".invalid" é reservado (RFC 2606): nenhum servidor recebe mensagens nesse domínio.
export const DOMINIO_EMAIL_TECNICO = "email-tecnico.jaa.invalid";

export const NOME_TECNICO_CONTA = "Conta Jaa";

/**
 * E-mail técnico opaco e estável derivado do telefone por HMAC-SHA256 com o segredo do servidor.
 * Diferente de um hash simples, não pode ser revertido por força bruta sobre os telefones possíveis
 * sem o segredo. Só é calculado na criação da conta; trocar o segredo não afeta contas existentes.
 */
export function derivarEmailTecnico(telefoneE164: string, segredo: string): string {
  const identificador = createHmac("sha256", segredo)
    .update(`jaa:email-tecnico:v1:${telefoneE164}`)
    .digest("hex");

  return `${identificador}@${DOMINIO_EMAIL_TECNICO}`;
}
