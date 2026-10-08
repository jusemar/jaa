import { tocarSom } from "@/lib/sons/tocar-som";
import { gravacaoEmCurso } from "./audio-nativo";
import { reprodutorUnico } from "./reprodutor-unico";

/*
 * Toque de mensagem RECEBIDA: o som 01 da identidade sonora do Jaaa (`lib/sons`), pelo expo-audio já
 * usado nas mensagens de voz. Sem o módulo nativo (build antigo), fica em silêncio.
 */

/**
 * O toque tomaria o foco de áudio de uma mensagem de voz em reprodução e entraria na gravação em
 * curso: nesses dois casos a mensagem chega só com o indicador visual.
 */
export function aparelhoLivreParaSom(): boolean {
  return !reprodutorUnico.ocupado() && !gravacaoEmCurso();
}

export function tocarSomMensagem(): void {
  tocarSom("mensagemRecebida");
}
