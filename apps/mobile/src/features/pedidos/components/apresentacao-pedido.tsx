import { ROTULO_STATUS_PEDIDO_CLIENTE, montarTimelineAcompanhamento, type Pedido } from "@jaa/contratos";
import { StyleSheet, View } from "react-native";
import { Icone } from "@/components/ui/icone";
import { Texto } from "@/components/ui/texto";
import { Cores, Espaco } from "@/constants/theme";
import { formatarHorarioMensagem } from "@/features/conversas/lib/horarios";

/* Linha do tempo do PEDIDO para o cliente — usada pelo acompanhamento dentro da conversa (`pedido-na-conversa.tsx`). */

/*
 * Linha do tempo em trilho vertical: cada etapa é um ponto ligado ao seguinte. Concluída = ponto cheio
 * com o ✓ e a hora real; ATUAL = ponto maior com anel e texto em destaque; futura = ponto vazio e
 * texto apagado. As etapas vêm da máquina de estados real (`montarTimelinePedido`), nunca da tela.
 */
export function TimelinePedido({ pedido }: { pedido: Pick<Pedido, "status" | "historico"> }) {
  // Sem o histórico ainda (detalhe carregando), as etapas saem do status atual, sem horário inventado.
  const etapas = montarTimelineAcompanhamento(pedido.status, pedido.historico);
  const rotulos = ROTULO_STATUS_PEDIDO_CLIENTE;
  return (
    <View accessibilityLabel="Acompanhamento do pedido">
      {etapas.map((etapa, indice) => {
        const ultima = indice === etapas.length - 1;
        const cancelado = etapa.status === "cancelado";
        const situacao = etapa.situacao === "concluida" ? "concluída" : etapa.situacao === "atual" ? "etapa atual" : "próxima etapa";
        return (
          <View key={etapa.status} accessible accessibilityLabel={`${rotulos[etapa.status]}, ${situacao}`} style={estilos.etapa}>
            <View style={estilos.trilho}>
              <View style={[estilos.ponto, etapa.situacao === "concluida" && estilos.pontoConcluido, etapa.situacao === "atual" && (cancelado ? estilos.pontoCancelado : estilos.pontoAtual)]}>
                {etapa.situacao === "concluida" && <Icone nome="check" tamanho={16} cor="marcaConteudo" />}
                {etapa.situacao === "atual" && <View style={estilos.miolo} />}
              </View>
              {!ultima && <View style={[estilos.ligacao, etapa.situacao === "concluida" && estilos.ligacaoConcluida]} />}
            </View>
            <View style={[estilos.textoDaEtapa, !ultima && estilos.espacoDaEtapa]}>
              <Texto variante={etapa.situacao === "atual" ? "subtitulo" : etapa.situacao === "concluida" ? "corpoMedio" : "corpo"} cor={etapa.situacao === "futura" ? "conteudoSuave" : etapa.situacao === "atual" && cancelado ? "perigo" : "conteudo"}>
                {rotulos[etapa.status]}
              </Texto>
              {etapa.ocorridoEm && (
                <Texto variante="pequeno" cor="conteudoSuave">
                  {formatarHorarioMensagem(etapa.ocorridoEm)}
                </Texto>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

// O marcador tem largura fixa e o texto quebra ao lado dele: o alinhamento não se desfaz em tela estreita.
const MARCADOR = 28;

const estilos = StyleSheet.create({
  etapa: { flexDirection: "row", gap: Espaco.tres },
  trilho: { alignItems: "center", width: MARCADOR },
  ponto: { alignItems: "center", backgroundColor: Cores.superficie, borderColor: Cores.borda, borderRadius: MARCADOR / 2, borderWidth: 2, height: MARCADOR, justifyContent: "center", width: MARCADOR },
  pontoConcluido: { backgroundColor: Cores.marca, borderColor: Cores.marca },
  // ATUAL: o anel claro em volta é a borda; o miolo branco marca "é aqui".
  pontoAtual: { backgroundColor: Cores.marca, borderColor: Cores.marcaSuave, borderWidth: 4 },
  pontoCancelado: { backgroundColor: Cores.perigo, borderColor: Cores.perigoSuave, borderWidth: 4 },
  miolo: { backgroundColor: Cores.superficie, borderRadius: 4, height: 8, width: 8 },
  ligacao: { backgroundColor: Cores.borda, borderRadius: 1, flex: 1, marginVertical: Espaco.um, minHeight: 12, width: 2 },
  ligacaoConcluida: { backgroundColor: Cores.marca },
  textoDaEtapa: { flex: 1, justifyContent: "center", minHeight: MARCADOR, minWidth: 0 },
  espacoDaEtapa: { paddingBottom: Espaco.quatro },
});
