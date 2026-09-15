import type { Mensagem } from "@jaa/contratos";
import type { MensagemRegistro } from "../repositorios/repositorio-mensagens.js";

// idCliente não é exposto: pertence à tentativa de envio do remetente, não à mensagem pública.
export function serializarMensagem(mensagem: MensagemRegistro): Mensagem {
  return {
    id: mensagem.id,
    conversaId: mensagem.conversaId,
    remetenteIdentidadeId: mensagem.remetenteIdentidadeId,
    tipo: mensagem.tipo,
    conteudo: mensagem.conteudo,
    criadoEm: mensagem.criadoEm.toISOString(),
  };
}
