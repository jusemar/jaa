import {
  EXPLICACAO_STATUS_PEDIDO_CLIENTE,
  ROTULO_PAGAMENTO_ENTREGA,
  ROTULO_STATUS_PEDIDO_CLIENTE,
  formatarCep,
  formatarEnderecoResumido,
  statusPedidoTerminal,
  trocoEsperadoCentavos,
  type Pedido,
  type ResumoPedido,
} from "@jaa/contratos";
import { useEffect, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Icone, type NomeIcone } from "@/components/ui/icone";
import { Texto } from "@/components/ui/texto";
import { ALTURA_TOQUE, Cores, Espaco, Raio } from "@/constants/theme";
import { formatarPrecoCentavos } from "@/features/produtos/lib/precos";
import { obterPedido } from "../lib/api-pedidos";
import {
  alternarExibicao,
  apresentacaoDoPedido,
  dataDoPedido,
  horaDoPedido,
  principaisItens,
  rotuloCompacto,
  rotuloDeItens,
  totalDeItens,
  type EscolhaDeExibicao,
} from "../lib/pedido-na-conversa";
import { AcompanhamentoDoPedido } from "./acompanhamento-cliente";
import { TimelinePedido } from "./apresentacao-pedido";

/*
 * O PEDIDO DO CLIENTE DENTRO DA CONVERSA (regras em `lib/pedido-na-conversa.ts`, iguais às da Web).
 * A mensagem de pedido não é um balão: é o próprio acompanhamento, na largura da conversa, em uma
 * coluna — status, linha do tempo, resumo, itens que abrem ali mesmo, endereço e a entrega (fila,
 * entregador e mapa quando é a vez dele). Finalizado, vira uma linha compacta com "Ver detalhes".
 * Nenhuma outra tela: tudo acontece no lugar da mensagem.
 */

function Cartao({ titulo, icone, acao, children }: { titulo: string; icone: NomeIcone; acao?: ReactNode; children?: ReactNode }) {
  return (
    <View style={estilos.cartao}>
      <View style={estilos.tituloDoCartao}>
        <View style={estilos.iconeDoCartao}>
          <Icone nome={icone} tamanho={16} cor="marca" />
        </View>
        <Texto variante="corpoForte" style={estilos.flex}>
          {titulo}
        </Texto>
        {acao}
      </View>
      {children}
    </View>
  );
}

// Rótulo à esquerda e valor à direita; em largura apertada o valor desce de linha, nunca sai do cartão.
function LinhaDeValor({ rotulo, valor, forte = false, icone }: { rotulo: string; valor: string; forte?: boolean; icone?: NomeIcone }) {
  return (
    <View style={estilos.linhaDeValor}>
      <View style={estilos.rotuloComIcone}>
        {icone && <Icone nome={icone} tamanho={16} />}
        <Texto variante={forte ? "titulo" : "corpo"} cor={forte ? "conteudo" : "conteudoSuave"}>
          {rotulo}
        </Texto>
      </View>
      <Texto variante={forte ? "titulo" : "corpo"} style={estilos.valor}>
        {valor}
      </Texto>
    </View>
  );
}

function ResumoDoPedido({ resumo }: { resumo: ResumoPedido }) {
  const troco = trocoEsperadoCentavos(resumo);
  return (
    <Cartao titulo="Resumo do pedido" icone="pedidos">
      <View>
        <Texto variante="corpoForte">{rotuloDeItens(totalDeItens(resumo))}</Texto>
        <Texto cor="conteudoSuave" numberOfLines={2}>
          {principaisItens(resumo)}
        </Texto>
      </View>
      <View style={estilos.valores}>
        <LinhaDeValor rotulo="Subtotal" valor={formatarPrecoCentavos(resumo.subtotalCentavos)} />
        <LinhaDeValor rotulo="Taxa de entrega" valor={resumo.freteFinalCentavos === 0 ? "Grátis" : formatarPrecoCentavos(resumo.freteFinalCentavos)} />
        <View style={estilos.total}>
          <LinhaDeValor rotulo="Total" valor={formatarPrecoCentavos(resumo.totalCentavos)} forte />
        </View>
        <LinhaDeValor rotulo="Pagamento" icone={resumo.formaPagamentoNaEntrega === "cartao" ? "cartao" : "dinheiro"} valor={ROTULO_PAGAMENTO_ENTREGA[resumo.formaPagamentoNaEntrega]} />
        {resumo.trocoParaCentavos !== null && (
          <LinhaDeValor rotulo="Troco para" valor={`${formatarPrecoCentavos(resumo.trocoParaCentavos)}${troco !== null && troco > 0 ? ` (levar ${formatarPrecoCentavos(troco)})` : ""}`} />
        )}
      </View>
    </Cartao>
  );
}

