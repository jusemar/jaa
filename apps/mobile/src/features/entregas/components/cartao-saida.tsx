import { ROTULO_PAGAMENTO_ENTREGA, ROTULO_STATUS_PEDIDO, ROTULO_STATUS_SAIDA, formatarEnderecoResumido, paradasAtivas, podeRecalcularRota, rotuloRota, type EntregaAtribuida, type ParadaSaida, type SaidaEntrega } from "@jaa/contratos";
import { useState, type ReactNode } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import { Botao } from "@/components/ui/botao";
import { Icone } from "@/components/ui/icone";
import { Cartao, Selo } from "@/components/ui/superficies";
import { Texto } from "@/components/ui/texto";
import { ALTURA_TOQUE, Cores, Espaco, Raio } from "@/constants/theme";
import { formatarPrecoCentavos } from "@/features/produtos/lib/precos";
import { moverNoRascunho, ordemMudou, podeConcluirParada, podeReordenar, podeSairParaEntrega, quantidadeDeEntregas, tituloDaRota, totalDeItens, trajetoCurto, urlDeNavegacao } from "../lib/minhas-entregas";
import { AcaoCompacta } from "./acao-compacta";
import { TelaMapaDaRota } from "./tela-mapa-da-rota";

/*
 * UMA ROTA do entregador, pensada para o celular. A ordem é a da decisão:
 *
 *   status · empresa · rota e quantidade
 *   [ AÇÃO PRINCIPAL ]                 (sair para entrega / marcar como entregue)
 *   trajeto em uma linha
 *   PRÓXIMA PARADA  — quem, onde, quanto e como recebe
 *   ações compactas — Navegar · Conversar · Itens
 *   demais paradas, uma linha cada (toque para abrir)
 *   rodapé          — Mapa · Empresa · Ordem … e "Recusar rota", discreto
 *
 * Nada some em relação à Web: muda a hierarquia. Só apresenta e avisa quem tocou no quê — o que cada
 * ação faz é da API (mesmas rotas da Web).
 */
