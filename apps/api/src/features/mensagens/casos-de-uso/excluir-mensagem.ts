import type { Banco } from "@jaa/banco";
import type { EscopoExclusaoMensagem } from "@jaa/contratos";
import { listarIdsParticipantesDaConversa } from "../../conversas/repositorios/repositorio-conversas.js";
import type { CanalEventosMensagens } from "../lib/eventos-mensagens.js";
import {
  buscarMensagemNaConversa,
  buscarUltimaMensagemVisivel,
  estaOcultaPara,
  listarIdentidadesQueOcultaram,
  marcarExcluidaParaTodos,
  ocultarParaIdentidade,
  type MensagemRegistro,
} from "../repositorios/repositorio-mensagens.js";

type ResultadoExcluirMensagem =
  | { tipo: "excluida-para-todos"; mensagem: MensagemRegistro }
  | { tipo: "excluida-para-mim"; conversaId: string; mensagemId: string; ultimaMensagem: MensagemRegistro | null }
  | { tipo: "conversa-nao-encontrada" }
  | { tipo: "mensagem-nao-encontrada" }
  | { tipo: "de-outra-identidade" };

/**
 * Exclusão de mensagem pela identidade da sessão. Nunca apaga a linha (DELETE físico):
 * - "todos": só o autor; vira tombstone para todos (conteúdo apagado no banco). Participantes que ainda
 *   a veem recebem `mensagem-atualizada`. Repetir devolve o tombstone sem novo evento.
 * - "mim": qualquer participante; só ela deixa de ver (outras conexões dela recebem
 *   `mensagem-excluida-para-mim` com a nova última mensagem visível). Repetir é idempotente.
 * Mensagem já excluída "para mim" não existe mais para quem a excluiu (404 para "todos").
 */
export async function excluirMensagem(
  { banco, eventosMensagens }: { banco: Banco; eventosMensagens: CanalEventosMensagens },
  identidadeId: string,
  conversaId: string,
  mensagemId: string,
  escopo: EscopoExclusaoMensagem,
  operadorUsuarioId?: string,
): Promise<ResultadoExcluirMensagem> {
  const participantes = await listarIdsParticipantesDaConversa(banco, conversaId);
  if (!participantes.includes(identidadeId)) return { tipo: "conversa-nao-encontrada" };

  const mensagem = await buscarMensagemNaConversa(banco, conversaId, mensagemId);
  if (!mensagem) return { tipo: "mensagem-nao-encontrada" };
  const jaOculta = await estaOcultaPara(banco, mensagemId, identidadeId);

  if (escopo === "mim") {
    const ocultou = await ocultarParaIdentidade(banco, { conversaId, mensagemId, identidadeId });
    const ultimaMensagem = await buscarUltimaMensagemVisivel(banco, conversaId, identidadeId);
    if (ocultou) {
      eventosMensagens.publicar({ tipo: "mensagem-excluida-para-mim", conversaId, mensagemId, ultimaMensagem, destinatariosIdentidadeIds: [identidadeId] });
    }
    return { tipo: "excluida-para-mim", conversaId, mensagemId, ultimaMensagem };
  }

  if (jaOculta) return { tipo: "mensagem-nao-encontrada" };
  if (mensagem.remetenteIdentidadeId !== identidadeId) return { tipo: "de-outra-identidade" };
  if (mensagem.excluidaParaTodosEm) return { tipo: "excluida-para-todos", mensagem };

  const excluiu = await marcarExcluidaParaTodos(banco, { conversaId, mensagemId, remetenteIdentidadeId: identidadeId, operadorUsuarioId });
  const tombstone = await buscarMensagemNaConversa(banco, conversaId, mensagemId);
  if (!tombstone) return { tipo: "mensagem-nao-encontrada" };

  if (excluiu) {
    const ocultaram = await listarIdentidadesQueOcultaram(banco, mensagemId);
    eventosMensagens.publicar({
      tipo: "mensagem-atualizada",
      mensagem: tombstone,
      destinatariosIdentidadeIds: participantes.filter((id) => !ocultaram.includes(id)),
    });
  }
  return { tipo: "excluida-para-todos", mensagem: tombstone };
}
