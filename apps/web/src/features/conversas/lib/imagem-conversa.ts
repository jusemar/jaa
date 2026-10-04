import {
  MENSAGEM_ARQUIVO_GRANDE,
  MENSAGEM_TIPO_INVALIDO,
  PREVIA_AUDIO,
  PREVIA_IMAGEM,
  TAMANHO_MAXIMO_IMAGEM_BYTES,
  ehTipoImagemAceito,
  type Mensagem,
} from "@jaa/contratos";

/*
 * IMAGEM NA CONVERSA — regras de apresentação e de envio do Web (puras, sem DOM).
 *
 * A API é a autoridade (bytes, tamanho, autorização, idempotência). Aqui ficam só: a conferência
 * prévia que evita gastar um upload à toa, a ORDEM dos campos do multipart, o texto dos erros e o
 * cálculo do espaço do balão.
 */

/** Uma tentativa de envio: enquanto pendente, o MESMO idCliente, arquivo, legenda e resposta. */
export type TentativaImagem = {
  idCliente: string;
  arquivo: File;
  legenda: string;
  mensagemRespondidaId?: string;
  // Object URL da prévia local (só deste navegador); revogada quando a tentativa termina.
  previaUrl: string;
};

/** Conferência prévia do arquivo escolhido; null = pode seguir. */
export function validarArquivoImagem(arquivo: { type: string; size: number }): string | null {
  if (!ehTipoImagemAceito(arquivo.type)) return MENSAGEM_TIPO_INVALIDO;
  if (arquivo.size > TAMANHO_MAXIMO_IMAGEM_BYTES) return MENSAGEM_ARQUIVO_GRANDE;
  if (arquivo.size === 0) return MENSAGEM_TIPO_INVALIDO;
  return null;
}

/**
 * Campos de texto do multipart NA ORDEM do contrato (`ORDEM_CAMPOS_ENVIO_IMAGEM`): idCliente,
 * legenda (só se houver) e mensagemRespondidaId (só se houver). O arquivo vai depois, por último.
 */
export function camposDoEnvioDeImagem(tentativa: Pick<TentativaImagem, "idCliente" | "legenda" | "mensagemRespondidaId">): [string, string][] {
  return [
    ["idCliente", tentativa.idCliente],
    ...(tentativa.legenda ? ([["legenda", tentativa.legenda]] as [string, string][]) : []),
    ...(tentativa.mensagemRespondidaId ? ([["mensagemRespondidaId", tentativa.mensagemRespondidaId]] as [string, string][]) : []),
  ];
}

export type FalhaEnvioImagem = { status: number; codigo: string | null; mensagem: string };

/**
 * O que fazer com a tentativa depois de uma falha:
 * - "manter": pode ter sido salva ou não (rede, 5xx), ou é passageiro (limite, armazenamento fora):
 *   fica pendente para REENVIAR com o mesmo idCliente;
 * - "descartar": a API recusou de vez (arquivo, bloqueio, conversa);
 * - "sem-resposta": a mensagem citada não vale mais — a foto volta ao compositor sem a referência.
 */
export function destinoDaTentativa(falha: FalhaEnvioImagem): "manter" | "descartar" | "sem-resposta" {
  if (falha.status === 0 || falha.status >= 500 || falha.status === 429) return "manter";
  if (falha.codigo === "MENSAGEM_RESPONDIDA_NAO_ENCONTRADA") return "sem-resposta";
  return "descartar";
}

export function mensagemDeFalhaImagem(falha: FalhaEnvioImagem): string {
  if (falha.status === 0) return "Sem conexão. A foto não foi enviada; toque em Reenviar.";
  if (falha.status === 401) return "Sua sessão expirou. Entre de novo para enviar a foto.";
  if (falha.status === 413) return MENSAGEM_ARQUIVO_GRANDE;
  if (falha.codigo) return falha.mensagem;
  return falha.status >= 500 ? "Falha ao enviar a foto. Toque em Reenviar para tentar de novo sem duplicar." : falha.mensagem;
}

/**
 * A mensagem desta tentativa já chegou pela conversa (evento em tempo real antes da resposta HTTP)?
 * O evento não traz o idCliente, então a comparação é: imagem MINHA, que não existia quando o envio
 * começou, com a mesma legenda e a mesma referência. Serve só para não mostrar a foto duas vezes
 * naquele instante; quem conclui a tentativa continua sendo a resposta HTTP.
 */
export function tentativaJaChegou(
  tentativa: Pick<TentativaImagem, "legenda" | "mensagemRespondidaId">,
  mensagens: readonly Mensagem[],
  idsAntesDoEnvio: ReadonlySet<string>,
  identidadeId: string,
): boolean {
  return mensagens.some(
    (mensagem) =>
      mensagem.tipo === "imagem" &&
      mensagem.remetenteIdentidadeId === identidadeId &&
      !idsAntesDoEnvio.has(mensagem.id) &&
      mensagem.conteudo === tentativa.legenda &&
      (mensagem.mensagemRespondida?.id ?? undefined) === tentativa.mensagemRespondidaId,
  );
}

/** Ids das imagens VISÍVEIS (com anexo, não excluídas): só para elas se pede URL. */
export function idsDeImagensVisiveis(mensagens: readonly Mensagem[]): string[] {
  return mensagens.filter((mensagem) => mensagem.tipo === "imagem" && mensagem.anexo?.tipo === "imagem" && mensagem.excluidaEm === null).map((mensagem) => mensagem.id);
}

/** Texto de uma mensagem em prévias (resposta em composição, lista): imagem sem legenda = "Foto"; áudio = "Áudio". */
export function conteudoParaPrevia(mensagem: Pick<Mensagem, "tipo" | "conteudo">): string {
  if (mensagem.tipo === "audio") return PREVIA_AUDIO;
  return mensagem.tipo === "imagem" && mensagem.conteudo === "" ? PREVIA_IMAGEM : mensagem.conteudo;
}

// Maior área que a imagem ocupa no balão (px CSS). A largura ainda se limita à do balão pelo CSS.
export const LARGURA_MAXIMA_IMAGEM = 320;
export const ALTURA_MAXIMA_IMAGEM = 360;

/**
 * Espaço RESERVADO para a imagem antes de ela carregar, na proporção real (largura × altura vêm da
 * API): o balão nasce do tamanho certo e a conversa não "pula". Nunca amplia além do tamanho real.
 */
export function espacoDaImagem(largura: number, altura: number): { largura: number; altura: number } {
  if (!(largura > 0) || !(altura > 0)) return { largura: LARGURA_MAXIMA_IMAGEM, altura: LARGURA_MAXIMA_IMAGEM };
  const escala = Math.min(1, LARGURA_MAXIMA_IMAGEM / largura, ALTURA_MAXIMA_IMAGEM / altura);
  return { largura: Math.max(1, Math.round(largura * escala)), altura: Math.max(1, Math.round(altura * escala)) };
}
