import { randomUUID } from "node:crypto";
import {
  DURACAO_MAXIMA_AUDIO_MS,
  DURACAO_MINIMA_AUDIO_MS,
  EXTENSAO_AUDIO,
  MENSAGEM_AUDIO_CURTO,
  MENSAGEM_AUDIO_GRANDE,
  MENSAGEM_AUDIO_INVALIDO,
  tipoAudioAceito,
  type TipoAudioAceito,
} from "@jaa/contratos";

/*
 * VALIDAÇÃO DA MENSAGEM DE VOZ — sem ffmpeg e sem reencodar: o Jaa guarda o ORIGINAL gravado pelo
 * cliente, depois de conferir o que dá para conferir com segurança só com os bytes.
 *
 * - FORMATO pelos BYTES (nunca pelo nome do arquivo): WebM começa com o cabeçalho EBML; MP4 traz a
 *   caixa `ftyp` logo no início. O MIME declarado precisa ser de um formato aceito E concordar com os
 *   bytes.
 * - DURAÇÃO: no MP4 ela está no próprio arquivo (caixa `mvhd`) e é a que vale — o valor do cliente é
 *   ignorado. No WebM gravado pelo MediaRecorder o cabeçalho NÃO traz a duração (o navegador grava em
 *   fluxo), e extraí-la exigiria percorrer todos os blocos do arquivo; aí vale a duração informada
 *   pelo cliente, conferida contra os limites e contra o tamanho (taxa de bits plausível).
 *   LIMITAÇÃO conhecida: um cliente adulterado pode declarar uma duração errada para um WebM, dentro
 *   da faixa plausível. O efeito é só o tempo exibido no player; tamanho e formato continuam impostos.
 */

export class AudioInvalidoErro extends Error {}

export type AudioValidado = {
  conteudo: Buffer;
  tipoConteudo: TipoAudioAceito;
  duracaoMs: number;
};

// Acima disto não é voz comprimida (ou a duração declarada é menor que a real).
const TAXA_MAXIMA_PLAUSIVEL_BITS_POR_SEGUNDO = 512_000;
// Abaixo disto não há áudio de verdade no arquivo (ou a duração declarada é maior que a real).
const TAXA_MINIMA_PLAUSIVEL_BITS_POR_SEGUNDO = 2_000;
// Folga para o cronômetro do cliente e o arredondamento do container.
const TOLERANCIA_DURACAO_MS = 2_000;

const ASSINATURA_EBML = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
// Marcas `ftyp` de MP4/ISO (o que o app e o Safari gravam). 3GPP (`3gp4`, `3gp5`…) fica de FORA de
// propósito: é o container do AMR, que os navegadores não tocam — um gravador mal configurado no
// Android produz exatamente isso, e é melhor recusar do que guardar um áudio que só toca no celular.
const MARCAS_MP4_ACEITAS = new Set(["M4A ", "M4B ", "mp41", "mp42", "isom", "iso2", "iso4", "iso5", "iso6", "dash", "mp4a", "MSNV"]);

export function formatoPelosBytes(conteudo: Buffer): TipoAudioAceito | null {
  if (conteudo.length >= 4 && conteudo.subarray(0, 4).equals(ASSINATURA_EBML)) {
    // EBML também é Matroska (.mkv): o DocType precisa ser "webm" (fica nos primeiros bytes).
    return conteudo.subarray(0, 64).includes("webm") ? "audio/webm" : null;
  }
  if (conteudo.length >= 12 && conteudo.toString("latin1", 4, 8) === "ftyp") {
    return MARCAS_MP4_ACEITAS.has(conteudo.toString("latin1", 8, 12)) ? "audio/mp4" : null;
  }
  return null;
}

