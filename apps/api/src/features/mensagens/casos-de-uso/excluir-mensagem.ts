import type { Banco } from "@jaa/banco";
import type { EscopoExclusaoMensagem } from "@jaa/contratos";
import { listarIdsParticipantesDaConversa } from "../../conversas/repositorios/repositorio-conversas.js";
import { armazenamentoPrivadoIndisponivel, type ArmazenamentoPrivado } from "../../../lib/armazenamento/armazenamento-arquivos.js";
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
 *
 * IMAGEM: "todos" marca o anexo como removido na MESMA transação do tombstone e, DEPOIS do commit,
 * apaga o arquivo do bucket privado. Falha ao apagar não desfaz nada (a mensagem já é tombstone e a
 * URL não é mais gerada): o arquivo fica órfão para a varredura futura e a falha é avisada.
 * "mim" nunca toca no arquivo: os outros participantes continuam vendo a imagem.
 */
export async function excluirMensagem(
  {
    banco,
    eventosMensagens,
    armazenamentoPrivado = armazenamentoPrivadoIndisponivel,
    aoFalharRemocaoArquivo = () => undefined,
  }: {
    banco: Banco;
    eventosMensagens: CanalEventosMensagens;
    armazenamentoPrivado?: ArmazenamentoPrivado;
    // Só a CHAVE e o erro do storage (sem credencial) — para registrar o órfão.
    aoFalharRemocaoArquivo?: (chave: string, erro: unknown) => void;
  },
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
    for (const chave of excluiu.chavesRemovidas) {
      await armazenamentoPrivado.remover(chave).catch((erro: unknown) => aoFalharRemocaoArquivo(chave, erro));
    }
    const ocultaram = await listarIdentidadesQueOcultaram(banco, mensagemId);
    eventosMensagens.publicar({
      tipo: "mensagem-atualizada",
      mensagem: tombstone,
      destinatariosIdentidadeIds: participantes.filter((id) => !ocultaram.includes(id)),
    });
  }
  return { tipo: "excluida-para-todos", mensagem: tombstone };
}
