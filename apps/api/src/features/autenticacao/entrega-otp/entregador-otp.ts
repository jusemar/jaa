import type { Ambiente } from "../../../lib/ambiente.js";
import { criarEntregadorOtpDesenvolvimento } from "./entregador-otp-desenvolvimento.js";

/**
 * Canal de ENTREGA do código. Geração, expiração, tentativas e validação do OTP
 * pertencem ao Better Auth; este contrato só entrega o código já gerado.
 * Um provedor de SMS real será outra implementação desta interface.
 */
export interface EntregadorOtp {
  enviar(dados: { telefone: string; codigo: string }): Promise<void>;
}

export function criarEntregadorOtp(ambiente: Ambiente): EntregadorOtp {
  switch (ambiente.OTP_ENTREGA) {
    case "desenvolvimento":
      return criarEntregadorOtpDesenvolvimento(ambiente.NODE_ENV);
  }
}
