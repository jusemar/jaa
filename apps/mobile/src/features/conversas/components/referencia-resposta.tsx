import { StyleSheet, View } from "react-native";
import { Texto } from "@/components/ui/texto";
import { Cores } from "@/constants/theme";
import { textoDaPrevia } from "../lib/respostas";

/*
 * Referência compacta à mensagem respondida (autor + trecho), usada dentro do balão e acima do
 * compositor. A prévia é limitada a duas linhas e nunca alarga o layout.
 *
 * Como na Web: texto citado sempre ESCURO e legível, nome com o destaque da marca, barra lateral e um
 * fundo só levemente diferente do balão (no balão próprio, verde claro, um tom mais escuro).
 */
export function ReferenciaResposta({
  nomeAutor,
  previaConteudo,
  conteudoTruncado,
  excluida = false,
  emBalaoProprio = false,
}: {
  emBalaoProprio?: boolean;
  nomeAutor: string;
  previaConteudo: string;
  conteudoTruncado: boolean;
  excluida?: boolean;
}) {
  return (
    <View style={[estilos.bloco, emBalaoProprio && estilos.blocoProprio]}>
      <Texto variante="pequenoForte" cor="marca" numberOfLines={1} style={estilos.autor}>
        {nomeAutor}
      </Texto>
      <Texto variante="pequeno" cor={emBalaoProprio ? "mensagemEnviadaConteudo" : "conteudoSuave"} numberOfLines={2} style={[emBalaoProprio && estilos.citadoProprio, excluida && estilos.italico]}>
        {excluida ? "Mensagem excluída" : textoDaPrevia({ previaConteudo, conteudoTruncado })}
      </Texto>
    </View>
  );
}

const estilos = StyleSheet.create({
  bloco: { backgroundColor: "rgba(0,157,114,0.07)", borderLeftColor: Cores.marca, borderLeftWidth: 2, borderRadius: 3, paddingHorizontal: 8, paddingVertical: 4 },
  // `bg-mensagem-enviada-conteudo/[0.08]` da Web.
  blocoProprio: { backgroundColor: "rgba(29,40,34,0.08)" },
  autor: { fontWeight: "600" },
  citadoProprio: { opacity: 0.8 },
  italico: { fontStyle: "italic" },
});