export function CartaoSaida({
  saida,
  entregas,
  ocupado,
  rastreamento,
  aoConversar,
  aoIniciar,
  aoRecusar,
  aoConcluir,
  aoSalvarOrdem,
  aoRecalcularRota,
}: {
  saida: SaidaEntrega;
  entregas: EntregaAtribuida[];
  ocupado: boolean;
  // Estado REAL da localização desta saída (só existe com ela em andamento).
  rastreamento?: ReactNode;
  aoConversar: (nomeUsuario: string) => void;
  aoIniciar: () => void;
  aoRecusar: () => void;
  aoConcluir: (parada: ParadaSaida) => void;
  aoSalvarOrdem: (pedidoIds: string[]) => Promise<boolean>;
  aoRecalcularRota: () => Promise<boolean>;
}) {
  const ativas = paradasAtivas(saida);
  const [mapaAberto, setMapaAberto] = useState(false);
  const [expandida, setExpandida] = useState<string | null>(null);
  // "Ordem": um RASCUNHO que só vale depois de confirmado (uma versão, um percurso).
  const [rascunho, setRascunho] = useState<string[] | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [recalculando, setRecalculando] = useState(false);
  const entregaDoPedido = new Map(entregas.map((entrega) => [entrega.pedidoId, entrega]));
  const encerradas = saida.paradas.filter((parada) => parada.encerradaEm !== null).length;
  const naRua = saida.status === "em_andamento";
  const trajeto = trajetoCurto(saida);
  const [proxima, ...demais] = ativas;

  async function salvarOrdem() {
    if (!rascunho) return;
    setSalvando(true);
    try {
      if (await aoSalvarOrdem(rascunho)) setRascunho(null);
    } finally {
      setSalvando(false);
    }
  }

  async function recalcular() {
    if (recalculando) return;
    setRecalculando(true);
    try {
      if (await aoRecalcularRota()) setRascunho(null);
    } finally {
      setRecalculando(false);
    }
  }

  return (
    <Cartao style={estilos.cartao}>
      <View style={estilos.cabecalho}>
        <View style={estilos.linha}>
          <Selo rotulo={ROTULO_STATUS_SAIDA[saida.status]} tom={naRua ? "marca" : "atencao"} />
          {encerradas > 0 && (
            <Texto variante="pequeno" cor="conteudoSuave">
              {encerradas} {encerradas === 1 ? "entregue" : "entregues"}
            </Texto>
          )}
        </View>
        <Texto variante="subtitulo" numberOfLines={2}>
          {saida.empresa.nome}
        </Texto>
        <Texto variante="pequeno" cor="conteudoSuave">
          {tituloDaRota(saida)} · {quantidadeDeEntregas(saida)}
          {trajeto ? ` · ${trajeto}` : ""}
        </Texto>
        {/* Sem percurso real, o texto honesto do contrato — nunca um número inventado. */}
        {!trajeto && ativas.length > 1 && (
          <Texto variante="mini" cor="conteudoSuave">
            {rotuloRota(saida.rota, saida.versaoSequencia)}
          </Texto>
        )}
      </View>

      {podeSairParaEntrega(saida) && <Botao rotulo="SAIR PARA ENTREGA" larguraTotal disabled={ocupado} onPress={aoIniciar} />}
      {saida.status === "preparada" && (
        <Texto variante="pequeno" cor="conteudoSuave">
          Aguardando liberação para retirada
        </Texto>
      )}
      {rastreamento}

      {rascunho ? (
        <View style={estilos.bloco}>
          <Texto variante="pequeno" cor="conteudoSuave">
            Toque nas setas até ficar na ordem em que você vai entregar.
          </Texto>
          {rascunho.map((pedidoId, indice) => {
            const parada = ativas.find((item) => item.pedidoId === pedidoId);
            if (!parada) return null;
            return (
              <View key={parada.id} style={estilos.linhaDeOrdem}>
                <Numero valor={indice + 1} destaque={indice === 0} />
                <View style={estilos.flex}>
                  <Texto variante="corpoMedio" numberOfLines={1}>
                    {parada.cliente.nomeExibicao}
                  </Texto>
                  <Texto variante="pequeno" cor="conteudoSuave" numberOfLines={1}>
                    {formatarEnderecoResumido(parada.destino)}
                  </Texto>
                </View>
                <BotaoDeOrdem rotulo={`Subir entrega de ${parada.cliente.nomeExibicao}`} simbolo="↑" desabilitado={salvando || indice === 0} aoTocar={() => setRascunho((atual) => (atual ? moverNoRascunho(atual, pedidoId, -1) : atual))} />
                <BotaoDeOrdem rotulo={`Descer entrega de ${parada.cliente.nomeExibicao}`} simbolo="↓" desabilitado={salvando || indice === rascunho.length - 1} aoTocar={() => setRascunho((atual) => (atual ? moverNoRascunho(atual, pedidoId, 1) : atual))} />
              </View>
            );
          })}
          <View style={estilos.acoes}>
            <Botao rotulo="Confirmar ordem" compacto carregando={salvando} textoCarregando="Salvando…" disabled={ocupado || !ordemMudou(rascunho, ativas.map((parada) => parada.pedidoId))} onPress={() => void salvarOrdem()} />
            <Botao rotulo="Cancelar" aparencia="secundario" compacto disabled={salvando} onPress={() => setRascunho(null)} />
            {podeRecalcularRota(saida) && <Botao rotulo="Recalcular melhor rota" aparencia="discreto" compacto carregando={recalculando} textoCarregando="Recalculando…" disabled={ocupado || salvando} onPress={() => void recalcular()} />}
          </View>
        </View>
      ) : (
        <>
          {proxima ? (
            <Parada
              // Chave pela PARADA: quando a próxima muda (a anterior foi entregue), o bloco é outro —
              // nada do que estava aberto para o pedido anterior (os itens) fica valendo para este.
              key={proxima.id}
              parada={proxima} posicao={1} entrega={entregaDoPedido.get(proxima.pedidoId)} destaque aberta ocupado={ocupado} podeConcluir={podeConcluirParada(saida, 0)} aoConversar={aoConversar} aoConcluir={() => aoConcluir(proxima)} />
          ) : (
            <Texto variante="pequeno" cor="conteudoSuave">
              Nenhuma entrega ativa nesta rota.
            </Texto>
          )}
          {demais.map((parada, indice) => (
            <Parada
              key={parada.id}
              parada={parada}
              posicao={indice + 2}
              entrega={entregaDoPedido.get(parada.pedidoId)}
              aberta={expandida === parada.id}
              aoAlternar={() => setExpandida((atual) => (atual === parada.id ? null : parada.id))}
              ocupado={ocupado}
              podeConcluir={false}
              aoConversar={aoConversar}
              aoConcluir={() => aoConcluir(parada)}
            />
          ))}
        </>
      )}

      <View style={estilos.rodape}>
        <View style={estilos.acoes}>
          <AcaoCompacta rotulo="Mapa" icone="local" descricao="Abrir o mapa da rota" aoTocar={() => setMapaAberto(true)} />
          <AcaoCompacta rotulo="Empresa" icone="conversa" descricao={`Conversar com ${saida.empresa.nome}`} aoTocar={() => aoConversar(saida.empresa.nomeUsuario)} />
          {podeReordenar(saida) && !rascunho && <AcaoCompacta rotulo="Ordem" icone="lapis" descricao="Alterar a ordem das entregas" desabilitada={ocupado} aoTocar={() => setRascunho(ativas.map((parada) => parada.pedidoId))} />}
        </View>
        {/* Secundária e destrutiva: existe, mas não disputa com "SAIR PARA ENTREGA". */}
        {podeSairParaEntrega(saida) && (
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: ocupado }} disabled={ocupado} hitSlop={8} onPress={aoRecusar} style={({ pressed }) => [estilos.recusar, (pressed || ocupado) && estilos.apagado]}>
            <Texto variante="pequenoMedio" cor="perigo">
              Recusar rota
            </Texto>
          </Pressable>
        )}
      </View>

      {mapaAberto && <TelaMapaDaRota saida={saida} aoFechar={() => setMapaAberto(false)} />}
    </Cartao>
  );
}

