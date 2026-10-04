import type { IdentidadeOperavelRecebida } from "@jaa/contratos";
import { useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AvatarIdentidade } from "@/components/ui/avatar";
import { Icone } from "@/components/ui/icone";
import { Selo } from "@/components/ui/superficies";
import { Texto } from "@/components/ui/texto";
import { Cores, Espaco, Raio, SombraCartao } from "@/constants/theme";

/*
 * "AGINDO COMO" — o `SeletorIdentidade` da Web: seletor VISUAL (avatar + nome + @usuario), porque trocar
 * de identidade muda a caixa de entrada inteira e a pessoa precisa RECONHECER quem ela é agora.
 * Continua sendo apenas intenção de interface: quem autoriza cada chamada é o servidor.
 */
export function SeletorIdentidade({
  operaveis,
  ativa,
  aoSelecionar,
}: {
  operaveis: readonly IdentidadeOperavelRecebida[];
  ativa: IdentidadeOperavelRecebida | null;
  aoSelecionar: (identidadeId: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const { top } = useSafeAreaInsets();
  const pessoais = operaveis.filter((identidade) => identidade.tipo === "pessoal");
  const empresariais = operaveis.filter((identidade) => identidade.tipo === "empresarial");

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Agindo como ${ativa?.nomeExibicao ?? "—"}. Trocar identidade`}
        onPress={() => setAberto(true)}
        style={({ pressed }) => [estilos.botao, pressed && estilos.pressionado]}>
        {ativa && <AvatarIdentidade identidade={ativa} tamanho="pequeno" />}
        <View style={estilos.texto}>
          <Texto variante="mini" cor="conteudoSuave" style={estilos.rotulo}>
            Agindo como
          </Texto>
          <Texto variante="corpoMedio" numberOfLines={1}>
            {ativa?.nomeExibicao ?? "—"}
          </Texto>
        </View>
        <Icone nome="expandir" tamanho={18} />
      </Pressable>

      <Modal visible={aberto} transparent animationType="fade" onRequestClose={() => setAberto(false)} statusBarTranslucent>
        <Pressable accessibilityLabel="Fechar" style={estilos.fundo} onPress={() => setAberto(false)}>
          <View accessibilityRole="menu" accessibilityLabel="Escolher identidade" style={[estilos.menu, { marginTop: top + 60 }]}>
            <Grupo titulo="Pessoa" itens={pessoais} ativa={ativa} aoEscolher={escolher} />
            {empresariais.length > 0 && <Grupo titulo="Empresas" itens={empresariais} ativa={ativa} aoEscolher={escolher} />}
          </View>
        </Pressable>
      </Modal>
    </>
  );

  function escolher(identidadeId: string) {
    setAberto(false);
    aoSelecionar(identidadeId);
  }
}

function Grupo({
  titulo,
  itens,
  ativa,
  aoEscolher,
}: {
  titulo: string;
  itens: IdentidadeOperavelRecebida[];
  ativa: IdentidadeOperavelRecebida | null;
  aoEscolher: (identidadeId: string) => void;
}) {
  return (
    <View style={estilos.grupo}>
      <Texto variante="mini" cor="conteudoSuave" style={[estilos.rotulo, estilos.tituloGrupo]}>
        {titulo}
      </Texto>
      {itens.map((identidade) => {
        const selecionada = identidade.identidadeId === ativa?.identidadeId;
        return (
          <Pressable
            key={identidade.identidadeId}
            accessibilityRole="menuitem"
            accessibilityState={{ selected: selecionada }}
            onPress={() => aoEscolher(identidade.identidadeId)}
            style={({ pressed }) => [estilos.opcao, selecionada && estilos.opcaoSelecionada, pressed && estilos.pressionado]}>
            <AvatarIdentidade identidade={identidade} tamanho="pequeno" />
            <View style={estilos.texto}>
              <Texto variante="corpoMedio" numberOfLines={1}>
                {identidade.nomeExibicao}
              </Texto>
              <Texto variante="pequeno" cor="conteudoSuave" numberOfLines={1}>
                @{identidade.nomeUsuario}
              </Texto>
            </View>
            {selecionada && <Selo rotulo="Ativa" tom="marca" />}
          </Pressable>
        );
      })}
    </View>
  );
}

const estilos = StyleSheet.create({
  botao: {
    alignItems: "center",
    backgroundColor: Cores.superficie,
    borderColor: Cores.borda,
    borderRadius: Raio.compacto,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: Espaco.dois,
    minHeight: 44,
    paddingHorizontal: Espaco.dois,
  },
  pressionado: { backgroundColor: Cores.realce },
  texto: { flex: 1, minWidth: 0 },
  rotulo: { letterSpacing: 0.4, textTransform: "uppercase" },
  fundo: { backgroundColor: "rgba(35,44,45,0.25)", flex: 1 },
  menu: { backgroundColor: Cores.superficie, borderColor: Cores.borda, borderRadius: Raio.bloco, borderWidth: 1, marginHorizontal: Espaco.quatro, overflow: "hidden", ...SombraCartao },
  grupo: { borderBottomColor: Cores.borda, borderBottomWidth: StyleSheet.hairlineWidth },
  tituloGrupo: { fontWeight: "600", paddingHorizontal: Espaco.tres, paddingTop: Espaco.dois },
  opcao: { alignItems: "center", flexDirection: "row", gap: Espaco.dois, minHeight: 48, paddingHorizontal: Espaco.tres },
  opcaoSelecionada: { backgroundColor: Cores.marcaSuave },
});
