import type { Mensagem } from "@jaa/contratos";
import type { MensagemRegistro } from "../repositorios/repositorio-mensagens.js";

// idCliente não é exposto: pertence à tentativa de envio do remetente, não à mensagem pública.
export function serializarMensagem(mensagem: MensagemRegistro): Mensagem {
  const excluida = mensagem.excluidaParaTodosEm !== null;
  const referencia = excluida ? null : mensagem.mensagemRespondida;

  return {
    id: mensagem.id,
    conversaId: mensagem.conversaId,
    remetenteIdentidadeId: mensagem.remetenteIdentidadeId,
    tipo: mensagem.tipo,
    // Tombstone: nunca entrega conteúdo, referência ou sinal de edição (o conteúdo já foi apagado no banco).
    conteudo: excluida ? "" : mensagem.conteudo,
    criadoEm: mensagem.criadoEm.toISOString(),
    editadaEm: excluida ? null : (mensagem.editadaEm?.toISOString() ?? null),
    excluidaEm: mensagem.excluidaParaTodosEm?.toISOString() ?? null,
    estado: mensagem.estado,
    mensagemRespondida: referencia && {
      id: referencia.id,
      remetente: {
        identidadeId: referencia.remetente.identidadeId,
        nomeExibicao: referencia.remetente.nomeExibicao,
      },
      tipo: referencia.tipo,
      previaConteudo: referencia.excluida ? "" : referencia.previaConteudo,
      conteudoTruncado: referencia.excluida ? false : referencia.conteudoTruncado,
      excluida: referencia.excluida,
    },
  };
}