/** Percorre as caixas de um nível do MP4; devolve o intervalo do conteúdo da caixa procurada. */
function acharCaixa(conteudo: Buffer, inicio: number, fim: number, nome: string): { inicio: number; fim: number } | null {
  let posicao = inicio;
  while (posicao + 8 <= fim) {
    let tamanho = conteudo.readUInt32BE(posicao);
    let cabecalho = 8;
    if (tamanho === 1) {
      if (posicao + 16 > fim) return null;
      const grande = conteudo.readBigUInt64BE(posicao + 8);
      if (grande > BigInt(Number.MAX_SAFE_INTEGER)) return null;
      tamanho = Number(grande);
      cabecalho = 16;
    } else if (tamanho === 0) {
      tamanho = fim - posicao;
    }
    if (tamanho < cabecalho || posicao + tamanho > fim) return null;
    if (conteudo.toString("latin1", posicao + 4, posicao + 8) === nome) return { inicio: posicao + cabecalho, fim: posicao + tamanho };
    posicao += tamanho;
  }
  return null;
}

/** Duração de um MP4 em ms (caixa moov → mvhd), ou null quando o arquivo não a informa. */
export function duracaoDoMp4(conteudo: Buffer): number | null {
  const moov = acharCaixa(conteudo, 0, conteudo.length, "moov");
  if (!moov) return null;
  const mvhd = acharCaixa(conteudo, moov.inicio, moov.fim, "mvhd");
  if (!mvhd) return null;
  const versao = conteudo.readUInt8(mvhd.inicio);
  // versão 0: criação(4) modificação(4) escala(4) duração(4); versão 1: 8, 8, 4, 8.
  const base = mvhd.inicio + 4 + (versao === 1 ? 16 : 8);
  if (base + (versao === 1 ? 12 : 8) > mvhd.fim) return null;
  const escala = conteudo.readUInt32BE(base);
  const duracao = versao === 1 ? Number(conteudo.readBigUInt64BE(base + 4)) : conteudo.readUInt32BE(base + 4);
  if (escala === 0 || !Number.isFinite(duracao) || duracao <= 0) return null;
  return Math.round((duracao / escala) * 1000);
}

function taxaPlausivel(tamanhoBytes: number, duracaoMs: number): boolean {
  const bitsPorSegundo = (tamanhoBytes * 8) / (duracaoMs / 1000);
  return bitsPorSegundo >= TAXA_MINIMA_PLAUSIVEL_BITS_POR_SEGUNDO && bitsPorSegundo <= TAXA_MAXIMA_PLAUSIVEL_BITS_POR_SEGUNDO;
}

export function validarAudio(conteudo: Buffer, tipoDeclarado: string, duracaoInformadaMs: number): AudioValidado {
  if (conteudo.length === 0) throw new AudioInvalidoErro(MENSAGEM_AUDIO_INVALIDO);
  const declarado = tipoAudioAceito(tipoDeclarado);
  const real = formatoPelosBytes(conteudo);
  // MIME fora da lista, bytes de outro formato, ou um dizendo uma coisa e o outro outra.
  if (!declarado || !real || declarado !== real) throw new AudioInvalidoErro(MENSAGEM_AUDIO_INVALIDO);

  const duracaoMs = real === "audio/mp4" ? (duracaoDoMp4(conteudo) ?? duracaoInformadaMs) : duracaoInformadaMs;
  if (!Number.isInteger(duracaoMs) || duracaoMs < DURACAO_MINIMA_AUDIO_MS) throw new AudioInvalidoErro(MENSAGEM_AUDIO_CURTO);
  if (duracaoMs > DURACAO_MAXIMA_AUDIO_MS + TOLERANCIA_DURACAO_MS) throw new AudioInvalidoErro(MENSAGEM_AUDIO_GRANDE);
  if (!taxaPlausivel(conteudo.length, duracaoMs)) throw new AudioInvalidoErro(MENSAGEM_AUDIO_INVALIDO);

  return { conteudo, tipoConteudo: real, duracaoMs: Math.min(duracaoMs, DURACAO_MAXIMA_AUDIO_MS) };
}

/** Chave do objeto PRIVADO: gerada pelo servidor, com a extensão do formato validado. */
export function montarChaveAudio(conversaId: string, tipoConteudo: TipoAudioAceito): string {
  return `audio-conversa/${conversaId}/${randomUUID()}.${EXTENSAO_AUDIO[tipoConteudo]}`;
}
