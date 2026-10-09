import { Image } from "expo-image";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Cores, Espaco } from "@/constants/theme";
import type { ContaMobile } from "../lib/api-conta";
import { FluxoLogin } from "./fluxo-login";

/**
 * ENTRADA do aplicativo. Uma coluna só, sobre a superfície clara: a logo do Jaaa e o formulário (sem
 * cartão em volta — os campos já delimitam o conteúdo). Nada técnico aparece aqui: versão e build
 * ficam em Perfil → Sobre, e o endereço do servidor só no diagnóstico de desenvolvimento.
 *
 * Em telas altas o bloco fica centralizado; em telas baixas, ou com o teclado aberto, tudo rola a
 * partir do topo — nada fica cortado nem escondido atrás do teclado.
 */
// Proporção do arquivo `jaaa-logo-login.png` (1020 × 275): a imagem nunca é distorcida.
const PROPORCAO_DA_LOGO = 1020 / 275;

export function TelaEntrar({ aoEntrar, etapaInicial }: { aoEntrar: (conta: ContaMobile) => void; etapaInicial?: "senha" | "cadastro" }) {
  return (
    <SafeAreaView style={estilos.tela}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={estilos.flex}>
        <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={estilos.coluna}>
            <View style={estilos.marca}>
              <Image source={require("../../../../assets/images/jaaa-logo-login.png")} accessibilityRole="image" accessibilityLabel="Jaaa" contentFit="contain" style={estilos.logo} />
            </View>
            <FluxoLogin aoEntrar={aoEntrar} {...(etapaInicial ? { etapaInicial } : {})} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  tela: { backgroundColor: Cores.superficie, flex: 1 },
  flex: { flex: 1 },
  // O bloco fica centralizado quando sobra altura; sem altura sobrando, vira uma coluna que rola.
  conteudo: { flexGrow: 1, justifyContent: "center", paddingBottom: Espaco.seis, paddingHorizontal: Espaco.cinco, paddingTop: Espaco.seis },
  coluna: { alignSelf: "center", flexGrow: 1, gap: Espaco.seis, justifyContent: "center", maxWidth: 420, width: "100%" },
  marca: { alignItems: "center" },
  logo: { aspectRatio: PROPORCAO_DA_LOGO, maxWidth: 264, width: "76%" },
});
