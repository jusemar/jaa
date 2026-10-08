import type { Coordenadas } from "@jaa/contratos";
import { Image } from "expo-image";
import { useMemo, useState, type ReactNode } from "react";
import { PanResponder, Pressable, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { Icone } from "@/components/ui/icone";
import { Texto } from "@/components/ui/texto";
import { Cores, Raio } from "@/constants/theme";
import { ATRIBUICAO_DOS_BLOCOS, CABECALHOS_DOS_BLOCOS, TAMANHO_DO_BLOCO, ZOOM_INICIAL, ZOOM_MAXIMO, ZOOM_MINIMO, blocosVisiveis, centroAposArrastar, coordenadasParaMundo, limitarZoom } from "../lib/mapa-ponto";

/*
 * MAPA PARA ESCOLHER O PONTO: o marcador fica FIXO no centro e a pessoa arrasta o mapa embaixo dele
 * (funciona com uma mão). Aproximar e afastar (+ / −) não mudam o ponto.
 *
 * Não usa biblioteca nativa de mapa: desenha os blocos de imagem do serviço de mapas e trata o
 * arraste. É a implementação do app para a mesma fronteira que a Web tem com o Leaflet/Mapbox —
 * trocar por um mapa nativo depois é trocar este arquivo, sem tocar em regra de endereço.
 *
 * `centro` é controlado por quem usa: este componente só avisa para onde o mapa foi levado.
 *
 * Opcionais (o mapa de endereço de entrega não usa nenhum): `zoomInicial`, para abrir mais afastado, e
 * `sobreposicao`, que desenha algo POR CIMA do mapa recebendo a função que leva uma coordenada à
 * posição dela na tela (acompanha arraste e zoom) — é como a área de atuação desenhada aparece.
 */
export type ProjetarNoMapa = (coordenadas: Coordenadas) => { x: number; y: number };

const ALTURA = 280;

export function MapaPonto({
  centro,
  aoMover,
  zoomInicial = ZOOM_INICIAL,
  sobreposicao,
}: {
  centro: Coordenadas;
  aoMover: (centro: Coordenadas) => void;
  zoomInicial?: number;
  sobreposicao?: ((projetar: ProjetarNoMapa) => ReactNode) | undefined;
}) {
  const [largura, setLargura] = useState(0);
  const [zoom, setZoom] = useState(() => limitarZoom(zoomInicial));
  // Deslocamento do dedo durante o arraste: os blocos acompanham na hora; o centro só muda ao soltar.
  const [arraste, setArraste] = useState({ dx: 0, dy: 0 });

  /*
   * Os gestos são recriados só quando o centro ou o zoom mudam — o que acontece ao SOLTAR ou ao tocar
   * em + / −, nunca no meio de um arraste. Por isso `aoMover` precisa ser estável em quem usa.
   */
  const gestos = useMemo(
    () =>
      PanResponder.create({
        // O mapa fica com o gesto: a lista em volta não rola enquanto a pessoa ajusta o ponto.
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_evento, gesto) => setArraste({ dx: gesto.dx, dy: gesto.dy }),
        onPanResponderRelease: (_evento, gesto) => {
          setArraste({ dx: 0, dy: 0 });
          if (gesto.dx !== 0 || gesto.dy !== 0) aoMover(centroAposArrastar(centro, zoom, gesto.dx, gesto.dy));
        },
        onPanResponderTerminate: () => setArraste({ dx: 0, dy: 0 }),
      }),
    [centro, zoom, aoMover],
  );

  // Uma margem de um bloco em volta: ao arrastar não aparece buraco antes de soltar.
  const blocos = useMemo(() => blocosVisiveis(centro, zoom, largura + 2 * TAMANHO_DO_BLOCO, ALTURA + 2 * TAMANHO_DO_BLOCO), [centro, zoom, largura]);
  const medir = (evento: LayoutChangeEvent) => setLargura(Math.round(evento.nativeEvent.layout.width));

  return (
    <View
      accessibilityLabel="Mapa. Arraste para deixar o marcador no local exato da entrega."
      onLayout={medir}
      style={estilos.mapa}
      {...gestos.panHandlers}>
      <View pointerEvents="none" style={[estilos.blocos, { transform: [{ translateX: arraste.dx - TAMANHO_DO_BLOCO }, { translateY: arraste.dy - TAMANHO_DO_BLOCO }] }]}>
        {blocos.map((bloco) => (
          <Image key={bloco.chave} source={{ uri: bloco.url, headers: CABECALHOS_DOS_BLOCOS }} cachePolicy="memory-disk" style={[estilos.bloco, { left: bloco.esquerda, top: bloco.topo }]} />
        ))}
      </View>

      {sobreposicao && largura > 0 && (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {sobreposicao((coordenadas) => {
            const noMundo = coordenadasParaMundo(coordenadas, zoom);
            const centroNoMundo = coordenadasParaMundo(centro, zoom);
            return { x: noMundo.x - centroNoMundo.x + largura / 2 + arraste.dx, y: noMundo.y - centroNoMundo.y + ALTURA / 2 + arraste.dy };
          })}
        </View>
      )}

      {/* O marcador: a PONTA dele é o centro do mapa — é ali que a entrega será feita. */}
      <View pointerEvents="none" style={estilos.marcador}>
        <Icone nome="local" tamanho={40} cor="marca" />
      </View>

      <View style={estilos.zoom}>
        <BotaoDeZoom rotulo="Aproximar" icone="mais" desabilitado={zoom >= ZOOM_MAXIMO} aoTocar={() => setZoom((valor) => limitarZoom(valor + 1))} />
        <BotaoDeZoom rotulo="Afastar" icone="menos" desabilitado={zoom <= ZOOM_MINIMO} aoTocar={() => setZoom((valor) => limitarZoom(valor - 1))} />
      </View>

      <View pointerEvents="none" style={estilos.atribuicao}>
        <Texto variante="mini" cor="conteudoSuave">
          {ATRIBUICAO_DOS_BLOCOS}
        </Texto>
      </View>
    </View>
  );
}

function BotaoDeZoom({ rotulo, icone, desabilitado, aoTocar }: { rotulo: string; icone: "mais" | "menos"; desabilitado: boolean; aoTocar: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={rotulo} accessibilityState={{ disabled: desabilitado }} disabled={desabilitado} onPress={aoTocar} style={({ pressed }) => [estilos.botaoZoom, (pressed || desabilitado) && estilos.apagado]}>
      <Icone nome={icone} tamanho={20} />
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  mapa: { backgroundColor: Cores.superficieSuave, borderColor: Cores.borda, borderRadius: Raio.bloco, borderWidth: 1, height: ALTURA, overflow: "hidden" },
  blocos: { left: 0, position: "absolute", top: 0 },
  bloco: { height: TAMANHO_DO_BLOCO, position: "absolute", width: TAMANHO_DO_BLOCO },
  // Centralizado na horizontal e com a base (a ponta do marcador) na metade da altura.
  marcador: { alignItems: "center", bottom: "50%", left: 0, position: "absolute", right: 0 },
  zoom: { gap: 8, position: "absolute", right: 8, top: 8 },
  botaoZoom: { alignItems: "center", backgroundColor: Cores.superficie, borderColor: Cores.borda, borderRadius: Raio.compacto, borderWidth: 1, height: 44, justifyContent: "center", width: 44 },
  apagado: { opacity: 0.5 },
  atribuicao: { backgroundColor: "rgba(255,255,255,0.8)", bottom: 0, paddingHorizontal: 4, position: "absolute", right: 0 },
});
