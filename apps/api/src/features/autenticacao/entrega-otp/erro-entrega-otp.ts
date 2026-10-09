export type MotivoFalhaEntregaOtp = "telefone_invalido" | "email_invalido" | "tempo_esgotado" | "rede" | "http" | "recusado" | "resposta_invalida";

/**
 * Falha de ENTREGA do código (SMS ou e-mail). A mensagem é segura para log: nunca contém chave de
 * API, código nem o destinatário.
 */
export class ErroEntregaOtp extends Error {
  constructor(
    readonly motivo: MotivoFalhaEntregaOtp,
    mensagem: string,
    readonly status?: number,
  ) {
    super(mensagem);
    this.name = "ErroEntregaOtp";
  }
}