/** Itens com a montagem gravada no pedido (snapshot). Abre e fecha no próprio lugar. */
function ItensDoPedido({ resumo }: { resumo: ResumoPedido }) {
  const [abertos, setAbertos] = useState(false);
  return (
    <View style={estilos.cartaoSemRespiro}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: abertos }} onPress={() => setAbertos((atual) => !atual)} style={({ pressed }) => [estilos.topoDosItens, pressed && estilos.pressionado]}>
        <View style={estilos.iconeDoCartao}>
          <Icone nome="pedidos" tamanho={16} cor="marca" />
        </View>
        <Texto variante="corpoForte" style={estilos.flex}>
          Itens do pedido
        </Texto>
        <Texto variante="pequenoMedio" cor="marca">
          {abertos ? "Ocultar itens" : `Ver itens (${totalDeItens(resumo)})`}
        </Texto>
        <Icone nome="expandir" tamanho={18} cor="marca" />
      </Pressable>
      {abertos &&
        resumo.itens.map((item, indice) => (
          // O mesmo produto pode aparecer duas vezes com montagens diferentes: a chave leva o índice.
          <View key={`${item.nomeProduto}-${indice}`} style={estilos.item}>
            <View style={estilos.quantidade}>
              <Texto variante="pequenoForte">{item.quantidade}x</Texto>
            </View>
            <View style={estilos.flex}>
              <Texto variante="corpoMedio">{item.nomeProduto}</Texto>
              {item.escolhas.length > 0 && <Texto cor="conteudoSuave">{item.escolhas.join(" · ")}</Texto>}
              {item.observacao && (
                <Texto cor="conteudoSuave" style={estilos.italico}>
                  “{item.observacao}”
                </Texto>
              )}
            </View>
            <Texto variante="corpoMedio">{formatarPrecoCentavos(item.subtotalCentavos)}</Texto>
          </View>
        ))}
    </View>
  );
}

function EnderecoDeEntrega({ destino }: { destino: NonNullable<Pedido["destino"]> }) {
  return (
    <Cartao titulo="Endereço de entrega" icone="local">
      <View style={estilos.endereco}>
        <Texto variante="corpoMedio">{formatarEnderecoResumido(destino)}</Texto>
        <Texto cor="conteudoSuave">{destino.bairro}</Texto>
        <Texto cor="conteudoSuave">
          {destino.cidade}/{destino.uf} · CEP {formatarCep(destino.cep)}
        </Texto>
        {destino.pontoReferencia && <Texto cor="conteudoSuave">Referência: {destino.pontoReferencia}</Texto>}
      </View>
      <View style={estilos.pontoConfirmado}>
        <Icone nome="local" tamanho={14} cor="marcaSuaveConteudo" />
        <Texto variante="pequenoMedio" cor="marcaSuaveConteudo" style={estilos.encolhe}>
          Ponto de entrega confirmado
        </Texto>
      </View>
    </Cartao>
  );
}

