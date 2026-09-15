import type { Banco } from "@jaa/banco";
import { listarIdsParticipantesDaConversa } from "../../conversas/repositorios/repositorio-conversas.js";
import type { CanalEventosMensagens } from "../lib/eventos-mensagens.js";
import {
  buscarMensagemPorIdCliente,
  inserirMensagemTexto,
  type MensagemRegistro,
} from "../repositorios/repositorio-mensagens.js";

type ResultadoEnviarMensagem =
  | { tipo: "criada" | "ja-existente"; mensagem: MensagemRegistro }
  | { tipo: "conversa-nao-encontrada" }
  | { tipo: "id-cliente-reutilizado" };

/**
 * Fluxo obrigatório: autoriza → persiste → só então publica o evento realtime.
 * `remetenteIdentidadeId` vem SEMPRE da sessão. Se o banco falhar, nada é publicado.
 * Retry com o mesmo idCliente devolve a mensagem já salva, sem nova cópia nem novo evento.
 */
export async function enviarMensagemTexto(
  { banco, eventosMensagens }: { banco: Banco; eventosMensagens: CanalEventosMensagens },
  remetenteIdentidadeId: string,
  conversaId: string,
  entrada: { idCliente: string; conteudo: string },
): Promise<ResultadoEnviarMensagem> {
  const participantes = await listarIdsParticipantesDaConversa(banco, conversaId);

  // Não participante recebe o mesmo resultado de conversa inexistente: nada é revelado.
  if (!participantes.includes(remetenteIdentidadeId)) {
    return { tipo: "conversa-nao-encontrada" };
  }

  const criada = await inserirMensagemTexto(banco, {
    conversaId,
    remetenteIdentidadeId,
    idCliente: entrada.idCliente,
    conteudo: entrada.conteudo,
  });

  if (criada) {
    eventosMensagens.publicarMensagemCriada({ mensagem: criada, destinatariosIdentidadeIds: participantes });
    return { tipo: "criada", mensagem: criada };
  }

  const existente = await buscarMensagemPorIdCliente(banco, remetenteIdentidadeId, entrada.idCliente);

  if (existente && existente.conversaId === conversaId && existente.conteudo === entrada.conteudo) {
    return { tipo: "ja-existente", mensagem: existente };
  }

  // O mesmo idCliente foi usado para outra mensagem: não é um retry legítimo.
  return { tipo: "id-cliente-reutilizado" };
}
