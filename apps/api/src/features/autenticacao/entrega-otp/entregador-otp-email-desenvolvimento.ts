import type { Ambiente } from "../../../lib/ambiente.js";
import { mascararEmail } from "../lib/email.js";
import type { EntregadorOtpEmail } from "./entregador-otp-email.js";

/**
 * SOMENTE DESENVOLVIMENTO LOCAL. Exibe o código no terminal da API em vez de enviar e-mail.
 * - recusa ser criado com NODE_ENV=production;
 * - não armazena o código;
 * - escreve direto no terminal (não no logger estruturado) e com o e-mail mascarado.
 */
export function criarEntregadorOtpEmailDesenvolvimento(nodeEnv: Ambiente["NODE_ENV"]): EntregadorOtpEmail {
  if (nodeEnv === "production") {
    throw new Error("O entregador de OTP por e-mail de desenvolvimento não pode ser usado em produção.");
  }

  return {
    async enviar({ email, codigo }) {
      process.stdout.write(`\n[SOMENTE DESENVOLVIMENTO] Código de verificação (e-mail) para ${mascararEmail(email)}: ${codigo}\n\n`);
    },
    async avisarEnderecoJaCadastrado({ email }) {
      process.stdout.write(`\n[SOMENTE DESENVOLVIMENTO] Aviso de e-mail já cadastrado para ${mascararEmail(email)} (nenhum código)\n\n`);
    },
  };
}
