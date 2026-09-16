import type { Banco } from "@jaa/banco";
import { listarIdsParticipantesDaConversa } from "../repositorios/repositorio-conversas.js";

type ResultadoAutorizarObservacao = { tipo: "autorizada"; outrosParticipantesIds: string[] } | { tipo: "conversa-nao-encontrada" };

/**
 * Presença e "digitando" de uma conversa só são entregues a quem PARTICIPA dela (identidade da
 * sessão). É esta verificação no banco que autoriza; salas do Socket.IO são só o meio de entrega.
 * Não participante recebe o mesmo resultado de conversa inexistente.
 */
export async function autorizarObservacaoConversa(
  banco: Banco,
  identidadeId: string,
  conversaId: string,
): Promise<ResultadoAutorizarObservacao> {
  const participantes = await listarIdsParticipantesDaConversa(banco, conversaId);

  if (!participantes.includes(identidadeId)) {
    return { tipo: "conversa-nao-encontrada" };
  }

  return { tipo: "autorizada", outrosParticipantesIds: participantes.filter((id) => id !== identidadeId) };
}