/**
 * Uma parada. A PRÓXIMA vem aberta e destacada (é a decisão do momento); as demais ocupam uma linha
 * e abrem ao toque — o cartão não cresce com informação que ainda não é a vez dela.
 */
function Parada({
  parada,
  posicao,
  entrega,
  destaque = false,
  aberta,
  aoAlternar,
  ocupado,
  podeConcluir,
  aoConversar,
  aoConcluir,
}: {
  parada: ParadaSaida;
  posicao: number;
  entrega: EntregaAtribuida | undefined;
  destaque?: boolean;
  aberta: boolean;
  aoAlternar?: () => void;
  ocupado: boolean;
  podeConcluir: boolean;
  aoConversar: (nomeUsuario: string) => void;
  aoConcluir: () => void;
}) {
  const [itensAbertos, setItensAbertos] = useState(false);
  const { destino } = parada;
  const valor = `${entrega ? `${totalDeItens(entrega)} · ` : ""}${formatarPrecoCentavos(parada.totalCentavos)}`;

  if (!aberta) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={`${posicao}ª parada, pedido ${parada.numeroPedido}, ${parada.cliente.nomeExibicao}. Toque para ver.`} accessibilityState={{ expanded: false }} onPress={aoAlternar} style={({ pressed }) => [estilos.resumida, pressed && estilos.apagado]}>
        <Numero valor={posicao} />
        <View style={estilos.flex}>
          <Texto variante="corpoMedio" numberOfLines={1}>
            {parada.cliente.nomeExibicao} · Pedido #{parada.numeroPedido}
          </Texto>
          <Texto variante="pequeno" cor="conteudoSuave" numberOfLines={1}>
            {formatarEnderecoResumido(destino)} · {destino.bairro}
          </Texto>
        </View>
        <Icone nome="expandir" tamanho={18} />
      </Pressable>
    );
  }

  return (
    <View style={[estilos.parada, destaque && estilos.paradaProxima]}>
      <Pressable accessibilityRole={aoAlternar ? "button" : "none"} accessibilityState={aoAlternar ? { expanded: true } : {}} disabled={!aoAlternar} onPress={aoAlternar} style={estilos.topoDaParada}>
        <Numero valor={posicao} destaque={destaque} />
        <View style={estilos.flex}>
          <Texto variante="miniForte" cor={destaque ? "marca" : "conteudoSuave"} style={estilos.maiusculas}>
            {destaque ? "Próxima parada" : `${posicao}ª parada`} · Pedido #{parada.numeroPedido}
          </Texto>
          <Texto variante="subtitulo" numberOfLines={2}>
            {parada.cliente.nomeExibicao}
          </Texto>
        </View>
      </Pressable>

      <View style={estilos.detalhes}>
        <Texto variante="corpoMedio">{formatarEnderecoResumido(destino)}</Texto>
        <Texto variante="pequeno" cor="conteudoSuave">
          {destino.bairro}, {destino.cidade}/{destino.uf}
          {destino.pontoReferencia ? ` · Ref.: ${destino.pontoReferencia}` : ""}
        </Texto>
        <Texto variante="corpoForte" style={estilos.valor}>
          {valor}
        </Texto>
        {entrega && (
          <Texto variante="pequeno">
            {ROTULO_PAGAMENTO_ENTREGA[entrega.formaPagamentoNaEntrega]}
            {entrega.trocoParaCentavos !== null && ` · Troco para ${formatarPrecoCentavos(entrega.trocoParaCentavos)}`}
          </Texto>
        )}
      </View>

      {itensAbertos && entrega && (
        <View accessibilityLabel={`Itens do pedido ${parada.numeroPedido}`} style={estilos.itens}>
          {entrega.itens.map((item, indice) => (
            <Texto key={`${item.nomeProduto}-${indice}`} variante="pequeno">
              {item.quantidade}× {item.nomeProduto}
            </Texto>
          ))}
          <Texto variante="mini" cor="conteudoSuave">
            Status: {ROTULO_STATUS_PEDIDO[parada.statusPedido]}
          </Texto>
        </View>
      )}

      <View style={estilos.acoes}>
        <AcaoCompacta rotulo="Navegar" icone="seta" descricao={`Navegar até ${parada.cliente.nomeExibicao}`} aoTocar={() => void Linking.openURL(urlDeNavegacao(destino, `Pedido ${parada.numeroPedido}`)).catch(() => undefined)} />
        <AcaoCompacta rotulo="Conversar" icone="conversa" descricao={`Conversar com ${parada.cliente.nomeExibicao}`} aoTocar={() => aoConversar(parada.cliente.nomeUsuario)} />
        {entrega && <AcaoCompacta rotulo="Itens" icone="sacola" descricao={itensAbertos ? "Ocultar itens" : "Ver itens"} ativa={itensAbertos} aoTocar={() => setItensAbertos((atual) => !atual)} />}
      </View>

      {podeConcluir && <Botao rotulo="Marcar como entregue" larguraTotal disabled={ocupado} onPress={aoConcluir} />}
    </View>
  );
}

