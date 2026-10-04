/*
 * REPRODUÇÃO da mensagem de voz — as decisões do player, sem o módulo nativo (testável em Node).
 *
 * O ponto delicado é o FIM da faixa. No Android (ExoPlayer) o reprodutor chega ao fim ainda com a
 * intenção "tocar quando estiver pronto" ligada; se o app só volta a posição para o início, ele entra
 * em "pronto" de novo e TOCA SOZINHO — e o áudio se repete para sempre. Por isso, ao terminar, o
 * reprodutor é PAUSADO antes de voltar ao início, e nada chama `play` até a pessoa tocar de novo.
 */

/** O mínimo do reprodutor nativo (expo-audio) que o Jaa usa. */
export interface ReprodutorNativo {
  loop: boolean;
  volume: number;
  muted: boolean;
  playing: boolean;
  play(): void;
  pause(): void;
  seekTo(segundos: number): Promise<void>;
  setPlaybackRate(velocidade: number): void;
}

/** O que o reprodutor informa a cada atualização. */
export interface SituacaoReproducao {
  playing: boolean;
  currentTime: number;
  isLoaded: boolean;
  didJustFinish: boolean;
  error?: string | null;
}

/** Mensagem de voz toca UMA vez, no volume cheio do app (o volume do aparelho é do sistema). */
export function configurarReprodutor(reprodutor: Pick<ReprodutorNativo, "loop" | "volume" | "muted">): void {
  reprodutor.loop = false;
  reprodutor.volume = 1;
  reprodutor.muted = false;
}

export type LeituraDaSituacao =
  // Falha REAL de acesso/reprodução (URL vencida, arquivo inacessível): quem cuida do cache renova uma vez.
  | { tipo: "erro" }
  // Fim NORMAL da faixa: não é erro, não renova URL, não toca de novo.
  | { tipo: "terminou" }
  | { tipo: "andamento"; tocando: boolean; tempoAtual: number };

export function lerSituacao(situacao: SituacaoReproducao): LeituraDaSituacao {
  if (situacao.error) return { tipo: "erro" };
  if (situacao.didJustFinish) return { tipo: "terminou" };
  return { tipo: "andamento", tocando: situacao.playing, tempoAtual: situacao.currentTime };
}

/** Fim da faixa: PAUSA (desliga a intenção de tocar) e só então volta ao início. Nunca chama `play`. */
export function encerrarNoFim(reprodutor: Pick<ReprodutorNativo, "pause" | "seekTo">): void {
  reprodutor.pause();
  void reprodutor.seekTo(0).catch(() => undefined);
}
