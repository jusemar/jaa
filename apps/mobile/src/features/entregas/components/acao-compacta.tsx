import { Pressable, StyleSheet } from "react-native";
import { Icone } from "@/components/ui/icone";
import { Texto } from "@/components/ui/texto";
import { Cores, Espaco, Raio } from "@/constants/theme";

type NomeIcone = Parameters<typeof Icone>[0]["nome"];

/**
 * Ação SECUNDÁRIA em formato de pílula (ícone + palavra): várias cabem numa linha, e nenhuma compete
 * com o botão principal do cartão. Alvo de toque de 40 px de altura, com folga em volta.
 */
export function AcaoCompacta({ rotulo, icone, descricao, ativa = false, desabilitada = false, aoTocar }: { rotulo: string; icone: NomeIcone; descricao?: string; ativa?: boolean; desabilitada?: boolean; aoTocar: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={descricao ?? rotulo}
      accessibilityState={{ disabled: desabilitada, selected: ativa }}
      disabled={desabilitada}
      hitSlop={4}
      onPress={aoTocar}
      style={({ pressed }) => [estilos.acao, ativa && estilos.ativa, (pressed || desabilitada) && estilos.apagada]}>
      <Icone nome={icone} tamanho={16} cor={ativa ? "marca" : "conteudo"} />
      <Texto variante="pequenoMedio" cor={ativa ? "marca" : "conteudo"}>
        {rotulo}
      </Texto>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  acao: { alignItems: "center", backgroundColor: Cores.superficie, borderColor: Cores.borda, borderRadius: Raio.total, borderWidth: 1, flexDirection: "row", gap: Espaco.um, minHeight: 40, paddingHorizontal: Espaco.tres },
  ativa: { backgroundColor: Cores.selecionadoFundo, borderColor: Cores.marca },
  apagada: { opacity: 0.5 },
});
