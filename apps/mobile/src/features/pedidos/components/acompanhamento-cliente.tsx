import {
  EVENTO_PEDIDO_ACOMPANHAMENTO,
  EVENTO_PEDIDO_FILA,
  TEXTO_AVISO_ENTREGA_PROXIMA,
  TEXTO_MAPA_DA_ENTREGA,
  avisoNoLugarDoMapa,
  formatarDistanciaRota,
  formatarPrevisaoDoTrecho,
  eventoPedidoAcompanhamentoSchema,
  eventoPedidoFilaSchema,
  rotuloFila,
  rotuloUltimaPosicao,
  type AcompanhamentoPedido,
} from "@jaa/contratos";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { AvatarIdentidade } from "@/components/ui/avatar";
import { Icone } from "@/components/ui/icone";
import { Texto } from "@/components/ui/texto";
import { Cores, Raio } from "@/constants/theme";
import { obterMapbox } from "@/features/entregas/lib/mapbox-nativo";
import { obterClienteRealtime } from "@/lib/realtime/cliente-realtime";
import { obterAcompanhamentoDoPedido } from "../lib/api-acompanhamento";
import { limitesDoMapa, pontosDoTrecho, temEntregaParaMostrar, temMapaParaMostrar } from "../lib/pedido-na-conversa";

/*
 * ACOMPANHAMENTO DO CLIENTE — o mesmo da Web: a posição na fila ("Você é o 3º na fila de entregas.") e
 * quem está com a entrega. Quem decide o que o cliente vê é o SERVIDOR: a tela não "esconde" nada.
 *
 * Quando a entrega dele é a ATUAL e o servidor manda a posição, aparece o mapa com DOIS pontos — o
 * entregador e o destino dele. Nada de rota nem de outras paradas (o contrato nem os traz). Binário sem
 * o mapa, ou sem o token público, fica só com o texto e a idade da última posição.
 */
type Ponto = { latitude: number; longitude: number };

