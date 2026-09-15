import type { Banco } from "@jaa/banco";
import { listarIdsParticipantesDaConversa } from "../../conversas/repositorios/repositorio-conversas.js";
import { listarMensagensDaConversa, type MensagemRegistro } from "../repositorios/repositorio-mensagens.js";

type ResultadoListarMensagens =
  | { tipo: "pagina"; mensagens: MensagemRegistro[]; proximoCursor: string | null }
  | { tipo: "conversa-nao-encontrada" };

// Só participantes leem o histórico. A página volta em ordem cronológica crescente.
export async function listarMensagens(
  banco: Banco,
  identidadeId: string,
  conversaId: string,
  consulta: { antesDe?: string | undefined; limite: number },
): Promise<ResultadoListarMensagens> {
  const participantes = await listarIdsParticipantesDaConversa(banco, conversaId);

  if (!participantes.includes(identidadeId)) {
    return { tipo: "conversa-nao-encontrada" };
  }

  const { mensagens, haMais } = await listarMensagensDaConversa(banco, conversaId, consulta);
  const maisAntiga = mensagens.at(-1);

  return {
    tipo: "pagina",
    mensagens: mensagens.reverse(),
    proximoCursor: haMais && maisAntiga ? maisAntiga.id : null,
  };
}
