import type { ReactNode } from "react";
import { KeyboardAvoidingView, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { BarraTopo } from "@/components/navegacao/barra-topo";
import { Cores, Espaco } from "@/constants/theme";

/*
 * Moldura das ÁREAS que não são a conversa (Contatos, Entregas, Perfil) — como na Web: a barra do topo
 * (marca + "Agindo como" + Sair) e uma coluna de conteúdo com respiro, rolável. O espaço no fim deixa o
 * último bloco livre da barra de navegação inferior.
 */
export function Tela({ atualizando = false, aoAtualizar, children }: { atualizando?: boolean; aoAtualizar?: () => void; children: ReactNode }) {
  return (
    <View style={estilos.tela}>
      <BarraTopo />
      <KeyboardAvoidingView behavior="padding" style={estilos.flex}>
        <ScrollView
          contentContainerStyle={estilos.conteudo}
          keyboardShouldPersistTaps="handled"
          refreshControl={aoAtualizar ? <RefreshControl refreshing={atualizando} onRefresh={aoAtualizar} tintColor={Cores.marca} colors={[Cores.marca]} /> : undefined}>
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const estilos = StyleSheet.create({
  tela: { backgroundColor: Cores.fundo, flex: 1 },
  flex: { flex: 1 },
  conteudo: { gap: Espaco.cinco, paddingBottom: 96, paddingHorizontal: Espaco.quatro, paddingTop: Espaco.quatro },
});
