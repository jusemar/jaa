import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from "react-native";
import { ALTURA_TOQUE, Cores, Espaco, Raio } from "@/constants/theme";
import { Icone, type NomeIcone } from "./icone";
import { Texto } from "./texto";

/**
 * `CampoTexto` da Web: rótulo sempre visível, campo de 44px com borda, dica ou erro embaixo.
 *
 * `acao` põe um botão de ícone DENTRO do campo, à direita (ex.: mostrar/ocultar a senha). Ele não é
 * parte do texto: tocar nele não muda o valor nem tira o foco do campo.
 */
export function CampoTexto({
  rotulo,
  dica,
  erro,
  acao,
  style,
  ...props
}: TextInputProps & { rotulo: string; dica?: string; erro?: string | null; acao?: { icone: NomeIcone; rotulo: string; ativa?: boolean; aoTocar: () => void } }) {
  return (
    <View style={estilos.grupo}>
      <Texto variante="corpoMedio">{rotulo}</Texto>
      <View>
        <TextInput {...props} accessibilityLabel={rotulo} placeholderTextColor="#A2AAAB" style={[estilos.campo, acao && estilos.campoComAcao, style]} />
        {acao && (
          <Pressable accessibilityRole="button" accessibilityLabel={acao.rotulo} accessibilityState={{ selected: Boolean(acao.ativa) }} hitSlop={4} onPress={acao.aoTocar} style={({ pressed }) => [estilos.acao, pressed && estilos.pressionada]}>
            <Icone nome={acao.icone} tamanho={20} />
          </Pressable>
        )}
      </View>
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
  // O texto termina antes do botão: senha longa não passa por baixo do ícone.
  campoComAcao: { paddingRight: ALTURA_TOQUE },
  acao: { alignItems: "center", bottom: 0, justifyContent: "center", position: "absolute", right: 0, top: 0, width: ALTURA_TOQUE },
  pressionada: { opacity: 0.5 },
});
