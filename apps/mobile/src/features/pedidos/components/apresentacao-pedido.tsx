import {
  ROTULO_PAGAMENTO_ENTREGA,
  ROTULO_STATUS_PEDIDO,
  ROTULO_STATUS_PEDIDO_CLIENTE,
  formatarCep,
  formatarEnderecoResumido,
  montarTimelinePedido,
  trocoEsperadoCentavos,
  type DestinoPedido,
  type Pedido,
  type ResumoPedido,
} from "@jaa/contratos";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Icone } from "@/components/ui/icone";
import { Cartao } from "@/components/ui/superficies";
import { Texto } from "@/components/ui/texto";
import { Cores, Espaco, Raio } from "@/constants/theme";
import { formatarHorarioMensagem } from "@/features/conversas/lib/horarios";
import { formatarPrecoCentavos } from "@/features/produtos/lib/precos";

/* Apresentação do PEDIDO — os mesmos blocos da Web: card na conversa, valores, pagamento, endereço e timeline. */

function LinhaPagamento({ pedido }: { pedido: Pick<Pedido, "formaPagamentoNaEntrega" | "trocoParaCentavos" | "totalCentavos"> }) {
  const troco = trocoEsperadoCentavos(pedido);
  return (
    <>
      <Texto variante="pequeno">Pagamento: {ROTULO_PAGAMENTO_ENTREGA[pedido.formaPagamentoNaEntrega]}</Texto>
      {pedido.trocoParaCentavos !== null && (
        <Texto variante="pequeno">
          Troco para: {formatarPrecoCentavos(pedido.trocoParaCentavos)}
          {troco !== null && troco > 0 && (
            <Texto variante="pequeno" cor="conteudoSuave">
              {" "}
              (levar {formatarPrecoCentavos(troco)} de troco)
            </Texto>
          )}
        </Texto>
      )}
    </>
  );
}

function ValoresPedido({ pedido }: { pedido: Pick<ResumoPedido, "subtotalCentavos" | "freteFinalCentavos"> }) {
  return (
    <View>
      <View style={estilos.linhaValor}>
        <Texto variante="pequeno" cor="conteudoSuave">
          Subtotal
        </Texto>
        <Texto variante="pequeno" cor="conteudoSuave">
          {formatarPrecoCentavos(pedido.subtotalCentavos)}
        </Texto>
      </View>
      <View style={estilos.linhaValor}>
        <Texto variante="pequeno" cor="conteudoSuave">
          Taxa de entrega
        </Texto>
        <Texto variante="pequeno" cor="conteudoSuave">
          {pedido.freteFinalCentavos === 0 ? "Grátis" : formatarPrecoCentavos(pedido.freteFinalCentavos)}
        </Texto>
      </View>
    </View>
  );
}

/** Card do pedido dentro do balão: lê o Pedido real (resumo), não uma cópia em texto. */
export function CardPedido({ pedido, aoAbrir, visaoCliente = false }: { pedido: ResumoPedido; aoAbrir: (pedidoId: string) => void; visaoCliente?: boolean }) {
  const rotulos = visaoCliente ? ROTULO_STATUS_PEDIDO_CLIENTE : ROTULO_STATUS_PEDIDO;
  return (
    <View style={estilos.card}>
      <View style={estilos.tituloCard}>
        <Icone nome="pedidos" tamanho={16} cor="marca" />
        <Texto variante="pequenoForte" cor="marca">
          Pedido #{pedido.numero}
        </Texto>
      </View>
      <View>
        {pedido.itens.map((item, indice) => (
          <View key={`${item.nomeProduto}-${indice}`}>
            <Texto variante="pequeno">
              {item.quantidade}× {item.nomeProduto} — {formatarPrecoCentavos(item.subtotalCentavos)}
            </Texto>
            {/* Resumo da montagem escolhida: o snapshot do pedido, não o cardápio de hoje. */}
            {item.escolhas.length > 0 && (
              <Texto variante="pequeno" cor="conteudoSuave">
                {item.escolhas.join(" · ")}
              </Texto>
            )}
            {item.observacao && (
              <Texto variante="pequeno" cor="conteudoSuave" style={estilos.italico}>
                “{item.observacao}”
              </Texto>
            )}
          </View>
        ))}
      </View>
      <ValoresPedido pedido={pedido} />
      <Texto variante="corpoForte">Total: {formatarPrecoCentavos(pedido.totalCentavos)}</Texto>
      <LinhaPagamento pedido={pedido} />
      <Texto variante="pequeno" cor="conteudoSuave">
        Status: {rotulos[pedido.status]}
      </Texto>
      <Pressable accessibilityRole="button" onPress={() => aoAbrir(pedido.id)} style={({ pressed }) => [estilos.verPedido, pressed && estilos.pressionado]}>
        <Texto variante="pequenoMedio" cor="marcaSuaveConteudo">
          Ver pedido
        </Texto>
        <Icone nome="seta" tamanho={14} cor="marcaSuaveConteudo" />
      </Pressable>
    </View>
  );
}

