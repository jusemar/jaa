import { Image } from "expo-image";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icone } from "@/components/ui/icone";
import { Espaco, Raio } from "@/constants/theme";

/*
 * Foto AMPLIADA — o lightbox da Web no app: fundo escuro, imagem inteira e centralizada (proporção
 * preservada), X para fechar e o botão Voltar do Android fechando (`onRequestClose`). Uma imagem só,
 * sem galeria. Modal, e não outra tela: a conversa continua montada embaixo.
 */
export function VisualizadorImagem({ url, descricao, aoFechar }: { url: string | null; descricao: string; aoFechar: () => void }) {
  const { top } = useSafeAreaInsets();
  return (
    <Modal visible={url !== null} transparent animationType="fade" onRequestClose={aoFechar} statusBarTranslucent>
      <View accessibilityViewIsModal style={estilos.fundo}>
        {/* Tocar no fundo também fecha, como na Web. */}
        <Pressable accessibilityLabel="Fechar imagem" onPress={aoFechar} style={StyleSheet.absoluteFill} />
        {url && <Image source={{ uri: url }} accessibilityLabel={descricao} style={estilos.imagem} contentFit="contain" cachePolicy="memory" pointerEvents="none" />}
        <Pressable accessibilityRole="button" accessibilityLabel="Fechar imagem" hitSlop={8} onPress={aoFechar} style={[estilos.fechar, { top: top + Espaco.tres }]}>
          <Icone nome="fechar" tamanho={22} cor="marcaConteudo" />
        </Pressable>
      </View>
    </Modal>
  );
}

const estilos = StyleSheet.create({
  fundo: { alignItems: "center", backgroundColor: "rgba(0,0,0,0.92)", flex: 1, justifyContent: "center" },
  imagem: { height: "100%", width: "100%" },
  fechar: { alignItems: "center", backgroundColor: "rgba(255,255,255,0.16)", borderRadius: Raio.total, height: 44, justifyContent: "center", position: "absolute", right: Espaco.tres, width: 44 },
});
