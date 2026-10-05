import { gravacaoEmCurso, obterExpoAudio } from "./audio-nativo";
import { reprodutorUnico } from "./reprodutor-unico";

/*
 * Toque de mensagem recebida no aparelho, pelo expo-audio já usado nas mensagens de voz. O arquivo
 * (`assets/sons/mensagem-recebida.wav`) reproduz o desenho da Web: 880 Hz e, 0,14 s depois, 1320 Hz.
 *
 * UM player para o app, criado no primeiro toque. Sem o módulo nativo (build antigo), fica em silêncio.
 */
type Reprodutor = ReturnType<NonNullable<ReturnType<typeof obterExpoAudio>>["createAudioPlayer"]>;

const VOLUME = 0.6;
let reprodutor: Reprodutor | null | undefined;

function obterReprodutor(): Reprodutor | null {
  if (reprodutor !== undefined) return reprodutor;
  const audio = obterExpoAudio();
  try {
    reprodutor = audio ? audio.createAudioPlayer(require("../../../../assets/sons/mensagem-recebida.wav")) : null;
    if (reprodutor) reprodutor.volume = VOLUME;
  } catch {
    reprodutor = null;
  }
  return reprodutor;
}

/**
 * O toque tomaria o foco de áudio de uma mensagem de voz em reprodução e entraria na gravação em
 * curso: nesses dois casos a mensagem chega só com o indicador visual.
 */
export function aparelhoLivreParaSom(): boolean {
  return !reprodutorUnico.ocupado() && !gravacaoEmCurso();
}

export function tocarSomMensagem(): void {
  const atual = obterReprodutor();
  if (!atual) return;
  // Volta ao início antes de tocar: depois do primeiro toque o player está parado no fim da faixa.
  void atual
    .seekTo(0)
    .then(() => atual.play())
    .catch(() => undefined);
}