export function TimelinePedido({ pedido, visaoCliente = false }: { pedido: Pick<Pedido, "status" | "historico">; visaoCliente?: boolean }) {
  const etapas = montarTimelinePedido(pedido.status, pedido.historico);
  const marca = { concluida: "✓", atual: "●", futura: "○" } as const;
  const rotulos = visaoCliente ? ROTULO_STATUS_PEDIDO_CLIENTE : ROTULO_STATUS_PEDIDO;
  return (
    <View accessibilityLabel="Acompanhamento do pedido" style={estilos.timeline}>
      {etapas.map((etapa) => (
        <Texto key={etapa.status} variante={etapa.situacao === "atual" ? "pequenoForte" : "pequeno"} cor={etapa.situacao === "futura" ? "conteudoSuave" : "conteudo"}>
          {marca[etapa.situacao]} {rotulos[etapa.status]}
          {etapa.ocorridoEm && (
            <Texto variante="pequeno" cor="conteudoSuave">
              {" "}
              — {formatarHorarioMensagem(etapa.ocorridoEm)}
            </Texto>
          )}
        </Texto>
      ))}
    </View>
  );
}

export function EnderecoDoPedido({ destino }: { destino: DestinoPedido | null }) {
  if (!destino) {
    return (
      <Texto variante="pequeno" cor="conteudoSuave">
        Este pedido é anterior ao ponto de entrega confirmado.
      </Texto>
    );
  }
  return (
    <View style={estilos.timeline}>
      <Texto variante="pequenoMedio">Entregar em</Texto>
      <Texto variante="pequeno">{formatarEnderecoResumido(destino)}</Texto>
      <Texto variante="pequeno" cor="conteudoSuave">
        {destino.bairro}, {destino.cidade}/{destino.uf} · CEP {formatarCep(destino.cep)}
      </Texto>
      {destino.pontoReferencia && (
        <Texto variante="pequeno" cor="conteudoSuave">
          Referência: {destino.pontoReferencia}
        </Texto>
      )}
      <View style={estilos.tituloCard}>
        <Icone nome="local" tamanho={14} cor="marca" />
        <Texto variante="pequeno" cor="marca">
          Ponto de entrega confirmado
        </Texto>
      </View>
    </View>
  );
}

export function DetalhePedido({ pedido, aoFechar, acoes, visaoCliente = false }: { pedido: Pedido; aoFechar: () => void; acoes?: ReactNode; visaoCliente?: boolean }) {
  const rotulos = visaoCliente ? ROTULO_STATUS_PEDIDO_CLIENTE : ROTULO_STATUS_PEDIDO;
  return (
    <Cartao accessibilityLabel="Detalhe do pedido" style={estilos.detalhe}>
      <Pressable accessibilityRole="button" accessibilityLabel="Fechar pedido" onPress={aoFechar} style={({ pressed }) => [estilos.fechar, pressed && estilos.pressionado]}>
        <Icone nome="fechar" tamanho={16} />
      </Pressable>
      <Texto variante="subtitulo">
        Pedido #{pedido.numero} — {pedido.empresa.nome}
      </Texto>
      <Texto variante="pequeno" cor="conteudoSuave">
        Cliente: {pedido.cliente.nomeExibicao}
      </Texto>
      <View accessibilityLabel="Itens do pedido" style={estilos.timeline}>
        {pedido.itens.map((item) => (
          <View key={item.id}>
            <Texto variante="pequeno">
              {item.quantidade}× {item.nomeProduto} — {formatarPrecoCentavos(item.precoUnitarioCentavos)} cada = {formatarPrecoCentavos(item.subtotalCentavos)}
            </Texto>
            {item.observacao && (
              <Texto variante="pequeno" cor="conteudoSuave" style={[estilos.recuo, estilos.italico]}>
                Observação: {item.observacao}
              </Texto>
            )}
            {item.escolhas.map((escolha, indice) => (
              <Texto key={`${escolha.grupoNome}-${escolha.opcaoNome}-${indice}`} variante="pequeno" cor="conteudoSuave" style={estilos.recuo}>
                {escolha.grupoNome}: {escolha.opcaoNome}
                {escolha.precoAdicionalCentavos > 0 && ` (+${formatarPrecoCentavos(escolha.precoAdicionalCentavos)})`}
              </Texto>
            ))}
          </View>
        ))}
      </View>
      <ValoresPedido pedido={pedido} />
      <Texto variante="subtitulo">Total: {formatarPrecoCentavos(pedido.totalCentavos)}</Texto>
      <EnderecoDoPedido destino={pedido.destino} />
      <LinhaPagamento pedido={pedido} />
      <Texto>Status: {rotulos[pedido.status]}</Texto>
      {pedido.motivoCancelamento && (
        <Texto variante="pequeno" cor="perigo">
          Motivo do cancelamento: {pedido.motivoCancelamento}
        </Texto>
      )}
      <TimelinePedido pedido={pedido} visaoCliente={visaoCliente} />
      {acoes}
    </Cartao>
  );
}

const estilos = StyleSheet.create({
  card: { backgroundColor: Cores.mensagemRecebida, borderColor: Cores.borda, borderRadius: Raio.compacto, borderWidth: 1, gap: 6, minWidth: 220, padding: Espaco.tres },
  tituloCard: { alignItems: "center", flexDirection: "row", gap: 6 },
  linhaValor: { flexDirection: "row", gap: Espaco.tres, justifyContent: "space-between" },
  italico: { fontStyle: "italic" },
  verPedido: { alignItems: "center", backgroundColor: Cores.marcaSuave, borderRadius: Raio.compacto, flexDirection: "row", gap: 6, justifyContent: "center", minHeight: 36, paddingHorizontal: Espaco.tres },
  pressionado: { opacity: 0.8 },
  timeline: { gap: 2 },
  detalhe: { gap: 6, padding: Espaco.quatro },
  fechar: { alignItems: "center", alignSelf: "flex-end", borderRadius: Raio.compacto, height: 36, justifyContent: "center", width: 36 },
  recuo: { marginLeft: Espaco.quatro },
});
