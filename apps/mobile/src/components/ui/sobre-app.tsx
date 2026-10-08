import { Image } from "expo-image";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Espaco } from "@/constants/theme";
import { AUTORIA_DO_APP, rotuloVersao } from "@/lib/rotulo-versao";
import { lerVersaoInstalada } from "@/lib/versao-instalada";
import { Texto } from "./texto";

/**
 * Rodapé discreto "sobre o aplicativo": a logo da versão, "Jaaa <versão> · Build <n>" e a autoria.
 * `comLogo={false}` deixa só as linhas de texto (tela de entrada, que já tem a logo grande).
 */
export function SobreApp({ comLogo = true }: { comLogo?: boolean }) {
  const [rotulo] = useState(() =>
    // Formatador criado no uso, nunca no carregamento do módulo (guardaria o fuso antigo do aparelho).
    rotuloVersao(lerVersaoInstalada(), (data) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(data)),
  );
  return (
    <View accessibilityLabel="Sobre o aplicativo" style={estilos.sobre}>
      {comLogo && <Image source={require("../../../assets/images/jaaa-logo-versao.png")} accessibilityLabel="Jaaa" contentFit="contain" style={estilos.logo} />}
      <View style={estilos.linhas}>
        <Texto variante="pequenoMedio" cor="conteudoSuave">
          {rotulo.principal}
        </Texto>
        {rotulo.detalhe && (
          <Texto variante="mini" cor="conteudoSuave">
            {rotulo.detalhe}
          </Texto>
        )}
        <Texto variante="mini" cor="conteudoSuave">
          {AUTORIA_DO_APP}
        </Texto>
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  sobre: { alignItems: "center", gap: Espaco.dois, paddingVertical: Espaco.dois },
  logo: { height: 56, width: 56 },
  linhas: { alignItems: "center", gap: 2 },
});
