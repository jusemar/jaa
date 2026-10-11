import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Tela } from "@/components/ui/tela";
import { Texto } from "@/components/ui/texto";
import { Cores, Espaco, Raio } from "@/constants/theme";
import { AbaEntregadores } from "./aba-entregadores";
import { AbaOperacao } from "./aba-operacao";
import { AbaZonas } from "./aba-zonas";

/*
 * LOGÍSTICA DA EMPRESA no app — a mesma área da Web (`area-logistica-empresa.tsx`), com as mesmas três
 * subáreas, uma de cada vez: Operação · Entregadores · Zonas e automação. Tudo pelas mesmas rotas e
 * eventos; nenhuma regra mora aqui.
 */
const ABAS = [
  { id: "operacao", rotulo: "Operação" },
  { id: "entregadores", rotulo: "Entregadores" },
  { id: "zonas", rotulo: "Zonas e automação" },
] as const;

type AbaLogistica = (typeof ABAS)[number]["id"];

export function TelaLogisticaEmpresa({ empresaId, nomeEmpresa, aoAbrirConversa }: { empresaId: string; nomeEmpresa: string; aoAbrirConversa: (nomeUsuario: string) => void }) {
  const [aba, setAba] = useState<AbaLogistica>("operacao");
  // "Puxar para atualizar": a subárea aberta relê tudo do servidor.
  const [atualizacao, setAtualizacao] = useState(0);
  const [atualizando, setAtualizando] = useState(false);

  return (
    <Tela
      atualizando={atualizando}
      aoAtualizar={() => {
        setAtualizando(true);
        setAtualizacao((atual) => atual + 1);
        setTimeout(() => setAtualizando(false), 600);
      }}>
      <View accessibilityRole="tablist" accessibilityLabel="Áreas da logística" style={estilos.abas}>
        {ABAS.map((item) => {
          const marcada = aba === item.id;
          return (
            <Pressable key={item.id} accessibilityRole="tab" accessibilityState={{ selected: marcada }} onPress={() => setAba(item.id)} style={[estilos.aba, marcada && estilos.abaMarcada]}>
              <Texto variante="pequenoMedio" cor={marcada ? "marca" : "conteudoSuave"} style={estilos.centro}>
                {item.rotulo}
              </Texto>
            </Pressable>
          );
        })}
      </View>

      {aba === "operacao" && <AbaOperacao empresaId={empresaId} nomeEmpresa={nomeEmpresa} atualizacao={atualizacao} aoAbrirConversa={aoAbrirConversa} />}
      {aba === "entregadores" && <AbaEntregadores key={atualizacao} empresaId={empresaId} nomeEmpresa={nomeEmpresa} />}
      {aba === "zonas" && <AbaZonas empresaId={empresaId} nomeEmpresa={nomeEmpresa} atualizacao={atualizacao} />}
    </Tela>
  );
}

const estilos = StyleSheet.create({
  abas: { backgroundColor: Cores.superficieSuave, borderRadius: Raio.bloco, flexDirection: "row", gap: Espaco.um, padding: Espaco.um },
  aba: { alignItems: "center", borderRadius: Raio.compacto, flex: 1, justifyContent: "center", minHeight: 40, paddingHorizontal: Espaco.um },
  abaMarcada: { backgroundColor: Cores.superficie },
  centro: { textAlign: "center" },
});
