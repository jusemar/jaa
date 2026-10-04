import { DURACAO_MAXIMA_AUDIO_MS, formatarDuracaoAudio } from "@jaa/contratos";
import { Pressable, StyleSheet, View } from "react-native";
import { Icone } from "@/components/ui/icone";
import { Texto } from "@/components/ui/texto";
import { Cores, Espaco, Raio } from "@/constants/theme";
import type { EstadoImagem } from "../lib/urls-imagens";
import { PlayerAudio } from "./player-audio";

/*
 * O COMPOSITOR durante a mensagem de voz, no lugar da pílula de texto (nunca os dois juntos):
 *   GRAVANDO → ponto vermelho, cronômetro, Cancelar e Parar;
 *   PRONTO   → ouvir a prévia, Descartar e Enviar.
 * Parar NÃO envia: a pessoa ouve antes — é o que evita o áudio mandado sem querer.
 */

export function GravandoAudio({ decorridoMs, aoCancelar, aoParar }: { decorridoMs: number; aoCancelar: () => void; aoParar: () => void }) {
  return (
    <View accessibilityLabel={`Gravando áudio, ${formatarDuracaoAudio(decorridoMs)} de no máximo ${formatarDuracaoAudio(DURACAO_MAXIMA_AUDIO_MS)}`} style={[estilos.pilula, estilos.gravando]}>
      <View style={estilos.ponto} />
      <Texto variante="corpoMedio" style={estilos.flex} numberOfLines={1}>
        Gravando{" "}
        <Texto cor="conteudoSuave">{formatarDuracaoAudio(decorridoMs)}</Texto>
      </Texto>
      <Pressable accessibilityRole="button" hitSlop={6} onPress={aoCancelar} style={estilos.cancelar}>
        <Texto variante="pequenoMedio" cor="conteudoSuave">
          Cancelar
        </Texto>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Parar gravação" hitSlop={6} onPress={aoParar} style={[estilos.redondo, estilos.parar]}>
        <Icone nome="parar" tamanho={18} cor="marcaConteudo" />
      </Pressable>
    </View>
  );
}

export function AudioProntoParaEnviar({ uri, duracaoMs, aoDescartar, aoEnviar, desabilitado = false }: { uri: string; duracaoMs: number; aoDescartar: () => void; aoEnviar: () => void; desabilitado?: boolean }) {
  const estado: EstadoImagem = { situacao: "pronta", url: uri };
  return (
    <View accessibilityLabel="Áudio pronto para enviar" style={estilos.pilula}>
      <Pressable accessibilityRole="button" accessibilityLabel="Descartar áudio" hitSlop={6} onPress={aoDescartar} style={estilos.redondo}>
        <Icone nome="lixeira" tamanho={18} />
      </Pressable>
      <View style={estilos.flex}>
        <PlayerAudio estado={estado} duracaoMs={duracaoMs} />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Enviar áudio"
        disabled={desabilitado}
        hitSlop={6}
        onPress={aoEnviar}
        style={[estilos.redondo, estilos.enviar, desabilitado && estilos.inativo]}>
        <Icone nome="enviar" tamanho={16} cor="marcaConteudo" />
      </Pressable>
    </View>
  );
}

const estilos = StyleSheet.create({
  pilula: { alignItems: "center", backgroundColor: Cores.superficie, borderColor: Cores.borda, borderRadius: Raio.total, borderWidth: 1, elevation: 1, flexDirection: "row", gap: Espaco.dois, minHeight: 46, padding: Espaco.um },
  gravando: { paddingLeft: Espaco.tres },
  flex: { flex: 1, minWidth: 0 },
  ponto: { backgroundColor: Cores.perigo, borderRadius: 5, height: 10, width: 10 },
  cancelar: { alignItems: "center", height: 36, justifyContent: "center", paddingHorizontal: Espaco.dois },
  redondo: { alignItems: "center", borderRadius: Raio.total, height: 36, justifyContent: "center", width: 36 },
  parar: { backgroundColor: Cores.perigo },
  enviar: { backgroundColor: Cores.marca },
  inativo: { opacity: 0.5 },
});
