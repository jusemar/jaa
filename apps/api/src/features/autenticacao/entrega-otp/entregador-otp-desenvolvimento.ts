import type { Ambiente } from "../../../lib/ambiente.js";
import { mascararTelefone } from "../lib/telefone.js";
import type { EntregadorOtp } from "./entregador-otp.js";

/**
 * SOMENTE DESENVOLVIMENTO LOCAL. Exibe o código no terminal da API em vez de enviar SMS.
 * - recusa ser criado com NODE_ENV=production;
 * - não armazena o código;
 * - escreve direto no terminal (não no logger estruturado) e com telefone mascarado.
 */
export function criarEntregadorOtpDesenvolvimento(nodeEnv: Ambiente["NODE_ENV"]): EntregadorOtp {
  if (nodeEnv === "production") {
    throw new Error("O entregador de OTP de desenvolvimento não pode ser usado em produção.");
  }

  return {
    async enviar({ telefone, codigo }) {
      process.stdout.write(
        `\n[SOMENTE DESENVOLVIMENTO] Código de verificação para ${mascararTelefone(telefone)}: ${codigo}\n\n`,
      );
    },
  };
}