export function AcompanhamentoDoPedido({
  pedidoId,
  aoConversarCom,
  destino,
  emCartao = false,
}: {
  // Dentro do pedido na conversa: vira a seção "Entrega" e some inteira quando não há o que mostrar.
  emCartao?: boolean;
  pedidoId: string;
  aoConversarCom?: ((nomeUsuario: string) => void) | undefined;
  // O ponto que o PRÓPRIO cliente confirmou neste pedido (snapshot).
  destino?: Ponto | undefined;
}) {
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
        rota: fila.situacao === "indo_ate_voce" ? (atual?.rota ?? null) : null,
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
  const { fila, posicaoEntregador, entregador, rota } = acompanhamento;
  const mostraFila = fila.situacao !== "sem_saida" && fila.situacao !== "encerrado";
  const indoAteVoce = fila.situacao === "indo_ate_voce";

  const avisoDoMapa = avisoNoLugarDoMapa(acompanhamento);

  // Antes de existir entrega para acompanhar (sem rota e sem entregador), a seção não ocupa espaço.
  if (emCartao && !temEntregaParaMostrar(acompanhamento)) return null;

  return (
    <View style={emCartao ? estilos.cartao : estilos.bloco}>
      {emCartao && (
        <View style={estilos.tituloDoCartao}>
          <View style={estilos.iconeDoCartao}>
            <Icone nome="entregador" tamanho={16} cor="marca" />
          </View>
          <Texto variante="corpoForte">Entrega</Texto>
        </View>
      )}
      {/*
        AVISO da entrega: bloco SÓLIDO, com contraste próprio. Na vez do cliente: título forte, a
        orientação, PREVISÃO e distância do trecho que falta (só quando o servidor manda) e há quanto
        tempo a posição foi atualizada. Fora da vez dele, a posição na fila em um bloco neutro.
      */}
      {mostraFila && !indoAteVoce && (
        <View style={estilos.avisoNeutro}>
          <Texto variante="corpoMedio">{rotuloFila(fila)}</Texto>
        </View>
      )}
      {indoAteVoce && (
        <View style={estilos.aviso}>
          <Texto variante="subtitulo" cor="marcaSuaveConteudo">
            {TEXTO_AVISO_ENTREGA_PROXIMA.titulo}
          </Texto>
          <Texto>O entregador está a caminho do seu endereço. {TEXTO_AVISO_ENTREGA_PROXIMA.orientacao}</Texto>
          {rota && (
            <View style={estilos.previsao}>
              <Texto cor="conteudoSuave">
                Previsão: <Texto variante="corpoForte">{formatarPrevisaoDoTrecho(rota.duracaoSegundos)}</Texto>
              </Texto>
              <Texto cor="conteudoSuave">
                Distância: <Texto variante="corpoForte">{formatarDistanciaRota(rota.distanciaMetros)}</Texto>
              </Texto>
            </View>
          )}
          <Texto variante="pequeno" cor="conteudoSuave">
            {posicaoEntregador ? rotuloUltimaPosicao({ capturadaEm: posicaoEntregador.capturadaEm }) : "Aguardando a localização do entregador…"}
          </Texto>
        </View>
      )}
      {/* QUEM ESTÁ COM A ENTREGA: foto (quando ele permite) ou iniciais, nome e @usuario. "Conversar" abre a conversa direta de sempre. */}
      {entregador && fila.situacao !== "encerrado" && (
        <View style={estilos.entregador}>
          <AvatarIdentidade identidade={entregador} />
          <View style={estilos.nomeDoEntregador}>
            <Texto variante="corpoForte">{entregador.nomeExibicao}</Texto>
            <Texto variante="pequeno" cor="conteudoSuave">
              @{entregador.nomeUsuario}
            </Texto>
          </View>
          {aoConversarCom && (
            <Pressable accessibilityRole="button" accessibilityLabel={`Conversar com ${entregador.nomeExibicao}`} onPress={() => aoConversarCom(entregador.nomeUsuario)} style={({ pressed }) => [estilos.conversar, pressed && estilos.pressionado]}>
              <Icone nome="conversa" tamanho={16} cor="marca" />
              <Texto variante="pequenoMedio" cor="marca">
                Conversar
              </Texto>
            </Pressable>
          )}
        </View>
      )}
      {/* MAPA: só com a entrega dele sendo a atual e posição real. Fora disso, uma frase curta — nunca um espaço vazio. */}
      {temMapaParaMostrar(acompanhamento) && posicaoEntregador ? (
        <MapaDoEntregador posicao={posicaoEntregador} destino={destino} geometria={rota?.geometria ?? null} />
      ) : (
        avisoDoMapa && (
          <Texto variante="pequeno" cor="conteudoSuave">
            {avisoDoMapa}
          </Texto>
        )
      )}
    </View>
  );
}

