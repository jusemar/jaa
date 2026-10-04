import { Modal, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Cores, Espaco, Raio } from "@/constants/theme";
import { Icone, type NomeIcone } from "./icone";
import { Texto } from "./texto";

/*
 * Menu de ações em FOLHA INFERIOR — o equivalente de toque dos menus "⋯" da Web (mensagem, conversa).
 * Só aparecem as ações permitidas; quem autoriza cada uma continua sendo a API.
 */
export type AcaoMenu = { rotulo: string; executar: () => void; perigosa?: boolean; icone?: NomeIcone };

export function MenuAcoes({ titulo, acoes, aberto, aoFechar }: { titulo?: string | undefined; acoes: AcaoMenu[]; aberto: boolean; aoFechar: () => void }) {
  const { bottom } = useSafeAreaInsets();
  return (
    <Modal visible={aberto} transparent animationType="fade" onRequestClose={aoFechar} statusBarTranslucent>
      <Pressable accessibilityLabel="Fechar menu" style={estilos.fundo} onPress={aoFechar}>
        <View accessibilityRole="menu" style={[estilos.folha, { paddingBottom: Math.max(bottom, Espaco.tres) }]}>
          {titulo && (
            <Texto variante="pequeno" cor="conteudoSuave" numberOfLines={1} style={estilos.titulo}>
              {titulo}
            </Texto>
          )}
          {acoes.map((acao) => (
            <Pressable
              key={acao.rotulo}
              accessibilityRole="menuitem"
              onPress={() => {
                aoFechar();
                acao.executar();
              }}
              style={({ pressed }) => [estilos.item, pressed && estilos.pressionado]}>
              {acao.icone && <Icone nome={acao.icone} tamanho={18} cor={acao.perigosa ? "perigo" : "conteudo"} />}
              <Texto cor={acao.perigosa ? "perigo" : "conteudo"}>{acao.rotulo}</Texto>
            </Pressable>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}

const estilos = StyleSheet.create({
  fundo: { backgroundColor: "rgba(35,44,45,0.4)", flex: 1, justifyContent: "flex-end" },
  folha: { backgroundColor: Cores.superficie, borderTopLeftRadius: Raio.bloco * 2, borderTopRightRadius: Raio.bloco * 2, paddingTop: Espaco.dois },
  titulo: { paddingHorizontal: Espaco.quatro, paddingVertical: Espaco.dois },
  item: { alignItems: "center", flexDirection: "row", gap: Espaco.tres, minHeight: 48, paddingHorizontal: Espaco.quatro },
  pressionado: { backgroundColor: Cores.superficieSuave },
});
