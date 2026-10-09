import type { Ambiente } from "../../../lib/ambiente.js";
import { criarEntregadorOtpComtele } from "./entregador-otp-comtele.js";
import { criarEntregadorOtpDesenvolvimento } from "./entregador-otp-desenvolvimento.js";

/**
 * Canal de ENTREGA do código. Geração, expiração, tentativas e validação do OTP
 * pertencem ao Better Auth; este contrato só entrega o código já gerado.
 * Cada provedor é uma implementação desta interface, escolhida por `OTP_ENTREGA`.
 */
export interface EntregadorOtp {
  enviar(dados: { telefone: string; codigo: string }): Promise<void>;
}

export function criarEntregadorOtp(ambiente: Ambiente): EntregadorOtp {
  switch (ambiente.OTP_ENTREGA) {
    case "desenvolvimento":
      return criarEntregadorOtpDesenvolvimento(ambiente.NODE_ENV);
    case "comtele":
      // Segunda barreira: a validação de ambiente já recusa esta combinação antes de a API subir.
      if (!ambiente.COMTELE_API_KEY || !ambiente.COMTELE_ROTA) {
        throw new Error("OTP_ENTREGA=comtele exige COMTELE_API_KEY e COMTELE_ROTA.");
      }
      return criarEntregadorOtpComtele({ chaveApi: ambiente.COMTELE_API_KEY, rota: ambiente.COMTELE_ROTA });
  }
}