export function PedidoNaConversa({ resumo, criadoEm, aoConversarCom }: { resumo: ResumoPedido; criadoEm: string; aoConversarCom?: ((nomeUsuario: string) => void) | undefined }) {
  const terminal = statusPedidoTerminal(resumo.status);
  const cancelado = resumo.status === "cancelado";
  const [escolha, setEscolha] = useState<EscolhaDeExibicao | null>(null);
  const completa = apresentacaoDoPedido(resumo.status, escolha) === "completa";
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [largura, setLargura] = useState(0);
  const alternar = () => setEscolha((atual) => alternarExibicao(resumo.status, atual));

  // Detalhe relido quando o status muda (o evento avisa; o banco é a verdade) — só se estiver à mostra.
  useEffect(() => {
    if (!completa) return;
    let ativo = true;
    void obterPedido(resumo.id).then((resultado) => {
      if (ativo && resultado.ok) setPedido(resultado.dados);
    });
    return () => {
      ativo = false;
    };
  }, [resumo.id, resumo.status, completa]);

  if (!completa) {
    return (
      <View accessibilityLabel={`Pedido número ${resumo.numero}, ${rotuloCompacto(resumo.status)}`} style={estilos.compacto}>
        <View style={[estilos.marca, cancelado && estilos.marcaCancelada]}>
          <Icone nome={cancelado ? "fechar" : "check"} tamanho={16} cor={cancelado ? "perigo" : "marca"} />
        </View>
        <View style={estilos.textoCompacto}>
          <Texto variante="corpoForte">
            Pedido #{resumo.numero} ·{" "}
            <Texto variante="corpoForte" cor={cancelado ? "perigo" : "marca"}>
              {rotuloCompacto(resumo.status)}
            </Texto>
          </Texto>
          <Texto variante="pequeno" cor="conteudoSuave">
            {rotuloDeItens(totalDeItens(resumo))} · {formatarPrecoCentavos(resumo.totalCentavos)} · {dataDoPedido(criadoEm)}
          </Texto>
        </View>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: false }} onPress={alternar} style={({ pressed }) => [estilos.verDetalhes, pressed && estilos.pressionado]}>
          <Texto variante="pequenoMedio" cor="marcaSuaveConteudo">
            Ver detalhes
          </Texto>
        </Pressable>
      </View>
    );
  }

  const destino = pedido?.destino ? { latitude: pedido.destino.latitude, longitude: pedido.destino.longitude } : undefined;
  // O componente mede a PRÓPRIA largura: duas colunas só quando cabem com folga (tablet, paisagem).
  const duasColunas = largura >= LARGURA_DUAS_COLUNAS;
  const apertado = largura > 0 && largura < LARGURA_APERTADA;
  const endereco = pedido?.destino ? <EnderecoDeEntrega destino={pedido.destino} /> : null;

  return (
    <View
      accessibilityLabel={`Pedido número ${resumo.numero}, ${ROTULO_STATUS_PEDIDO_CLIENTE[resumo.status]}`}
      onLayout={(evento) => setLargura(Math.round(evento.nativeEvent.layout.width))}
      style={[estilos.completo, apertado && estilos.completoApertado]}>
      <View style={estilos.cabecalho}>
        <View style={estilos.linhaDoTitulo}>
          <View style={estilos.tituloEData}>
            <Texto style={estilos.numero}>Pedido #{resumo.numero}</Texto>
            <Texto variante="pequeno" cor="conteudoSuave">
              {dataDoPedido(criadoEm)} às {horaDoPedido(criadoEm)}
            </Texto>
          </View>
          <View style={estilos.statusEAcao}>
            <View style={[estilos.status, cancelado && estilos.statusCancelado]}>
              <Icone nome={cancelado ? "fechar" : resumo.status === "entregue" ? "check" : resumo.status === "saiu_para_entrega" || resumo.status === "em_rota" ? "entrega" : "pedidos"} tamanho={16} cor={cancelado ? "perigo" : "marcaSuaveConteudo"} />
              <Texto variante="corpoForte" cor={cancelado ? "perigo" : "marcaSuaveConteudo"} style={estilos.encolhe}>
                {ROTULO_STATUS_PEDIDO_CLIENTE[resumo.status]}
              </Texto>
            </View>
            {terminal && (
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: true }} onPress={alternar} style={({ pressed }) => [estilos.recolher, pressed && estilos.pressionado]}>
                <Texto variante="pequenoMedio" cor="marca">
                  Recolher
                </Texto>
              </Pressable>
            )}
          </View>
        </View>
        <Texto>{EXPLICACAO_STATUS_PEDIDO_CLIENTE[resumo.status]}</Texto>
        {pedido?.motivoCancelamento && (
          <Texto variante="pequeno" cor="perigo">
            Motivo: {pedido.motivoCancelamento}
          </Texto>
        )}
      </View>

      <View style={duasColunas ? estilos.colunas : estilos.coluna}>
        <View style={[estilos.coluna, duasColunas && estilos.colunaPrincipal]}>
          <Cartao titulo="Acompanhamento" icone="pedidos">
            {/* Os horários vêm do histórico real; enquanto o pedido completo carrega, as etapas já aparecem. */}
            <TimelinePedido pedido={{ status: resumo.status, historico: pedido?.historico ?? [] }} />
          </Cartao>
          {!terminal && <AcompanhamentoDoPedido pedidoId={resumo.id} emCartao aoConversarCom={aoConversarCom} {...(destino ? { destino } : {})} />}
          {/* Em duas colunas o endereço fica deste lado, para as colunas terem alturas parecidas. */}
          {duasColunas && endereco}
        </View>
        <View style={[estilos.coluna, duasColunas && estilos.colunaComplementar]}>
          <ResumoDoPedido resumo={resumo} />
          <ItensDoPedido resumo={resumo} />
          {!duasColunas && endereco}
        </View>
      </View>
    </View>
  );
}

// Abaixo disto o respiro diminui (celular pequeno); a partir disto cabem duas colunas internas (tablet).
const LARGURA_APERTADA = 320;
const LARGURA_DUAS_COLUNAS = 560;

