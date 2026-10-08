import { Image } from "expo-image";
import type { ReactNode } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Espaco } from "@/constants/theme";
import { COR_DE_FUNDO_DO_CARREGAMENTO, ajusteDaArte } from "@/lib/tela-carregamento";

// A arte aprovada, exatamente como foi entregue (nenhum pixel alterado).
const ARTE = require("../../../assets/images/jaaa-tela-carregamento.png");

/**
 * TELA DE CARREGAMENTO do Jaaa: a arte aprovada em tela cheia, sem deformar e sem cortar o logo (a
 * decisão de conter/cobrir está em `lib/tela-carregamento.ts`). Atrás dela vai a MESMA arte, cobrindo
 * a tela e desfocada: é o que preenche as faixas quando a arte entra inteira — nunca outra cor.
 * `children` fica na parte de baixo, por cima da arte (indicador de carregamento, aviso de erro).
 * Se a imagem não carregar, sobra o fundo claro da própria arte e o conteúdo: nada de tela branca vazia.
 */
export function TelaDeCarregamento({ children }: { children?: ReactNode }) {
  const { width, height } = useWindowDimensions();
  const { bottom } = useSafeAreaInsets();
  const ajuste = ajusteDaArte(width, height);

  return (
    <View style={estilos.tela}>
      <Image source={ARTE} contentFit="cover" blurRadius={40} accessible={false} style={StyleSheet.absoluteFill} />
      <Image source={ARTE} contentFit={ajuste === "cobrir" ? "cover" : "contain"} accessibilityLabel="Jaaa" transition={0} style={StyleSheet.absoluteFill} />
      {children && <View style={[estilos.conteudo, { paddingBottom: bottom + Espaco.seis }]}>{children}</View>}
    </View>
  );
}

const estilos = StyleSheet.create({
  tela: { backgroundColor: COR_DE_FUNDO_DO_CARREGAMENTO, flex: 1 },
  conteudo: { alignItems: "center", bottom: 0, gap: Espaco.tres, left: 0, paddingHorizontal: Espaco.cinco, position: "absolute", right: 0 },
});