/** Mapa do cliente: só o entregador e o destino DELE. A câmera enquadra os dois e acompanha a posição. */
function MapaDoEntregador({ posicao, destino, geometria }: { posicao: Ponto; destino?: Ponto | undefined; geometria: readonly Ponto[] | null }) {
  const mapbox = obterMapbox();
  // Altura coerente com a tela (nem faixa fina no tablet, nem mapa gigante no celular pequeno).
  const { height } = useWindowDimensions();
  const alturaDoMapa = Math.max(180, Math.min(280, Math.round(height * 0.28)));
  // Binário sem o mapa (ou sem o token público): diz isso, em vez de sumir sem explicação.
  if (!mapbox) {
    return (
      <Texto variante="pequeno" cor="conteudoSuave">
        {TEXTO_MAPA_DA_ENTREGA.indisponivelNoAparelho}
      </Texto>
    );
  }
  const { MapView, Camera, MarkerView, ShapeSource, LineLayer, StyleURL } = mapbox;
  // A LINHA é a geometria que o servidor mandou (o trecho real até este cliente). Sem ela, só os pontos.
  const tracado = pontosDoTrecho(geometria);
  const entregador: [number, number] = [posicao.longitude, posicao.latitude];
  const seuPonto: [number, number] | null = destino ? [destino.longitude, destino.latitude] : null;
  const limites = limitesDoMapa([entregador, ...(seuPonto ? [seuPonto] : []), ...tracado]);

  return (
    <View accessibilityLabel="Mapa com o entregador e o seu endereço" style={[estilos.mapa, { height: alturaDoMapa }]}>
      <MapView style={estilos.flexTotal} styleURL={StyleURL.Street} scaleBarEnabled={false} logoEnabled attributionEnabled>
        {limites ? (
          <Camera bounds={limites} padding={{ paddingTop: 48, paddingBottom: 48, paddingLeft: 48, paddingRight: 48 }} maxZoomLevel={16} animationDuration={600} />
        ) : (
          <Camera centerCoordinate={entregador} zoomLevel={15} animationDuration={600} />
        )}
        {tracado.length > 1 && (
          <ShapeSource id="trecho-da-entrega" shape={{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: tracado } }}>
            <LineLayer id="trecho-da-entrega-contorno" style={{ lineColor: Cores.superficie, lineWidth: 8, lineCap: "round", lineJoin: "round" }} />
            <LineLayer id="trecho-da-entrega-linha" style={{ lineColor: Cores.marca, lineWidth: 5, lineCap: "round", lineJoin: "round" }} />
          </ShapeSource>
        )}
        {seuPonto && (
          <MarkerView coordinate={seuPonto} allowOverlap>
            <View accessibilityLabel="Sua entrega" style={estilos.marcadorDestino}>
              <Icone nome="cliente" tamanho={18} cor="conteudo" />
            </View>
          </MarkerView>
        )}
        <MarkerView coordinate={entregador} allowOverlap>
          <View accessibilityLabel="Entregador" style={estilos.marcadorEntregador}>
            <Icone nome="entregador" tamanho={18} cor="marcaConteudo" />
          </View>
        </MarkerView>
      </MapView>
    </View>
  );
}

const estilos = StyleSheet.create({
  mapa: { alignSelf: "stretch", borderColor: Cores.borda, borderRadius: Raio.compacto, borderWidth: 1, marginVertical: 4, overflow: "hidden" },
  flexTotal: { flex: 1 },
  marcadorDestino: { alignItems: "center", backgroundColor: Cores.superficie, borderColor: Cores.conteudo, borderRadius: 15, borderWidth: 2, height: 30, justifyContent: "center", width: 30 },
  // ENTREGADOR: a moto sobre o verde do Jaaa; maior que o destino porque é o ponto que se move.
  marcadorEntregador: { alignItems: "center", backgroundColor: Cores.marca, borderColor: Cores.superficie, borderRadius: 18, borderWidth: 3, height: 36, justifyContent: "center", width: 36 },
  bloco: { gap: 2 },
  // Sólidos: o texto não depende do que está atrás para ter contraste.
  aviso: { backgroundColor: Cores.marcaSuave, borderColor: Cores.marca, borderRadius: Raio.compacto, borderWidth: 1, gap: 6, paddingHorizontal: 14, paddingVertical: 12 },
  avisoNeutro: { backgroundColor: Cores.superficieSuave, borderRadius: Raio.compacto, paddingHorizontal: 14, paddingVertical: 12 },
  previsao: { columnGap: 20, flexDirection: "row", flexWrap: "wrap", rowGap: 2 },
  cartao: { backgroundColor: Cores.superficie, borderColor: Cores.borda, borderRadius: Raio.bloco, borderWidth: 1, gap: 6, padding: 14 },
  tituloDoCartao: { alignItems: "center", flexDirection: "row", gap: 10, marginBottom: 4 },
  iconeDoCartao: { alignItems: "center", backgroundColor: Cores.marcaSuave, borderRadius: 14, height: 28, justifyContent: "center", width: 28 },
  flex: { flexShrink: 1 },
  entregador: { alignItems: "center", columnGap: 12, flexDirection: "row", flexWrap: "wrap", rowGap: 8 },
  nomeDoEntregador: { flexBasis: 110, flexGrow: 1, flexShrink: 1, minWidth: 0 },
  pressionado: { opacity: 0.8 },
  conversar: { alignItems: "center", borderColor: Cores.borda, borderRadius: Raio.total, borderWidth: 1, flexDirection: "row", gap: 6, justifyContent: "center", minHeight: 44, paddingHorizontal: 14 },
  medio: { fontWeight: "500" },
});
