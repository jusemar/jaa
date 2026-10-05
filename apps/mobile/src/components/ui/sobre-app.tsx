import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { rotuloVersao } from "@/lib/rotulo-versao";
import { lerVersaoInstalada } from "@/lib/versao-instalada";
import { Texto } from "./texto";

/** Rodapé discreto com a versão instalada (e o ambiente, fora de produção). */
export function SobreApp() {
  const [rotulo] = useState(() =>
    // Formatador criado no uso, nunca no carregamento do módulo (guardaria o fuso antigo do aparelho).
    rotuloVersao(lerVersaoInstalada(), (data) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(data)),
  );
  return (
    <View accessibilityLabel="Sobre o aplicativo" style={estilos.sobre}>
      <Texto variante="mini" cor="conteudoSuave">
        {rotulo.principal}
      </Texto>
      {rotulo.detalhe && (
        <Texto variante="mini" cor="conteudoSuave">
          {rotulo.detalhe}
        </Texto>
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  sobre: { alignItems: "center", gap: 2 },
});
