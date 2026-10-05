import type { FuncionamentoPublico } from "@jaa/contratos";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Icone } from "@/components/ui/icone";
import { Texto } from "@/components/ui/texto";
import { Cores, Espaco, Raio } from "@/constants/theme";
import { selo, semanaDeFuncionamento } from "../lib/funcionamento";

/*
 * ABERTA OU FECHADA no topo do cardápio: uma linha ("Aberto agora · até 23:00" / "Fechado · abre
 * amanhã às 08:00") e, a um toque, os horários da semana. Ocupa pouco e não esconde os produtos.
 *
 * Os textos vêm prontos do servidor. Empresa que não controla horário não mostra nada.
 */
export function FuncionamentoDaEmpresa({ funcionamento }: { funcionamento: FuncionamentoPublico }) {
  const [semanaAberta, setSemanaAberta] = useState(false);
  const estado = selo(funcionamento);
  if (!estado) return null;
  const cor = estado.aberto ? "marca" : "aviso";

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: semanaAberta }}
        accessibilityLabel={`${estado.texto}. ${semanaAberta ? "Ocultar" : "Ver"} horários da semana`}
        onPress={() => setSemanaAberta((aberta) => !aberta)}
        style={({ pressed }) => [estilos.linha, pressed && estilos.pressionado]}>
        {/* Cor nunca é a única pista: o texto diz "Aberto"/"Fechado". */}
        <View style={[estilos.ponto, { backgroundColor: Cores[cor] }]} />
        <Texto variante="pequenoMedio" cor={cor} style={estilos.flex}>
          {estado.texto}
        </Texto>
        <Texto variante="mini" cor="conteudoSuave">
          Horários
        </Texto>
        <View style={semanaAberta && estilos.virado}>
          <Icone nome="expandir" tamanho={16} />
        </View>
      </Pressable>

      {semanaAberta && (
        <View accessibilityLabel="Horários de funcionamento" style={estilos.semana}>
          {semanaDeFuncionamento(funcionamento).map((linha) => (
            <View key={linha.dia} style={[estilos.dia, linha.hoje && estilos.hoje]}>
              <Texto variante={linha.hoje ? "pequenoMedio" : "pequeno"}>
                {linha.rotulo}
                {linha.hoje ? " · hoje" : ""}
              </Texto>
              <Texto variante={linha.hoje ? "pequenoMedio" : "pequeno"} cor={linha.fechado ? "conteudoSuave" : "conteudo"} style={estilos.horarios}>
                {linha.horarios}
              </Texto>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1 },
  // 44 de altura: alvo de toque confortável, sem crescer o cabeçalho além de uma linha.
  linha: { alignItems: "center", flexDirection: "row", gap: Espaco.dois, minHeight: 44 },
  pressionado: { opacity: 0.7 },
  ponto: { borderRadius: 4, height: 8, width: 8 },
  virado: { transform: [{ rotate: "180deg" }] },
  semana: { borderTopColor: Cores.borda, borderTopWidth: StyleSheet.hairlineWidth, gap: 2, paddingTop: Espaco.dois },
  dia: { borderRadius: Raio.compacto, flexDirection: "row", gap: Espaco.tres, justifyContent: "space-between", paddingHorizontal: Espaco.dois, paddingVertical: 6 },
  hoje: { backgroundColor: Cores.superficieSuave },
  horarios: { flexShrink: 1, textAlign: "right" },
});
