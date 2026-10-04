import { MENSAGEM_ARQUIVO_GRANDE, MENSAGEM_TIPO_INVALIDO, TAMANHO_MAXIMO_IMAGEM_BYTES, type Mensagem } from "@jaa/contratos";
import type { ArquivoLocal } from "../../../lib/envio-arquivo.ts";

/*
 * IMAGEM NA CONVERSA no app — as MESMAS regras do `imagem-conversa.ts` da Web (puras, sem aparelho):
 * ordem dos campos do multipart, destino da tentativa depois de uma falha, texto dos erros, tentativa ×
 * evento em tempo real e o espaço do balão. A API é a autoridade (bytes, tamanho, autorização,
 * idempotência); o que toca o aparelho (galeria, câmera, manipulação) fica em `seletor-imagem.ts`.
 */

// Lado maior antes do envio: a API guarda a imagem da conversa com até 1600 px.
export const LADO_MAXIMO_ENVIO_IMAGEM = 1600;
export const QUALIDADE_ENVIO_IMAGEM = 0.85;
// Sempre JPEG depois da preparação: HEIC/HEIF e tipos declarados errado pelo Android nunca chegam à API.
export const TIPO_ENVIO_IMAGEM = "image/jpeg";
export const NOME_ENVIO_IMAGEM = "foto.jpg";

export type OrigemImagem = "galeria" | "camera";

/** Opções do anexo, na ordem do menu. */
export const OPCOES_ANEXO: readonly { origem: OrigemImagem; rotulo: string; icone: "imagem" | "camera" }[] = [
  { origem: "galeria", rotulo: "Galeria", icone: "imagem" },
  { origem: "camera", rotulo: "Câmera", icone: "camera" },
];

export const MENSAGEM_PERMISSAO_CAMERA_CONVERSA =
  "Sem permissão para usar a câmera. Você pode escolher uma foto da galeria ou liberar a câmera para o Jaa nas configurações do aparelho.";

/** Imagem já preparada (JPEG reduzido) no aparelho, pronta para a prévia e para o envio. */
export type ImagemPreparada = { uri: string; largura: number; altura: number; tamanhoBytes: number | null };

/** Uma tentativa de envio: enquanto pendente, o MESMO idCliente, imagem, legenda e resposta. */
export type TentativaImagem = {
  idCliente: string;
  imagem: ImagemPreparada;
  legenda: string;
  mensagemRespondidaId?: string;
};

/** Redução a aplicar antes do envio (só reduz, nunca amplia); `null` = já cabe. */
export function reducaoDaImagem(largura: number, altura: number): { width: number } | { height: number } | null {
  if (largura <= LADO_MAXIMO_ENVIO_IMAGEM && altura <= LADO_MAXIMO_ENVIO_IMAGEM) return null;
  return largura >= altura ? { width: LADO_MAXIMO_ENVIO_IMAGEM } : { height: LADO_MAXIMO_ENVIO_IMAGEM };
}

/** Conferência prévia da imagem preparada; null = pode seguir. A API confere de novo. */
export function validarImagemPreparada(imagem: Pick<ImagemPreparada, "tamanhoBytes">): string | null {
  if (imagem.tamanhoBytes !== null && imagem.tamanhoBytes > TAMANHO_MAXIMO_IMAGEM_BYTES) return MENSAGEM_ARQUIVO_GRANDE;
  if (imagem.tamanhoBytes === 0) return MENSAGEM_TIPO_INVALIDO;
  return null;
}

export function arquivoDaImagem(imagem: Pick<ImagemPreparada, "uri">): ArquivoLocal {
  return { uri: imagem.uri, nome: NOME_ENVIO_IMAGEM, tipo: TIPO_ENVIO_IMAGEM };
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

// Maior área que a imagem ocupa no balão (dp). A largura ainda se limita à do balão na tela.
export const LARGURA_MAXIMA_IMAGEM = 260;
export const ALTURA_MAXIMA_IMAGEM = 340;

/**
 * Espaço RESERVADO para a imagem antes de ela carregar, na proporção real (largura × altura vêm da
 * API): o balão nasce do tamanho certo e a conversa não "pula". Nunca amplia além do tamanho real.
 */
export function espacoDaImagem(largura: number, altura: number, larguraMaxima = LARGURA_MAXIMA_IMAGEM): { largura: number; altura: number } {
  const limite = Math.max(1, Math.min(larguraMaxima, LARGURA_MAXIMA_IMAGEM));
  if (!(largura > 0) || !(altura > 0)) return { largura: limite, altura: limite };
  const escala = Math.min(1, limite / largura, ALTURA_MAXIMA_IMAGEM / altura);
  return { largura: Math.max(1, Math.round(largura * escala)), altura: Math.max(1, Math.round(altura * escala)) };
}

/** O que o aparelho devolveu ao escolher/tirar a foto. */
export type ObtencaoImagem =
  | { tipo: "cancelado" }
  | { tipo: "permissao-negada" }
  | { tipo: "formato-invalido" }
  | { tipo: "imagem"; imagem: { uri: string; largura: number; altura: number } };

export type ResultadoAnexo = { tipo: "cancelado" } | { tipo: "falha"; mensagem: string } | { tipo: "imagem"; imagem: ImagemPreparada };

/**
 * Do toque em "Galeria"/"Câmera" até a imagem pronta para a prévia. Cancelar não é erro; permissão
 * negada e imagem ilegível viram mensagem clara, sem travar nada.
 */
export async function anexarImagem(
  origem: OrigemImagem,
  dependencias: { obter: (origem: OrigemImagem) => Promise<ObtencaoImagem>; preparar: (imagem: { uri: string; largura: number; altura: number }) => Promise<ImagemPreparada> },
): Promise<ResultadoAnexo> {
  const obtida = await dependencias.obter(origem);
  if (obtida.tipo === "cancelado") return { tipo: "cancelado" };
  if (obtida.tipo === "permissao-negada") return { tipo: "falha", mensagem: MENSAGEM_PERMISSAO_CAMERA_CONVERSA };
  if (obtida.tipo === "formato-invalido") return { tipo: "falha", mensagem: MENSAGEM_TIPO_INVALIDO };
  let preparada: ImagemPreparada;
  try {
    preparada = await dependencias.preparar(obtida.imagem);
  } catch {
    // O aparelho não conseguiu ler a imagem (formato que ele não decodifica, arquivo corrompido).
    return { tipo: "falha", mensagem: MENSAGEM_TIPO_INVALIDO };
  }
  const problema = validarImagemPreparada(preparada);
  return problema ? { tipo: "falha", mensagem: problema } : { tipo: "imagem", imagem: preparada };
}
