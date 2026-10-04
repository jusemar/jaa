import type { Banco } from "@jaa/banco";
import type { UrlImagem } from "@jaa/contratos";
import { VALIDADE_PADRAO_URL_ASSINADA_SEGUNDOS, type ArmazenamentoPrivado } from "../../../lib/armazenamento/armazenamento-arquivos.js";
import { listarIdsParticipantesDaConversa } from "../../conversas/repositorios/repositorio-conversas.js";
import { buscarChavesDeAnexosVisiveis } from "../repositorios/repositorio-mensagens.js";

/**
 * URLs TEMPORÁRIAS dos anexos privados (imagens OU áudios) de uma conversa, em lote, para a
 * identidade ATUANTE. Uma regra só para os dois tipos; cada rota pede o seu.
 *
 * Só sai URL para mensagem que ela pode ver: desta conversa, do tipo pedido, com anexo ativo, não
 * excluída para todos e não excluída/limpa para ela. Qualquer outro id (inexistente, de outra
 * conversa, oculto, tombstone) simplesmente não aparece — sem dizer o motivo.
 *
 * A URL é gerada agora e nunca é gravada; a chave do arquivo não sai daqui.
 */
export async function gerarUrlsAnexos(
  { banco, armazenamentoPrivado }: { banco: Banco; armazenamentoPrivado: ArmazenamentoPrivado },
  tipo: "imagem" | "audio",
  identidadeId: string,
  conversaId: string,
  mensagemIds: readonly string[],
  agora: Date = new Date(),
): Promise<{ tipo: "urls"; urls: UrlImagem[] } | { tipo: "conversa-nao-encontrada" }> {
  const participantes = await listarIdsParticipantesDaConversa(banco, conversaId);
  if (!participantes.includes(identidadeId)) return { tipo: "conversa-nao-encontrada" };

  const pedidas = [...new Set(mensagemIds)];
  const visiveis = new Map((await buscarChavesDeAnexosVisiveis(banco, tipo, conversaId, identidadeId, pedidas)).map((linha) => [linha.mensagemId, linha.chave]));
  const expiraEm = new Date(agora.getTime() + VALIDADE_PADRAO_URL_ASSINADA_SEGUNDOS * 1000).toISOString();

  // Na ordem em que foram pedidas (a página do histórico já vem ordenada).
  const urls = pedidas.flatMap((mensagemId) => {
    const chave = visiveis.get(mensagemId);
    return chave ? [{ mensagemId, url: armazenamentoPrivado.urlAssinadaLeitura(chave, { validadeSegundos: VALIDADE_PADRAO_URL_ASSINADA_SEGUNDOS, agora }), expiraEm }] : [];
  });
  return { tipo: "urls", urls };
}
