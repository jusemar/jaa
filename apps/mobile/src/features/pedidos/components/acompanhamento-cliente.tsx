import {
  EVENTO_PEDIDO_ACOMPANHAMENTO,
  EVENTO_PEDIDO_FILA,
  TEXTO_AVISO_ENTREGA_PROXIMA,
  eventoPedidoAcompanhamentoSchema,
  eventoPedidoFilaSchema,
  rotuloFila,
  rotuloUltimaPosicao,
  type AcompanhamentoPedido,
} from "@jaa/contratos";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Texto } from "@/components/ui/texto";
import { Cores, Raio } from "@/constants/theme";
import { obterClienteRealtime } from "@/lib/realtime/cliente-realtime";
import { obterAcompanhamentoDoPedido } from "../lib/api-acompanhamento";

/*
 * ACOMPANHAMENTO DO CLIENTE — o mesmo da Web: a posição na fila ("Você é o 3º na fila de entregas.") e
 * quem está com a entrega. Quem decide o que o cliente vê é o SERVIDOR: a tela não "esconde" nada.
 *
 * Diferença em relação à Web: lá, quando a entrega dele é a atual, aparece o mapa com o entregador.
 * O app ainda não tem mapa; aqui fica a situação e a idade da última posição, que já vêm no contrato.
 */
export function AcompanhamentoDoPedido({ pedidoId, aoConversarCom }: { pedidoId: string; aoConversarCom?: ((nomeUsuario: string) => void) | undefined }) {
  const [acompanhamento, setAcompanhamento] = useState<AcompanhamentoPedido | null>(null);

  // Busca o estado atual: é isto que resolve a RECONEXÃO, sem depender do último evento.
  useEffect(() => {
    let ativo = true;
    void obterAcompanhamentoDoPedido(pedidoId).then((resultado) => {
      if (ativo && resultado.ok) setAcompanhamento(resultado.dados);
    });
    return () => {
      ativo = false;
    };
  }, [pedidoId]);

  useEffect(() => {
    const socket = obterClienteRealtime();
    const aoAtualizar = (evento: unknown) => {
      const resultado = eventoPedidoAcompanhamentoSchema.safeParse(evento);
      // Só o próprio pedido: o servidor já filtra, e a tela confere de novo.
      if (resultado.success && resultado.data.pedidoId === pedidoId) setAcompanhamento(resultado.data.acompanhamento);
    };
    // A FILA muda sem posição de GPS nenhuma (entrega anterior concluída, cancelamento, reordenação).
    const aoMudarFila = (evento: unknown) => {
      const resultado = eventoPedidoFilaSchema.safeParse(evento);
      if (!resultado.success || resultado.data.pedidoId !== pedidoId) return;
      const fila = resultado.data;
      setAcompanhamento((atual) => ({
        fila,
        entregador: atual?.entregador ?? null,
        posicaoEntregador: fila.situacao === "indo_ate_voce" ? (atual?.posicaoEntregador ?? null) : null,
      }));
      // Relê o todo (entregador atual e, se for a vez dele, o ponto): o evento só avisa.
      void obterAcompanhamentoDoPedido(pedidoId).then((relido) => {
        if (relido.ok) setAcompanhamento(relido.dados);
      });
    };
    socket.on(EVENTO_PEDIDO_ACOMPANHAMENTO, aoAtualizar);
    socket.on(EVENTO_PEDIDO_FILA, aoMudarFila);
    return () => {
      socket.off(EVENTO_PEDIDO_ACOMPANHAMENTO, aoAtualizar);
      socket.off(EVENTO_PEDIDO_FILA, aoMudarFila);
    };
  }, [pedidoId]);

  if (!acompanhamento) return null;
  const { fila, posicaoEntregador, entregador } = acompanhamento;
  const mostraFila = fila.situacao !== "sem_saida" && fila.situacao !== "encerrado";
  const indoAteVoce = fila.situacao === "indo_ate_voce";

  return (
    <View style={estilos.bloco}>
      {mostraFila && (
        <>
          <Texto variante={indoAteVoce ? "pequenoForte" : "pequeno"} cor={indoAteVoce ? "marca" : "conteudoSuave"}>
            {rotuloFila(fila)}
          </Texto>
          {indoAteVoce && <Texto variante="pequeno">{TEXTO_AVISO_ENTREGA_PROXIMA.orientacao}</Texto>}
          {indoAteVoce && (
            <Texto variante="pequeno" cor="conteudoSuave">
              {posicaoEntregador ? rotuloUltimaPosicao({ capturadaEm: posicaoEntregador.capturadaEm }) : "Localização temporariamente indisponível"}
            </Texto>
          )}
        </>
      )}
      {/* QUEM ESTÁ COM A ENTREGA: identidade pública do Jaa. "Conversar" abre a conversa direta de sempre. */}
      {entregador && fila.situacao !== "encerrado" && (
        <View style={estilos.entregador}>
          <Texto variante="pequeno" cor="conteudoSuave" style={estilos.flex}>
            Entregador: <Texto variante="pequenoForte">{entregador.nomeExibicao}</Texto> @{entregador.nomeUsuario}
          </Texto>
          {aoConversarCom && (
            <Pressable accessibilityRole="button" onPress={() => aoConversarCom(entregador.nomeUsuario)} style={estilos.conversar}>
              <Texto variante="mini" cor="marca" style={estilos.medio}>
                Conversar
              </Texto>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  bloco: { gap: 2 },
  flex: { flexShrink: 1 },
  entregador: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 8 },
  conversar: { borderColor: Cores.borda, borderRadius: Raio.total, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2 },
  medio: { fontWeight: "500" },
});
