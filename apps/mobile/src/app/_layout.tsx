import { DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";

import { Cores } from "@/constants/theme";
import { PortaoSessao } from "@/features/conta/components/portao-sessao";
import { ProvedorContextoConta } from "@/features/conta/components/provedor-contexto-conta";
// Define a tarefa de presença na base logo na partida: o sistema pode acordar o app sem tela nenhuma
// e procura a tarefa pelo nome.
import "@/features/entregas/lib/presenca-segundo-plano";

SplashScreen.preventAutoHideAsync();

// Navegação com as cores do Jaa (fundo das telas, cabeçalho do Stack, cor de destaque).
const TEMA_JAA = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, primary: Cores.marca, background: Cores.fundo, card: Cores.superficie, text: Cores.conteudo, border: Cores.borda },
};

export default function LayoutRaiz() {
  // A tela de carregamento do próprio app (portão de sessão) assume assim que o layout monta.
  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);

  return (
    <ThemeProvider value={TEMA_JAA}>
      {/* Contexto da conta disponível para o app inteiro (fonte única, `useContextoConta`). */}
      <ProvedorContextoConta>
        <StatusBar style="dark" />
        {/* Sem sessão, a pessoa vê a entrada; com sessão, o app (realtime + identidade atuante + telas). */}
        <PortaoSessao>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Cores.fundo } }}>
            <Stack.Screen name="(abas)" />
            {/* A conversa aberta toma a tela inteira: a navegação inferior sai do caminho, como na Web. */}
            <Stack.Screen name="conversa/[id]" options={{ animation: "slide_from_right" }} />
            {/* TEMPORÁRIO: diagnóstico de desenvolvimento, aberto a partir de Perfil. */}
            <Stack.Screen name="diagnostico" options={{ headerShown: true, title: "Diagnóstico", headerTintColor: Cores.marca, headerShadowVisible: false }} />
          </Stack>
        </PortaoSessao>
      </ProvedorContextoConta>
    </ThemeProvider>
  );
}
