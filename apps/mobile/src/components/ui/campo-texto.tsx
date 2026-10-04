import { StyleSheet, TextInput, View, type TextInputProps } from "react-native";
import { ALTURA_TOQUE, Cores, Espaco, Raio } from "@/constants/theme";
import { Texto } from "./texto";

/** `CampoTexto` da Web: rótulo sempre visível, campo de 44px com borda, dica ou erro embaixo. */
export function CampoTexto({ rotulo, dica, erro, style, ...props }: TextInputProps & { rotulo: string; dica?: string; erro?: string | null }) {
  return (
    <View style={estilos.grupo}>
      <Texto variante="corpoMedio">{rotulo}</Texto>
      <TextInput {...props} accessibilityLabel={rotulo} placeholderTextColor="#A2AAAB" style={[estilos.campo, style]} />
      {dica && !erro && (
        <Texto variante="pequeno" cor="conteudoSuave">
          {dica}
        </Texto>
      )}
      {erro && (
        <Texto variante="pequeno" cor="perigo" accessibilityRole="alert">
          {erro}
        </Texto>
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  grupo: { gap: 6 },
  campo: {
    backgroundColor: Cores.superficie,
    borderColor: Cores.borda,
    borderRadius: Raio.compacto,
    borderWidth: 1,
    color: Cores.conteudo,
    // 16px (`text-base`), como nos campos da Web.
    fontSize: 16,
    minHeight: ALTURA_TOQUE,
    paddingHorizontal: Espaco.tres,
    paddingVertical: 0,
  },
});
