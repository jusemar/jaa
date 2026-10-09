import type { Ambiente } from "../../../lib/ambiente.js";
import { criarEntregadorOtpEmailDesenvolvimento } from "./entregador-otp-email-desenvolvimento.js";
import { criarEntregadorOtpEmailResend } from "./entregador-otp-email-resend.js";

/**
 * Canal de ENTREGA do código por E-MAIL. Como no SMS (`EntregadorOtp`), geração, expiração,
 * tentativas e validação pertencem ao Better Auth; este contrato só entrega o código já gerado.
 * `validadeSegundos` vem da autenticação apenas para o texto dizer por quanto tempo o código vale.
 */
export interface EntregadorOtpEmail {
  enviar(dados: { email: string; codigo: string; validadeSegundos: number }): Promise<void>;
  /**
   * Aviso (SEM código) para um endereço que já pertence a uma conta, quando OUTRA conta tenta
   * cadastrá-lo. Sai pelo mesmo canal do código para que o pedido tenha o mesmo desfecho com ou sem
   * conta — quem pede não descobre, pela resposta, se o e-mail já está cadastrado.
   */
  avisarEnderecoJaCadastrado(dados: { email: string }): Promise<void>;
}

/** null = OTP por e-mail DESLIGADO: as rotas de e-mail nem existem na API. */
export function criarEntregadorOtpEmail(ambiente: Ambiente): EntregadorOtpEmail | null {
  switch (ambiente.OTP_EMAIL_ENTREGA) {
    case undefined:
    case "desativado":
      return null;
    case "desenvolvimento":
      return criarEntregadorOtpEmailDesenvolvimento(ambiente.NODE_ENV);
    case "resend":
      // Segunda barreira: a validação de ambiente já recusa esta combinação antes de a API subir.
      if (!ambiente.RESEND_API_KEY || !ambiente.RESEND_REMETENTE) {
        throw new Error("OTP_EMAIL_ENTREGA=resend exige RESEND_API_KEY e RESEND_REMETENTE.");
      }
      return criarEntregadorOtpEmailResend({ chaveApi: ambiente.RESEND_API_KEY, remetente: ambiente.RESEND_REMETENTE });
  }
}