function Numero({ valor, destaque = false }: { valor: number; destaque?: boolean }) {
  return (
    <View style={[estilos.numero, destaque && estilos.numeroProxima]}>
      <Texto variante="pequenoForte" cor={destaque ? "marcaConteudo" : "marcaSuaveConteudo"}>
        {valor}
      </Texto>
    </View>
  );
}

function BotaoDeOrdem({ rotulo, simbolo, desabilitado, aoTocar }: { rotulo: string; simbolo: string; desabilitado: boolean; aoTocar: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={rotulo} accessibilityState={{ disabled: desabilitado }} disabled={desabilitado} onPress={aoTocar} style={({ pressed }) => [estilos.seta, (pressed || desabilitado) && estilos.apagado]}>
      <Texto variante="subtitulo">{simbolo}</Texto>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  cartao: { gap: Espaco.tres, padding: Espaco.tres },
  cabecalho: { gap: 2 },
  linha: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: Espaco.um },
  bloco: { gap: Espaco.dois },
  acoes: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: Espaco.dois },
  parada: { backgroundColor: Cores.superficieSuave, borderRadius: Raio.bloco, gap: Espaco.dois, padding: Espaco.tres },
  paradaProxima: { backgroundColor: Cores.selecionadoFundo },
  topoDaParada: { alignItems: "center", flexDirection: "row", gap: Espaco.dois },
  detalhes: { gap: 2 },
  valor: { marginTop: Espaco.um },
  resumida: { alignItems: "center", borderTopColor: Cores.borda, borderTopWidth: 1, flexDirection: "row", gap: Espaco.dois, minHeight: ALTURA_TOQUE, paddingTop: Espaco.dois },
  maiusculas: { letterSpacing: 0.4, textTransform: "uppercase" },
  numero: { alignItems: "center", backgroundColor: Cores.marcaSuave, borderRadius: 14, height: 28, justifyContent: "center", width: 28 },
  numeroProxima: { backgroundColor: Cores.marca },
  itens: { borderTopColor: Cores.borda, borderTopWidth: 1, gap: 2, paddingTop: Espaco.dois },
  linhaDeOrdem: { alignItems: "center", flexDirection: "row", gap: Espaco.dois },
  seta: { alignItems: "center", backgroundColor: Cores.superficie, borderColor: Cores.borda, borderRadius: Raio.compacto, borderWidth: 1, height: ALTURA_TOQUE, justifyContent: "center", width: ALTURA_TOQUE },
  rodape: { alignItems: "center", borderTopColor: Cores.borda, borderTopWidth: 1, flexDirection: "row", flexWrap: "wrap", gap: Espaco.dois, justifyContent: "space-between", paddingTop: Espaco.tres },
  recusar: { justifyContent: "center", minHeight: 40, paddingHorizontal: Espaco.um },
  apagado: { opacity: 0.5 },
});
