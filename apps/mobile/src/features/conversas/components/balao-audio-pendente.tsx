import { Pressable, StyleSheet, View } from "react-native";
import { Texto } from "@/components/ui/texto";
import { Cores, Espaco, Raio } from "@/constants/theme";
import type { AudioGravado } from "../lib/audio-conversa";
import type { EstadoImagem } from "../lib/urls-imagens";
import { PlayerAudio } from "./player-audio";

/*
 * ÁUDIO EM ENVIO: aparece na conversa na hora, tocável do arquivo LOCAL, antes de a API responder.
 * Falhou de forma recuperável? Continua aqui como "Não enviado", com Reenviar (a MESMA tentativa, mesmo
 * idCliente) e Descartar.
 */
export function BalaoAudioPendente({ audio, situacao, aoReenviar, aoDescartar }: { audio: AudioGravado; situacao: "enviando" | "falhou"; aoReenviar: () => void; aoDescartar: () => void }) {
  const estado: EstadoImagem = { situacao: "pronta", url: audio.uri };
  return (
    <View accessibilityLabel={situacao === "enviando" ? "Áudio sendo enviado" : "Áudio não enviado"} style={estilos.linha}>
      <View style={estilos.balao}>
        <PlayerAudio estado={estado} duracaoMs={audio.duracaoMs} />
        {situacao === "enviando" ? (
          <Texto variante="miniForte" cor="conteudoSuave" style={estilos.rodape}>
            Enviando…
          </Texto>
        ) : (
          <View style={estilos.falha}>
            <Texto variante="pequenoForte" cor="perigo">
              Não enviado
            </Texto>
            <Pressable accessibilityRole="button" hitSlop={8} onPress={aoReenviar}>
              <Texto variante="pequenoForte" cor="marca">
                Reenviar
              </Texto>
            </Pressable>
            <Pressable accessibilityRole="button" hitSlop={8} onPress={aoDescartar}>
              <Texto variante="pequenoMedio" cor="conteudoSuave">
                Descartar
              </Texto>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: "row", justifyContent: "flex-end", paddingBottom: Espaco.tres, paddingHorizontal: Espaco.quatro },
  balao: { backgroundColor: Cores.mensagemEnviada, borderRadius: Raio.bloco, elevation: 1, gap: Espaco.um, maxWidth: "86%", paddingHorizontal: Espaco.quatro, paddingVertical: Espaco.tres },
  rodape: { alignSelf: "flex-end", fontWeight: "400" },
  falha: { alignItems: "center", flexDirection: "row", gap: Espaco.tres, justifyContent: "flex-end" },
});
