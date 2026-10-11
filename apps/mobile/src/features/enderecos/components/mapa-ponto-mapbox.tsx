import type { Coordenadas } from "@jaa/contratos";
import { useEffect, useRef, useState, type ComponentRef } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Icone } from "@/components/ui/icone";
import { Cores, Raio } from "@/constants/theme";
import { conferirTokenDoMapa, obterMapbox } from "@/features/entregas/lib/mapbox-nativo";
import { COR_DO_MARCADOR, ESTILO_DO_MAPA_DE_PONTO, ZOOM_DO_MAPA_DE_PONTO, ZOOM_MAXIMO_DO_MAPA_DE_PONTO, ZOOM_MINIMO_DO_MAPA_DE_PONTO, pontoDoEvento, posicaoNoMapa, proximoZoom } from "../lib/mapa-ponto-mapbox";

type Mapbox = NonNullable<ReturnType<typeof obterMapbox>>;

/**
 * O Mapbox nativo quando ele pode desenhar o mapa; `null` quando não pode (binário sem o SDK, app sem
 * token público, ou token recusado para uso em aplicativo) — aí a tela usa o mapa de blocos de sempre,
 * como a Web cai no Leaflet sem o token. Mesma ligação com o SDK do mapa da rota: uma só.
 */
export function useMapboxDoMapaDePonto(): Mapbox | null {
  const mapbox = obterMapbox();
  const [recusado, setRecusado] = useState(false);

  useEffect(() => {
    if (!mapbox) return;
    let ativo = true;
    void conferirTokenDoMapa().then((resultado) => ativo && setRecusado(resultado === "recusado"));
    return () => {
      ativo = false;
    };
  }, [mapbox]);

  return recusado ? null : mapbox;
}

const ALTURA = 280;

/**
 * MAPA PARA ESCOLHER O PONTO com o Mapbox — o mesmo comportamento do mapa de ponto da Web: o marcador
 * é um objeto real sobre o mapa; TOCAR no mapa ou ARRASTAR o marcador move o ponto. Navegar (arrastar o
 * mapa, aproximar) é só visualização e não muda nada. Nada é confirmado aqui.
 *
 * `centro` é só onde o mapa ABRE; `ponto` é controlado por quem usa (`null` = nenhum marcador até a
 * pessoa tocar no mapa).
 */
export function MapaPontoMapbox({ mapbox, centro, ponto, aoMoverPonto }: { mapbox: Mapbox; centro: Coordenadas; ponto: Coordenadas | null; aoMoverPonto: (ponto: Coordenadas) => void }) {
  const { MapView, Camera, PointAnnotation } = mapbox;
  const camera = useRef<ComponentRef<typeof Camera>>(null);
  const [zoom, setZoom] = useState(ZOOM_DO_MAPA_DE_PONTO);
  // A câmera abre uma vez: mover o ponto não leva o mapa junto (como na Web).
  const [abertura] = useState(() => posicaoNoMapa(centro));

  const mover = (evento: Parameters<typeof pontoDoEvento>[0]) => {
    const novo = pontoDoEvento(evento);
    if (novo) aoMoverPonto(novo);
  };

  function aproximar(passo: 1 | -1) {
    const novo = proximoZoom(zoom, passo);
    setZoom(novo);
    camera.current?.zoomTo(novo, 200);
  }

  return (
    <View accessibilityLabel="Mapa. Toque no local exato ou arraste o marcador para ajustar." style={estilos.mapa}>
      <MapView
        style={StyleSheet.absoluteFill}
        styleURL={ESTILO_DO_MAPA_DE_PONTO}
        scaleBarEnabled={false}
        pitchEnabled={false}
        logoEnabled
        attributionEnabled
        compassEnabled
        compassFadeWhenNorth
        // O mapa fica com o gesto: a lista em volta não rola enquanto a pessoa navega nele.
        requestDisallowInterceptTouchEvent
        onPress={mover}
        onMapIdle={(estado) => setZoom(estado.properties.zoom)}>
        <Camera ref={camera} defaultSettings={{ centerCoordinate: abertura, zoomLevel: ZOOM_DO_MAPA_DE_PONTO }} minZoomLevel={ZOOM_MINIMO_DO_MAPA_DE_PONTO} maxZoomLevel={ZOOM_MAXIMO_DO_MAPA_DE_PONTO} animationDuration={0} />
        {ponto && (
          // A PONTA do marcador é o ponto (âncora embaixo, no meio), como o marcador da Web.
          <PointAnnotation id="ponto-escolhido" coordinate={posicaoNoMapa(ponto)} anchor={{ x: 0.5, y: 1 }} draggable onDragEnd={mover}>
            <Marcador />
          </PointAnnotation>
        )}
      </MapView>

      <View style={estilos.zoom}>
        <BotaoDeZoom rotulo="Aproximar" icone="mais" desabilitado={zoom >= ZOOM_MAXIMO_DO_MAPA_DE_PONTO} aoTocar={() => aproximar(1)} />
        <BotaoDeZoom rotulo="Afastar" icone="menos" desabilitado={zoom <= ZOOM_MINIMO_DO_MAPA_DE_PONTO} aoTocar={() => aproximar(-1)} />
      </View>
    </View>
  );
}

// O marcador padrão do Mapbox na Web: gota com o miolo branco, na mesma cor.
function Marcador() {
  return (
    <View collapsable={false} style={estilos.marcador}>
      <View style={estilos.gota}>
        <View style={estilos.miolo} />
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

const LADO_DA_GOTA = 28;

const estilos = StyleSheet.create({
  mapa: { backgroundColor: Cores.superficieSuave, borderColor: Cores.borda, borderRadius: Raio.bloco, borderWidth: 1, height: ALTURA, overflow: "hidden" },
  // Caixa do marcador: a gota (quadrado girado 45°) ocupa a diagonal, com a ponta no meio da base.
  marcador: { alignItems: "center", height: 40, justifyContent: "flex-start", paddingTop: 6, width: 40 },
  gota: {
    alignItems: "center",
    backgroundColor: COR_DO_MARCADOR,
    borderBottomLeftRadius: LADO_DA_GOTA / 2,
    borderBottomRightRadius: 2,
    borderTopLeftRadius: LADO_DA_GOTA / 2,
    borderTopRightRadius: LADO_DA_GOTA / 2,
    height: LADO_DA_GOTA,
    justifyContent: "center",
    transform: [{ rotate: "45deg" }],
    width: LADO_DA_GOTA,
  },
  miolo: { backgroundColor: "#ffffff", borderRadius: 5, height: 10, width: 10 },
  // Abaixo da bússola do Mapbox (canto superior direito), para os dois nunca se cobrirem.
  zoom: { bottom: 28, gap: 8, position: "absolute", right: 8 },
  botaoZoom: { alignItems: "center", backgroundColor: Cores.superficie, borderColor: Cores.borda, borderRadius: Raio.compacto, borderWidth: 1, height: 44, justifyContent: "center", width: 44 },
  apagado: { opacity: 0.5 },
});
