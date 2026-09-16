import type { Banco } from "@jaa/banco";
import { listarIdsParticipantesDaConversa } from "../../conversas/repositorios/repositorio-conversas.js";
import type { CanalEventosMensagens } from "../lib/eventos-mensagens.js";
import {
  atualizarConteudoMensagem,
  buscarMensagemNaConversa,
  estaOcultaPara,
  listarIdentidadesQueOcultaram,
  type MensagemRegistro,
} from "../repositorios/repositorio-mensagens.js";

type ResultadoEditarMensagem =
  | { tipo: "editada" | "sem-alteracao"; mensagem: MensagemRegistro }
  | { tipo: "conversa-nao-encontrada" }
  | { tipo: "mensagem-nao-encontrada" }
  | { tipo: "de-outra-identidade" }
  | { tipo: "excluida" };

/**
 * Edita o conteúdo de uma mensagem de texto do PRÓPRIO autor (identidade da sessão).
 * Fluxo: autoriza (participação) → confere autoria → atualiza (condições repetidas no UPDATE) →
 * commit → `mensagem-atualizada`. Não cria mensagem: id, criadoEm (ordem/horário), estado e
 * referência de resposta são preservados; respostas que citam esta mensagem passam a mostrar o
 * conteúdo atual (a prévia é lida da original, sem cópia).
 * Mesmo conteúdo = retry/no-op: não altera editadaEm nem emite evento.
 */
export async function editarMensagem(
  { banco, eventosMensagens }: { banco: Banco; eventosMensagens: CanalEventosMensagens },
  identidadeId: string,
  conversaId: string,
  mensagemId: string,
  conteudo: string,
  operadorUsuarioId?: string,
): Promise<ResultadoEditarMensagem> {
  const participantes = await listarIdsParticipantesDaConversa(banco, conversaId);
  if (!participantes.includes(identidadeId)) return { tipo: "conversa-nao-encontrada" };

  const atual = await buscarMensagemNaConversa(banco, conversaId, mensagemId);
  if (!atual || (await estaOcultaPara(banco, mensagemId, identidadeId))) return { tipo: "mensagem-nao-encontrada" };
  if (atual.remetenteIdentidadeId !== identidadeId) return { tipo: "de-outra-identidade" };
  if (atual.excluidaParaTodosEm) return { tipo: "excluida" };
  if (atual.conteudo === conteudo) return { tipo: "sem-alteracao", mensagem: atual };

  const alterou = await atualizarConteudoMensagem(banco, { conversaId, mensagemId, remetenteIdentidadeId: identidadeId, conteudo, operadorUsuarioId });
  // Autoria e conversa já conferidas: se o UPDATE não alterou, ela foi excluída para todos nesse meio tempo.
  if (!alterou) return { tipo: "excluida" };
  const editada = await buscarMensagemNaConversa(banco, conversaId, mensagemId);
  if (!editada) return { tipo: "mensagem-nao-encontrada" };

  const ocultaram = await listarIdentidadesQueOcultaram(banco, mensagemId);
  eventosMensagens.publicar({
    tipo: "mensagem-atualizada",
    mensagem: editada,
    destinatariosIdentidadeIds: participantes.filter((id) => !ocultaram.includes(id)),
  });
  return { tipo: "editada", mensagem: editada };
}
