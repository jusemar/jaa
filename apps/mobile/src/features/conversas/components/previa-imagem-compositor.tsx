import { Image } from "expo-image";
import { Pressable, StyleSheet, View } from "react-native";
import { Icone } from "@/components/ui/icone";
import { Texto } from "@/components/ui/texto";
import { Cores, Espaco, Raio } from "@/constants/theme";

/* Foto escolhida, acima do campo: miniatura local e remover. O campo de texto vira a legenda. */
export function PreviaImagemCompositor({ uri, aoRemover }: { uri: string; aoRemover: () => void }) {
  return (
    <View accessibilityLabel="Foto selecionada" style={estilos.bloco}>
      <Image source={{ uri }} style={estilos.miniatura} contentFit="cover" />
      <Texto variante="pequeno" cor="conteudoSuave" style={estilos.texto}>
        Foto pronta para enviar
      </Texto>
      <Pressable accessibilityRole="button" accessibilityLabel="Remover foto" hitSlop={8} onPress={aoRemover} style={estilos.remover}>
        <Icone nome="fechar" tamanho={16} />
      </Pressable>
    </View>
  );
}

const estilos = StyleSheet.create({
  bloco: { alignItems: "center", backgroundColor: Cores.superficie, borderColor: Cores.borda, borderRadius: Raio.bloco, borderWidth: 1, flexDirection: "row", gap: Espaco.dois, padding: 6 },
  miniatura: { borderRadius: Raio.compacto, height: 56, width: 56 },
  texto: { flex: 1 },
  remover: { alignItems: "center", height: 28, justifyContent: "center", width: 28 },
});
