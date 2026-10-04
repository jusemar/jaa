import { Image } from "expo-image";
import { Pressable, StyleSheet, View } from "react-native";
import { Icone } from "@/components/ui/icone";
import { Texto } from "@/components/ui/texto";
import { Cores, Raio } from "@/constants/theme";
import { espacoDaImagem } from "../lib/imagem-conversa";
import type { EstadoImagem } from "../lib/urls-imagens";

/*
 * IMAGEM dentro do balão. O espaço é reservado pela proporção real do anexo (largura × altura vêm da
 * API), então o balão nasce do tamanho certo e a conversa não "pula" quando a imagem carrega.
 *
 * A URL é privada e temporária: vem do cache em memória da conversa, nunca da mensagem. Por isso o
 * `cachePolicy="memory"` — nem a URL nem a imagem privada ficam gravadas no aparelho.
 */
export function ImagemMensagem({
  anexo,
  estado,
  larguraMaxima,
  descricao,
  aoAbrir,
  aoFalhar,
  aoCarregar,
  aoPedirAcoes,
}: {
  anexo: { largura: number; altura: number };
  estado: EstadoImagem;
  larguraMaxima: number;
  descricao: string;
  aoAbrir?: ((url: string) => void) | undefined;
  aoFalhar?: (() => void) | undefined;
  aoCarregar?: (() => void) | undefined;
  // O toque longo na foto abre o mesmo menu do balão.
  aoPedirAcoes?: (() => void) | undefined;
}) {
  const espaco = espacoDaImagem(anexo.largura, anexo.altura, larguraMaxima);
  const tamanho = { width: espaco.largura, height: espaco.altura };

  if (estado.situacao === "pronta") {
    const url = estado.url;
    return (
      <Pressable
        accessibilityRole="imagebutton"
        accessibilityLabel={`Ampliar ${descricao}`}
        onPress={aoAbrir ? () => aoAbrir(url) : undefined}
        onLongPress={aoPedirAcoes}
        delayLongPress={350}
        style={[estilos.moldura, tamanho]}>
        <Image source={{ uri: url }} style={tamanho} contentFit="cover" cachePolicy="memory" transition={120} onError={aoFalhar} onLoad={aoCarregar} />
      </Pressable>
    );
  }

  return (
    <View
      accessibilityLabel={estado.situacao === "indisponivel" ? "Imagem indisponível" : "Carregando imagem"}
      style={[estilos.moldura, estilos.marcador, tamanho]}>
      <Icone nome="imagem" tamanho={22} />
      {estado.situacao === "indisponivel" && (
        <Texto variante="pequeno" cor="conteudoSuave">
          Imagem indisponível
        </Texto>
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  moldura: { borderRadius: Raio.compacto, overflow: "hidden" },
  marcador: { alignItems: "center", backgroundColor: Cores.superficieSuave, gap: 4, justifyContent: "center" },
});
