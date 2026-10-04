import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Cartao } from "@/components/ui/superficies";
import { Texto } from "@/components/ui/texto";
import { Cores, Espaco } from "@/constants/theme";
import type { ContaMobile } from "../lib/api-conta";
import { FluxoLogin } from "./fluxo-login";

/**
 * Entrada do aplicativo: a marca e o cartão de login, como na Web. O teclado empurra o conteúdo (em vez
 * de cobrir o campo) e a tela rola em aparelhos pequenos.
 */
export function TelaEntrar({ aoEntrar, etapaInicial }: { aoEntrar: (conta: ContaMobile) => void; etapaInicial?: "senha" | "cadastro" }) {
  return (
    <SafeAreaView style={estilos.tela}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={estilos.flex}>
        <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
          <View style={estilos.marca}>
            <Texto variante="marca" cor="marca" accessibilityRole="header">
              Jaa
            </Texto>
            <Texto cor="conteudoSuave">Suas conversas, do seu jeito</Texto>
          </View>
          <Cartao>
            <FluxoLogin aoEntrar={aoEntrar} {...(etapaInicial ? { etapaInicial } : {})} />
          </Cartao>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  tela: { backgroundColor: Cores.fundo, flex: 1 },
  flex: { flex: 1 },
  conteudo: { flexGrow: 1, gap: Espaco.cinco, justifyContent: "center", padding: Espaco.cinco },
  marca: { alignItems: "center", gap: Espaco.um },
});
