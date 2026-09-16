import type { Banco } from "@jaa/banco";
import { listarIdsParticipantesDaConversa } from "../../conversas/repositorios/repositorio-conversas.js";
import type { CanalEventosMensagens } from "../lib/eventos-mensagens.js";
import {
  buscarMensagemPorIdCliente,
  buscarReferenciaNaConversa,
  ehViolacaoReferenciaResposta,
  inserirMensagemTexto,
  type MensagemRegistro,
} from "../repositorios/repositorio-mensagens.js";

type ResultadoEnviarMensagem =
  | { tipo: "criada" | "ja-existente"; mensagem: MensagemRegistro }
  | { tipo: "conversa-nao-encontrada" }
  | { tipo: "mensagem-respondida-nao-encontrada" }
  | { tipo: "id-cliente-reutilizado" };

/**
 * Fluxo obrigatório: autoriza → persiste → só então publica o evento realtime.
 * `remetenteIdentidadeId` vem SEMPRE da sessão. Se o banco falhar, nada é publicado.
 * Retry com o mesmo idCliente devolve a mensagem já salva (com o estado atual), sem nova cópia nem novo evento.
 * Resposta: a mensagem respondida precisa ser DESTA conversa (verificado aqui e garantido pela FK).
 * Inexistente, de outra conversa, excluída para todos ou excluída para quem responde têm o mesmo
 * resultado: nada é revelado sobre outras conversas.
 */
export async function enviarMensagemTexto(
  { banco, eventosMensagens }: { banco: Banco; eventosMensagens: CanalEventosMensagens },
  remetenteIdentidadeId: string,
  conversaId: string,
  entrada: { idCliente: string; conteudo: string; mensagemRespondidaId?: string | undefined },
  // Conta que executou o envio (auditoria interna; nunca exposta). Relevante para identidade empresarial.
  operadorUsuarioId?: string,
): Promise<ResultadoEnviarMensagem> {
  const participantes = await listarIdsParticipantesDaConversa(banco, conversaId);

  // Não participante recebe o mesmo resultado de conversa inexistente: nada é revelado.
  if (!participantes.includes(remetenteIdentidadeId)) {
    return { tipo: "conversa-nao-encontrada" };
  }

  const mensagemRespondidaId = entrada.mensagemRespondidaId ?? null;
  const mensagemRespondida = mensagemRespondidaId ? await buscarReferenciaNaConversa(banco, conversaId, mensagemRespondidaId, remetenteIdentidadeId) : null;

  if (mensagemRespondidaId && !mensagemRespondida) {
    return { tipo: "mensagem-respondida-nao-encontrada" };
  }

  let criada: MensagemRegistro | null;
  try {
    criada = await inserirMensagemTexto(banco, {
      conversaId,
      remetenteIdentidadeId,
      idCliente: entrada.idCliente,
      conteudo: entrada.conteudo,
      mensagemRespondida,
      operadorUsuarioId,
    });
  } catch (erro) {
    if (ehViolacaoReferenciaResposta(erro)) return { tipo: "mensagem-respondida-nao-encontrada" };
    throw erro;
  }

  if (criada) {
    eventosMensagens.publicar({ tipo: "mensagem-criada", mensagem: criada, destinatariosIdentidadeIds: participantes });
    return { tipo: "criada", mensagem: criada };
  }

  const existente = await buscarMensagemPorIdCliente(banco, remetenteIdentidadeId, entrada.idCliente);

  // Retry legítimo = mesma conversa, MESMA referência e mesmo conteúdo. Se o próprio autor já alterou
  // a mensagem (edição), o conteúdo original não existe mais para comparar: vale conversa + referência.
  // O mesmo vale se ele a excluiu para todos (o conteúdo foi apagado): devolve o tombstone.
  const conteudoConfere = existente?.editadaEm != null || existente?.excluidaParaTodosEm != null || existente?.conteudo === entrada.conteudo;
  if (existente && existente.conversaId === conversaId && existente.mensagemRespondidaId === mensagemRespondidaId && conteudoConfere) {
    return { tipo: "ja-existente", mensagem: existente };
  }

  // O mesmo idCliente foi usado para outra mensagem: não é um retry legítimo.
  return { tipo: "id-cliente-reutilizado" };
}
