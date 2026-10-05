import { TAXA_BITS_AUDIO_APP } from "@jaa/contratos";
import { Platform } from "react-native";
import { opcoesDeGravacaoNativas } from "./audio-conversa";
import type { MicrofoneDoAparelho } from "./gravador-audio";

/*
 * Ligação REAL com o expo-audio (gravar e tocar). O módulo é carregado SOB DEMANDA e com proteção:
 * um Development Build anterior à inclusão do expo-audio não tem o módulo nativo, e importar no topo
 * derrubaria a tela da conversa inteira. Sem o módulo, o app continua funcionando — só avisa que
 * aquela versão não grava nem toca áudio.
 */
type ExpoAudio = typeof import("expo-audio");

let carregado: ExpoAudio | null | undefined;

export function obterExpoAudio(): ExpoAudio | null {
  if (carregado !== undefined) return carregado;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const modulo = require("expo-audio") as ExpoAudio;
    // Sem o módulo nativo, o pacote JS carrega mas não tem como criar player nem gravador.
    carregado = modulo.AudioModule && typeof modulo.createAudioPlayer === "function" ? modulo : null;
  } catch {
    carregado = null;
  }
  return carregado;
}

/*
 * Modo de REPRODUÇÃO: saída normal de mídia (alto-falante, nunca o fone de ouvido de chamada), som
 * mesmo no modo silencioso do iOS, sem gravação e sem tocar em segundo plano. É aplicado antes de
 * tocar E ao terminar uma gravação — o modo de gravação nunca "vaza" para a reprodução seguinte.
 */
export const MODO_DE_REPRODUCAO = { allowsRecording: false, playsInSilentMode: true, shouldPlayInBackground: false, shouldRouteThroughEarpiece: false } as const;

/** Aplica o modo de reprodução antes de tocar. */
export async function prepararParaTocar(): Promise<void> {
  await obterExpoAudio()
    ?.setAudioModeAsync(MODO_DE_REPRODUCAO)
    .catch(() => undefined);
}

// Enquanto o microfone está aberto, nenhum som do app pode tocar (entraria na gravação).
let gravando = false;
export const gravacaoEmCurso = (): boolean => gravando;

/** Microfone do aparelho: MP4/AAC mono a 64 kbps (voz), um arquivo temporário por gravação. */
export function microfoneDoAparelho(): MicrofoneDoAparelho {
  const audio = obterExpoAudio();
  return {
    disponivel: audio !== null,
    async pedirPermissao() {
      return (await audio!.requestRecordingPermissionsAsync()).granted;
    },
    async iniciar() {
      const modulo = audio!;
      await modulo.setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, shouldPlayInBackground: false, allowsBackgroundRecording: false });
      // MP4 + AAC (.m4a), mono, 64 kbps — com as opções da plataforma no nível que o gravador nativo lê.
      const opcoes = opcoesDeGravacaoNativas(modulo.RecordingPresets.HIGH_QUALITY, Platform.OS, { numberOfChannels: 1, bitRate: TAXA_BITS_AUDIO_APP });
      const gravador = new modulo.AudioModule.AudioRecorder(opcoes);
      await gravador.prepareToRecordAsync();
      gravador.record();
      gravando = true;
      return {
        async parar() {
          try {
            await gravador.stop();
            return gravador.uri;
          } finally {
            gravando = false;
            // Solta o microfone e devolve o áudio do aparelho ao modo de reprodução.
            await modulo.setAudioModeAsync(MODO_DE_REPRODUCAO).catch(() => undefined);
          }
        },
      };
    },
    agora: () => Date.now(),
    agendar: (executar, emMs) => setTimeout(executar, emMs),
    cancelarAgendamento: (agendamento) => clearTimeout(agendamento as ReturnType<typeof setTimeout>),
  };
}
