import type { Banco } from "@jaa/banco";
import { listarIdsParticipantesPorConversa } from "../../conversas/repositorios/repositorio-conversas.js";
import type { CanalEventosMensagens } from "../lib/eventos-mensagens.js";
import {
  listarMensagensRecebidasPorIdentidade,
  registrarRecebimentos,
} from "../repositorios/repositorio-estados-mensagem.js";

type ResultadoConfirmarRecebimento = { tipo: "confirmado"; mensagemIds: string[] } | { tipo: "mensagem-nao-encontrada" };

/**
 * ENTREGUE = um cliente autenticado da identidade destinatária confirmou que recebeu a mensagem.
 * `destinatarioIdentidadeId` vem SEMPRE da sessão. Tudo ou nada: se algum id não for mensagem
 * recebida por esta identidade (própria, de conversa alheia, inexistente), nada é gravado e a
 * resposta não distingue o motivo. Fluxo: valida → grava (commit) → publica só o que é novo.
 */
export async function confirmarRecebimento(
  { banco, eventosMensagens }: { banco: Banco; eventosMensagens: CanalEventosMensagens },
  destinatarioIdentidadeId: string,
  mensagemIdsPedidos: string[],
): Promise<ResultadoConfirmarRecebimento> {
  const mensagemIds = [...new Set(mensagemIdsPedidos)];
  const recebidas = await listarMensagensRecebidasPorIdentidade(banco, destinatarioIdentidadeId, mensagemIds);

  if (recebidas.length !== mensagemIds.length) {
    return { tipo: "mensagem-nao-encontrada" };
  }

  const novas = await registrarRecebimentos(banco, destinatarioIdentidadeId, recebidas);

  if (novas.length > 0) {
    const novasPorConversa = new Map<string, string[]>();
    for (const { conversaId, mensagemId } of novas) {
      novasPorConversa.set(conversaId, [...(novasPorConversa.get(conversaId) ?? []), mensagemId]);
    }
    const participantesPorConversa = await listarIdsParticipantesPorConversa(banco, [...novasPorConversa.keys()]);

    for (const [conversaId, idsDaConversa] of novasPorConversa) {
      eventosMensagens.publicar({
        tipo: "mensagens-entregues",
        conversaId,
        destinatarioIdentidadeId,
        mensagemIds: idsDaConversa,
        destinatariosIdentidadeIds: participantesPorConversa.get(conversaId) ?? [],
      });
    }
  }

  return { tipo: "confirmado", mensagemIds };
}
