import { Image } from "expo-image";
import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { Texto } from "@/components/ui/texto";
import { Cores, Espaco, Raio } from "@/constants/theme";
import { espacoDaImagem, type ImagemPreparada } from "../lib/imagem-conversa";
import { larguraDaImagemNoBalao } from "./balao-mensagem";

/*
 * FOTO EM ENVIO: aparece na conversa na hora, com a prévia LOCAL (o arquivo do aparelho), antes de a
 * API responder. Falhou de forma recuperável? Continua aqui como "Não enviada", com Reenviar (a MESMA
 * tentativa, mesmo idCliente) e Descartar.
 */
export function BalaoImagemPendente({
  imagem,
  legenda,
  situacao,
  aoReenviar,
  aoDescartar,
}: {
  imagem: ImagemPreparada;
  legenda: string;
  situacao: "enviando" | "falhou";
  aoReenviar: () => void;
  aoDescartar: () => void;
}) {
  const { width } = useWindowDimensions();
  const espaco = espacoDaImagem(imagem.largura, imagem.altura, larguraDaImagemNoBalao(width));
  const tamanho = { width: espaco.largura, height: espaco.altura };
  return (
    <View accessibilityLabel={situacao === "enviando" ? "Foto sendo enviada" : "Foto não enviada"} style={estilos.linha}>
      <View style={estilos.balao}>
        <View style={[estilos.moldura, tamanho]}>
          <Image source={{ uri: imagem.uri }} style={[tamanho, situacao === "enviando" && estilos.enviando]} contentFit="cover" />
        </View>
        {legenda !== "" && (
          <Texto cor="mensagemEnviadaConteudo" style={estilos.legenda}>
            {legenda}
          </Texto>
        )}
        {situacao === "enviando" ? (
          <Texto variante="miniForte" cor="conteudoSuave" style={estilos.rodape}>
            Enviando…
          </Texto>
        ) : (
          <View style={estilos.falha}>
            <Texto variante="pequenoForte" cor="perigo">
              Não enviada
            </Texto>
            <Pressable accessibilityRole="button" hitSlop={8} onPress={aoReenviar}>
              <Texto variante="pequenoForte" cor="marca">
                Reenviar
              </Texto>
            </Pressable>
            <Pressable accessibilityRole="button" hitSlop={8} onPress={aoDescartar}>
              <Texto variante="pequenoMedio" cor="conteudoSuave">
                Descartar
              </Texto>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: "row", justifyContent: "flex-end", paddingBottom: Espaco.tres, paddingHorizontal: Espaco.quatro },
  balao: { backgroundColor: Cores.mensagemEnviada, borderRadius: Raio.bloco, elevation: 1, gap: Espaco.um, maxWidth: "86%", padding: Espaco.um },
  moldura: { borderRadius: Raio.compacto, overflow: "hidden" },
  enviando: { opacity: 0.6 },
  legenda: { lineHeight: 20.3, paddingHorizontal: Espaco.dois },
  rodape: { alignSelf: "flex-end", fontWeight: "400", paddingHorizontal: Espaco.dois, paddingBottom: Espaco.um },
  falha: { alignItems: "center", flexDirection: "row", gap: Espaco.tres, justifyContent: "flex-end", paddingHorizontal: Espaco.dois, paddingBottom: Espaco.um },
});
