import { useState } from "react";
import { Linking, Share, StyleSheet, View } from "react-native";
import { Botao } from "@/components/ui/botao";
import { Aviso } from "@/components/ui/superficies";
import { Texto } from "@/components/ui/texto";
import { Espaco } from "@/constants/theme";
import { linkPublico } from "../lib/link-publico";
import { ORIGEM_DO_SITE } from "../lib/origem-do-site";

/**
 * LINK PÚBLICO do próprio perfil (pessoa ou empresa): `<site>/@usuario`, a mesma regra da Web. Abre a
 * conversa com esta identidade no navegador de quem recebe. O texto é selecionável (para copiar) e
 * "Compartilhar" usa a folha de compartilhamento do aparelho — que também oferece copiar.
 */
export function LinkPublico({ nomeUsuario }: { nomeUsuario: string }) {
  const [erro, setErro] = useState<string | null>(null);
  if (!ORIGEM_DO_SITE) return <Aviso>Seu endereço público é @{nomeUsuario}. O link completo aparece aqui quando o endereço do site do Jaaa estiver configurado neste aplicativo.</Aviso>;
  const link = linkPublico(ORIGEM_DO_SITE, nomeUsuario);

  async function compartilhar() {
    setErro(null);
    try {
      await Share.share({ message: link });
    } catch {
      setErro("Não foi possível abrir o compartilhamento. Toque e segure o endereço para copiar.");
    }
  }

  async function abrir() {
    setErro(null);
    try {
      await Linking.openURL(link);
    } catch {
      setErro("Não foi possível abrir o navegador.");
    }
  }

  return (
    <View style={estilos.bloco}>
      <Texto selectable variante="corpoMedio" cor="marca" accessibilityRole="link" accessibilityLabel={`Seu link público: ${link}`} onPress={() => void abrir()} style={estilos.link}>
        {link}
      </Texto>
      <View style={estilos.acoes}>
        <Botao rotulo="Compartilhar link" aparencia="secundario" onPress={() => void compartilhar()} />
        <Botao rotulo="Abrir" aparencia="discreto" onPress={() => void abrir()} />
      </View>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
    </View>
  );
}

const estilos = StyleSheet.create({
  bloco: { gap: Espaco.tres },
  link: { textDecorationLine: "underline" },
  acoes: { flexDirection: "row", flexWrap: "wrap", gap: Espaco.dois },
});
