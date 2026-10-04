import { DURACAO_MAXIMA_AUDIO_MS, DURACAO_MINIMA_AUDIO_MS, MENSAGEM_AUDIO_GRANDE, PREVIA_AUDIO, type Mensagem } from "@jaa/contratos";
import type { ArquivoLocal } from "../../../lib/envio-arquivo.ts";
import { destinoDaTentativa, type FalhaEnvioImagem } from "./imagem-conversa.ts";

/*
 * MENSAGEM DE VOZ no app — as MESMAS regras do `audio-conversa.ts` da Web (puras, sem aparelho): ordem
 * dos campos do multipart, destino da tentativa depois de uma falha, tentativa × evento em tempo real,
 * estado do compositor e contas do player. O que toca o aparelho (microfone, gravador, reprodução) fica
 * em `gravador-audio.ts`, `audio-nativo.ts` e no componente do player.
 */

// O gravador do app produz MP4/AAC (.m4a) — um dos dois formatos que a API aceita.
export const TIPO_ENVIO_AUDIO = "audio/mp4";
export const NOME_ENVIO_AUDIO = "audio.m4a";

/** Áudio gravado no aparelho, pronto para ouvir e enviar. */
export type AudioGravado = { uri: string; duracaoMs: number };

/** Uma tentativa de envio: enquanto pendente, o MESMO idCliente, áudio e resposta. */
export type TentativaAudio = {
  idCliente: string;
  audio: AudioGravado;
  mensagemRespondidaId?: string;
};

/**
 * Opções de gravação no formato que o gravador NATIVO espera: os campos comuns mais os da plataforma
 * "achatados" no mesmo nível. Passar o preset como veio (com `android: {...}` aninhado) faz o Android
 * IGNORAR container e codificador e gravar no padrão do sistema — 3GPP/AMR-NB a 8 kHz, que nem a API
 * (como MP4/AAC) nem os navegadores tratam como o áudio esperado.
 */
export function opcoesDeGravacaoNativas<Comum extends { extension: string; sampleRate: number }, Android extends object, Ios extends object>(
  preset: Comum & { android: Android; ios: Ios },
  plataforma: string,
  ajustes: { numberOfChannels: number; bitRate: number },
): Record<string, unknown> {
  const comuns = { extension: preset.extension, sampleRate: preset.sampleRate, ...ajustes, isMeteringEnabled: false };
  return plataforma === "ios" ? { ...comuns, ...preset.ios } : { ...comuns, ...preset.android };
}

export function arquivoDoAudio(audio: Pick<AudioGravado, "uri">): ArquivoLocal {
  return { uri: audio.uri, nome: NOME_ENVIO_AUDIO, tipo: TIPO_ENVIO_AUDIO };
}

/** Conferência prévia do áudio gravado; null = pode seguir. A API confere de novo (formato, duração, tamanho). */
export function validarAudioGravado(audio: AudioGravado): string | null {
  if (!audio.uri) return "Não foi possível gravar o áudio. Tente de novo.";
  if (audio.duracaoMs < DURACAO_MINIMA_AUDIO_MS) return "Áudio muito curto. Grave de novo.";
  if (audio.duracaoMs > DURACAO_MAXIMA_AUDIO_MS + 2000) return MENSAGEM_AUDIO_GRANDE;
  return null;
}

/**
 * Campos de texto do multipart NA ORDEM do contrato (`ORDEM_CAMPOS_ENVIO_AUDIO`): idCliente,
 * mensagemRespondidaId (só se houver) e duracaoMs. O arquivo vai depois, por último.
 */
export function camposDoEnvioDeAudio(tentativa: Pick<TentativaAudio, "idCliente" | "mensagemRespondidaId"> & { audio: Pick<AudioGravado, "duracaoMs"> }): [string, string][] {
  return [
    ["idCliente", tentativa.idCliente],
    ...(tentativa.mensagemRespondidaId ? ([["mensagemRespondidaId", tentativa.mensagemRespondidaId]] as [string, string][]) : []),
    ["duracaoMs", String(Math.round(tentativa.audio.duracaoMs))],
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
 * Áudio MEU, que não existia quando o envio começou, com a mesma referência. Só evita mostrar o áudio
 * duas vezes naquele instante; quem conclui a tentativa é a resposta HTTP.
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
 * ESTADO DO COMPOSITOR — um de cada vez (mesma precedência da Web):
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

export function proximaVelocidade(atual: number): number {
  const indice = VELOCIDADES_AUDIO.findIndex((velocidade) => velocidade === atual);
  return VELOCIDADES_AUDIO[(indice + 1) % VELOCIDADES_AUDIO.length] ?? 1;
}

export function rotuloVelocidade(velocidade: number): string {
  return `${String(velocidade).replace(".", ",")}x`;
}

/** Fração tocada (0–1) a partir do tempo atual e da duração do ANEXO. */
export function fracaoTocada(tempoAtualSegundos: number, duracaoMs: number): number {
  if (!(duracaoMs > 0) || !Number.isFinite(tempoAtualSegundos)) return 0;
  return Math.min(1, Math.max(0, (tempoAtualSegundos * 1000) / duracaoMs));
}

export { PREVIA_AUDIO };
