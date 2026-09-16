import type { Banco } from "@jaa/banco";
import { listarIdsParticipantesDaConversa } from "../../conversas/repositorios/repositorio-conversas.js";
import type { CanalEventosMensagens } from "../lib/eventos-mensagens.js";
import {
  avancarMarcadorLeitura,
  mensagemRecebidaNaConversa,
  obterMarcadorLeitura,
} from "../repositorios/repositorio-estados-mensagem.js";

type ResultadoConfirmarLeitura =
  | { tipo: "confirmada"; lidaAteMensagemId: string }
  | { tipo: "conversa-nao-encontrada" }
  | { tipo: "mensagem-nao-encontrada" };

/**
 * LIDA = o destinatário, com a conversa aberta e visível, confirmou leitura até uma mensagem.
 * Marcador por (conversa, identidade da SESSÃO): uma confirmação cobre todas as mensagens anteriores.
 * Só aceita mensagem RECEBIDA nesta conversa: o remetente não marca a própria mensagem como lida.
 * Repetida, simultânea ou atrasada: o marcador nunca volta e só um avanço real gera evento.
 */
export async function confirmarLeitura(
  { banco, eventosMensagens }: { banco: Banco; eventosMensagens: CanalEventosMensagens },
  leitorIdentidadeId: string,
  conversaId: string,
  ateMensagemId: string,
): Promise<ResultadoConfirmarLeitura> {
  const participantes = await listarIdsParticipantesDaConversa(banco, conversaId);

  // Não participante recebe o mesmo resultado de conversa inexistente: nada é revelado.
  if (!participantes.includes(leitorIdentidadeId)) {
    return { tipo: "conversa-nao-encontrada" };
  }

  if (!(await mensagemRecebidaNaConversa(banco, leitorIdentidadeId, conversaId, ateMensagemId))) {
    return { tipo: "mensagem-nao-encontrada" };
  }

  if (await avancarMarcadorLeitura(banco, leitorIdentidadeId, conversaId, ateMensagemId)) {
    eventosMensagens.publicar({
      tipo: "mensagens-lidas",
      conversaId,
      leitorIdentidadeId,
      ateMensagemId,
      destinatariosIdentidadeIds: participantes,
    });
    return { tipo: "confirmada", lidaAteMensagemId: ateMensagemId };
  }

  // Já estava neste ponto ou adiante: responde com o marcador atual, sem evento.
  const atual = await obterMarcadorLeitura(banco, leitorIdentidadeId, conversaId);
  return { tipo: "confirmada", lidaAteMensagemId: atual ?? ateMensagemId };
}
