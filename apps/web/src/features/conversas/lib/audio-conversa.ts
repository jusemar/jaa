import { DURACAO_MINIMA_AUDIO_MS, MENSAGEM_AUDIO_GRANDE, TAMANHO_MAXIMO_AUDIO_BYTES, tipoAudioAceito, type Mensagem } from "@jaa/contratos";
import { destinoDaTentativa, type FalhaEnvioImagem } from "./imagem-conversa";

/*
 * MENSAGEM DE VOZ na conversa — regras do Web (puras, sem DOM). A API é a autoridade (formato pelos
 * bytes, duração, tamanho, autorização, idempotência); aqui ficam a escolha do formato de gravação, a
 * ORDEM dos campos do multipart, o destino da tentativa depois de uma falha e o estado do compositor.
 */

/** Uma tentativa de envio: enquanto pendente, o MESMO idCliente, áudio e resposta. */
export type TentativaAudio = {
  idCliente: string;
  arquivo: Blob;
  duracaoMs: number;
  mensagemRespondidaId?: string;
  // Object URL do áudio gravado (só deste navegador); revogada quando a tentativa termina.
  previaUrl: string;
};

// Na ordem de preferência: Opus em WebM (Chrome, Edge, Firefox); MP4/AAC (Safari).
export const TIPOS_DE_GRAVACAO = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"] as const;

/** Primeiro formato que ESTE navegador grava e que o Jaa aceita; null = não dá para gravar aqui. */
export function escolherTipoDeGravacao(suporta: (tipo: string) => boolean): string | null {
  return TIPOS_DE_GRAVACAO.find((tipo) => suporta(tipo)) ?? null;
}

export function nomeDoArquivoDeAudio(tipo: string): string {
  return tipoAudioAceito(tipo) === "audio/mp4" ? "audio.m4a" : "audio.webm";
}

/** Conferência prévia do áudio gravado; null = pode enviar. A API confere de novo. */
export function validarAudioGravado(audio: { tipo: string; tamanhoBytes: number; duracaoMs: number }): string | null {
  if (!tipoAudioAceito(audio.tipo) || audio.tamanhoBytes === 0) return "Não foi possível gravar o áudio neste navegador.";
  if (audio.duracaoMs < DURACAO_MINIMA_AUDIO_MS) return "Áudio muito curto. Grave de novo.";
  if (audio.tamanhoBytes > TAMANHO_MAXIMO_AUDIO_BYTES) return MENSAGEM_AUDIO_GRANDE;
  return null;
}

/**
 * Campos de texto do multipart NA ORDEM do contrato (`ORDEM_CAMPOS_ENVIO_AUDIO`): idCliente,
 * mensagemRespondidaId (só se houver) e duracaoMs. O arquivo vai depois, por último.
 */
export function camposDoEnvioDeAudio(tentativa: Pick<TentativaAudio, "idCliente" | "duracaoMs" | "mensagemRespondidaId">): [string, string][] {
  return [
    ["idCliente", tentativa.idCliente],
    ...(tentativa.mensagemRespondidaId ? ([["mensagemRespondidaId", tentativa.mensagemRespondidaId]] as [string, string][]) : []),
    ["duracaoMs", String(Math.round(tentativa.duracaoMs))],
  ];
}

// Mesma regra da imagem: rede, 5xx e 429 mantêm a tentativa; recusa definitiva descarta.
export const destinoDaTentativaDeAudio = destinoDaTentativa;

export function mensagemDeFalhaAudio(falha: FalhaEnvioImagem): string {
  if (falha.status === 0) return "Sem conexão. O áudio não foi enviado; toque em Reenviar.";
  if (falha.status === 401) return "Sua sessão expirou. Entre de novo para enviar o áudio.";
  if (falha.status === 413) return MENSAGEM_AUDIO_GRANDE;
  if (falha.codigo) return falha.mensagem;
  return falha.status >= 500 ? "Falha ao enviar o áudio. Toque em Reenviar para tentar de novo sem duplicar." : falha.mensagem;
}

/**
 * A mensagem desta tentativa já chegou pela conversa (evento em tempo real antes da resposta HTTP)?
 * O evento não traz o idCliente: áudio MEU, que não existia quando o envio começou, com a mesma
 * referência. Só evita mostrar o áudio duas vezes naquele instante; quem conclui é a resposta HTTP.
 */
export function tentativaDeAudioJaChegou(
  tentativa: Pick<TentativaAudio, "mensagemRespondidaId">,
  mensagens: readonly Mensagem[],
  idsAntesDoEnvio: ReadonlySet<string>,
  identidadeId: string,
): boolean {
  return mensagens.some(
    (mensagem) =>
      mensagem.tipo === "audio" &&
      mensagem.remetenteIdentidadeId === identidadeId &&
      !idsAntesDoEnvio.has(mensagem.id) &&
      (mensagem.mensagemRespondida?.id ?? undefined) === tentativa.mensagemRespondidaId,
  );
}

/** Ids dos áudios VISÍVEIS (com anexo, não excluídos): só para eles se pede URL. */
export function idsDeAudiosVisiveis(mensagens: readonly Mensagem[]): string[] {
  return mensagens.filter((mensagem) => mensagem.tipo === "audio" && mensagem.anexo?.tipo === "audio" && mensagem.excluidaEm === null).map((mensagem) => mensagem.id);
}

/*
 * ESTADO DO COMPOSITOR — um de cada vez, para nunca existir combinação incoerente (gravar com foto
 * escolhida, editar gravando, texto + áudio virando duas mensagens):
 *   edicao > gravando > audio-pronto > imagem > texto > normal.
 */
export type ModoCompositor = "edicao" | "gravando" | "audio-pronto" | "imagem" | "texto" | "normal";

export function modoDoCompositor(estado: { editando: boolean; gravando: boolean; audioPronto: boolean; imagemSelecionada: boolean; temTexto: boolean }): ModoCompositor {
  if (estado.editando) return "edicao";
  if (estado.gravando) return "gravando";
  if (estado.audioPronto) return "audio-pronto";
  if (estado.imagemSelecionada) return "imagem";
  return estado.temTexto ? "texto" : "normal";
}

/** O microfone só aparece no estado normal (campo vazio), sem nada pendente e sem bloqueio. */
export function podeGravar(estado: { modo: ModoCompositor; bloqueada: boolean; midiaPendente: boolean; textoPendente: boolean }): boolean {
  return estado.modo === "normal" && !estado.bloqueada && !estado.midiaPendente && !estado.textoPendente;
}

export const VELOCIDADES_AUDIO = [1, 1.5, 2] as const;
export type VelocidadeAudio = (typeof VELOCIDADES_AUDIO)[number];

export function proximaVelocidade(atual: number): VelocidadeAudio {
  const indice = VELOCIDADES_AUDIO.findIndex((velocidade) => velocidade === atual);
  return VELOCIDADES_AUDIO[(indice + 1) % VELOCIDADES_AUDIO.length] ?? 1;
}

export function rotuloVelocidade(velocidade: number): string {
  return `${String(velocidade).replace(".", ",")}x`;
}

/** Fração tocada (0–1) a partir do tempo atual e da duração do ANEXO (o WebM gravado não informa a sua). */
export function fracaoTocada(tempoAtualSegundos: number, duracaoMs: number): number {
  if (!(duracaoMs > 0) || !Number.isFinite(tempoAtualSegundos)) return 0;
  return Math.min(1, Math.max(0, (tempoAtualSegundos * 1000) / duracaoMs));
}
