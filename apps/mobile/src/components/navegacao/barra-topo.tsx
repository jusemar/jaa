import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Botao } from "@/components/ui/botao";
import { Icone } from "@/components/ui/icone";
import { Texto } from "@/components/ui/texto";
import { Cores, Espaco } from "@/constants/theme";
import { useSairDaConta } from "@/features/conta/hooks/use-sair-da-conta";
import { SeletorIdentidade } from "@/features/identidades/components/seletor-identidade";
import { useIdentidadeAtiva } from "@/features/identidades/components/provedor-identidade-ativa";

/*
 * BARRA DO TOPO das áreas do app — a mesma da Web no celular: a marca (círculo jade com o ícone de
 * conversa), a identidade atuante ("Agindo como") e "Sair". Some quando uma conversa toma a tela.
 */
export function BarraTopo() {
  const { top } = useSafeAreaInsets();
  const { operaveis, ativa, erro, selecionar } = useIdentidadeAtiva();
  const { saindo, sair } = useSairDaConta();

  return (
    <View style={[estilos.barra, { paddingTop: Math.max(top, Espaco.tres) }]}>
      <View style={estilos.linha}>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={estilos.marca}>
          <Icone nome="conversa" cor="marcaConteudo" />
        </View>
        <SeletorIdentidade operaveis={operaveis} ativa={ativa} aoSelecionar={(identidadeId) => void selecionar(identidadeId)} />
        <Botao aparencia="discreto" compacto rotulo={saindo ? "Saindo…" : "Sair"} accessibilityLabel="Sair da conta" disabled={saindo} onPress={sair} />
      </View>
      {ativa?.tipo === "empresarial" && (
        <Texto variante="mini" cor="aviso">
          Você responde como {ativa.nomeExibicao}. Suas conversas pessoais não aparecem aqui.
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
  barra: { backgroundColor: Cores.superficie, borderBottomColor: Cores.borda, borderBottomWidth: 1, gap: Espaco.um, paddingBottom: Espaco.tres, paddingHorizontal: Espaco.quatro },
  linha: { alignItems: "center", flexDirection: "row", gap: 10 },
  marca: { alignItems: "center", backgroundColor: Cores.marca, borderRadius: 18, height: 36, justifyContent: "center", width: 36 },
});