const estilos = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  encolhe: { flexShrink: 1 },
  completo: { backgroundColor: Cores.superficieSuave, borderColor: Cores.borda, borderRadius: Raio.bloco, borderWidth: 1, gap: Espaco.tres, padding: Espaco.tres },
  completoApertado: { gap: Espaco.dois, padding: Espaco.dois },
  cabecalho: { gap: Espaco.dois, paddingHorizontal: Espaco.meio, paddingTop: Espaco.meio },
  // Título à esquerda e status à direita; sem espaço, o status desce para a linha de baixo.
  linhaDoTitulo: { alignItems: "flex-start", columnGap: Espaco.tres, flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: Espaco.dois },
  tituloEData: { flexShrink: 1, minWidth: 0 },
  numero: { color: Cores.conteudo, fontSize: 22, fontWeight: "700", lineHeight: 28 },
  statusEAcao: { alignItems: "center", columnGap: Espaco.dois, flexDirection: "row", flexShrink: 1, flexWrap: "wrap", rowGap: Espaco.um },
  status: { alignItems: "center", backgroundColor: Cores.marcaSuave, borderRadius: Raio.total, flexDirection: "row", flexShrink: 1, gap: Espaco.dois, paddingHorizontal: 14, paddingVertical: Espaco.dois },
  statusCancelado: { backgroundColor: Cores.perigoSuave },
  recolher: { justifyContent: "center", minHeight: ALTURA_TOQUE, paddingHorizontal: Espaco.dois },
  coluna: { gap: Espaco.tres },
  colunas: { alignItems: "flex-start", flexDirection: "row", gap: Espaco.tres },
  colunaPrincipal: { flex: 5, minWidth: 0 },
  colunaComplementar: { flex: 6, minWidth: 0 },
  cartao: { backgroundColor: Cores.superficie, borderColor: Cores.borda, borderRadius: Raio.bloco, borderWidth: 1, gap: Espaco.tres, padding: 14 },
  cartaoSemRespiro: { backgroundColor: Cores.superficie, borderColor: Cores.borda, borderRadius: Raio.bloco, borderWidth: 1, overflow: "hidden" },
  tituloDoCartao: { alignItems: "center", flexDirection: "row", gap: 10 },
  iconeDoCartao: { alignItems: "center", backgroundColor: Cores.marcaSuave, borderRadius: 14, height: 28, justifyContent: "center", width: 28 },
  valores: { borderTopColor: Cores.borda, borderTopWidth: 1, gap: 6, paddingTop: Espaco.tres },
  total: { borderTopColor: Cores.borda, borderTopWidth: 1, marginTop: Espaco.um, paddingTop: 10 },
  linhaDeValor: { alignItems: "baseline", columnGap: Espaco.quatro, flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 2 },
  rotuloComIcone: { alignItems: "center", flexDirection: "row", gap: 6 },
  valor: { flexShrink: 1, marginLeft: "auto", textAlign: "right" },
  topoDosItens: { alignItems: "center", flexDirection: "row", gap: 10, minHeight: 52, paddingHorizontal: 14, paddingVertical: Espaco.dois },
  item: { alignItems: "flex-start", borderTopColor: Cores.borda, borderTopWidth: 1, flexDirection: "row", gap: Espaco.tres, paddingHorizontal: 14, paddingVertical: Espaco.tres },
  quantidade: { alignItems: "center", backgroundColor: Cores.superficieSuave, borderRadius: Raio.compacto, justifyContent: "center", minHeight: 24, minWidth: 28, paddingHorizontal: Espaco.um },
  italico: { fontStyle: "italic" },
  endereco: { gap: 2 },
  pontoConfirmado: { alignItems: "center", alignSelf: "flex-start", backgroundColor: Cores.marcaSuave, borderRadius: Raio.total, flexDirection: "row", gap: 6, maxWidth: "100%", paddingHorizontal: Espaco.tres, paddingVertical: 6 },
  // Compacto: marca + texto e, quando não cabe ao lado, o botão desce para a linha de baixo.
  compacto: { alignItems: "center", backgroundColor: Cores.superficie, borderColor: Cores.borda, borderRadius: Raio.bloco, borderWidth: 1, columnGap: Espaco.tres, flexDirection: "row", flexWrap: "wrap", padding: 14, rowGap: 10 },
  textoCompacto: { flexBasis: 150, flexGrow: 1, flexShrink: 1, minWidth: 0 },
  marca: { alignItems: "center", backgroundColor: Cores.marcaSuave, borderRadius: 18, height: 36, justifyContent: "center", width: 36 },
  marcaCancelada: { backgroundColor: Cores.perigoSuave },
  verDetalhes: { backgroundColor: Cores.marcaSuave, borderRadius: Raio.compacto, justifyContent: "center", minHeight: ALTURA_TOQUE, paddingHorizontal: 14 },
  pressionado: { opacity: 0.8 },
});
