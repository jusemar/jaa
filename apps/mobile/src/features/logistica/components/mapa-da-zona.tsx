import { MINIMO_VERTICES_ZONA, type Coordenadas, type PoligonoZona } from "@jaa/contratos";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Modal, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Botao } from "@/components/ui/botao";
import { Aviso } from "@/components/ui/superficies";
import { Texto } from "@/components/ui/texto";
import { Cores, Espaco, Raio } from "@/constants/theme";
import { COR_DO_MARCADOR, ESTILO_DO_MAPA_DE_PONTO, pontoDoEvento, posicaoNoMapa } from "@/features/enderecos/lib/mapa-ponto-mapbox";
import { MENSAGEM_MAPA_INDISPONIVEL, MENSAGEM_TOKEN_RECUSADO, conferirTokenDoMapa, obterMapbox, situacaoDoMapa } from "@/features/entregas/lib/mapbox-nativo";
import { criarEditorVerticesZona } from "../lib/editor-vertices-zona";
import { centroDoRotulo, geojsonDasReferencias, geojsonDoContorno, limitesDosVertices } from "../lib/zonas-no-mapa";

/*
 * DESENHO DA ÁREA DA ZONA em tela inteira, com o Mapbox nativo (`@rnmapbox/maps`) — a mesma ligação do
 * mapa da rota e do mapa de ponto. É o equivalente de toque do editor de zonas da Web:
 *
 *   tocar no mapa  → cria um ponto            arrastar um ponto → ajusta
 *   tocar num ponto → seleciona; "Excluir ponto" remove (na Web é o duplo clique)
 *
 * A regra do desenho (vértices, histórico do Desfazer, mínimo de 3 na exclusão) é a MESMA da Web
 * (`editor-vertices-zona.ts`). As outras zonas aparecem só como referência. Nada é gravado aqui: a tela
 * devolve os vértices ao concluir; quem valida geometria e sobreposição é o servidor, em "Salvar zona".
 */
type Mapbox = NonNullable<ReturnType<typeof obterMapbox>>;

export function MapaDaZona({
  titulo,
  centro,
  verticesIniciais,
  outras,
  aoConcluir,
  aoCancelar,
}: {
  titulo: string;
  // Onde o mapa abre quando a área ainda não tem pontos (a base da empresa, quando confirmada).
  centro: Coordenadas;
  verticesIniciais: PoligonoZona;
  outras: readonly { nome: string; vertices: PoligonoZona }[];
  aoConcluir: (vertices: PoligonoZona) => void;
  aoCancelar: () => void;
}) {
  const margens = useSafeAreaInsets();
  const mapbox = obterMapbox();
  const situacao = situacaoDoMapa();
  const [tokenRecusado, setTokenRecusado] = useState(false);
  const [vertices, setVertices] = useState<PoligonoZona>(verticesIniciais);
  // Contorno durante o arraste de um ponto: acompanha o dedo sem virar histórico.
  const [provisorio, setProvisorio] = useState<PoligonoZona | null>(null);
  const [podeDesfazer, setPodeDesfazer] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [selecionado, setSelecionado] = useState<number | null>(null);

  const editor = useRef<ReturnType<typeof criarEditorVerticesZona> | null>(null);
  editor.current ??= criarEditorVerticesZona({
    verticesIniciais,
    aoRedesenhar: () => setProvisorio(null),
    aoMoverProvisorio: setProvisorio,
    aoMudarVertices: (novos) => {
      setVertices(novos);
      setSelecionado(null);
      setAviso(null);
    },
    aoMudarPodeDesfazer: setPodeDesfazer,
    aoBloquearExclusao: () => setAviso("A área precisa manter pelo menos 3 pontos."),
  });

  // Token com restrição por URL deixaria o mapa em branco: a tela diz o motivo em vez disso.
  useEffect(() => {
    if (situacaoDoMapa() !== "pronto") return;
    let ativo = true;
    void conferirTokenDoMapa().then((resultado) => ativo && setTokenRecusado(resultado === "recusado"));
    return () => {
      ativo = false;
    };
  }, []);

  function concluir() {
    if (vertices.length < MINIMO_VERTICES_ZONA) {
      setAviso(`Marque ao menos ${MINIMO_VERTICES_ZONA} pontos antes de concluir.`);
      return;
    }
    aoConcluir(vertices);
  }

  function limpar() {
    Alert.alert("Limpar todos os pontos desta área?", "A zona salva só mudará quando você usar Salvar zona.", [
      { text: "Cancelar", style: "cancel" },
      { text: "Limpar área", style: "destructive", onPress: () => editor.current?.limpar() },
    ]);
  }

  const mapaPronto = mapbox !== null && !tokenRecusado;

  return (
    <Modal animationType="slide" presentationStyle="fullScreen" statusBarTranslucent onRequestClose={aoCancelar}>
      <View style={estilos.tela}>
        <View style={[estilos.topo, { paddingTop: margens.top + Espaco.dois }]}>
          <Texto variante="corpoForte" numberOfLines={1}>
            {titulo}
          </Texto>
          <Texto variante="pequeno" cor="conteudoSuave">
            Toque no mapa para criar pontos e arraste um ponto para ajustar. Para excluir, toque no ponto.
          </Texto>
          <View style={estilos.acoes}>
            <Botao rotulo="Cancelar" aparencia="secundario" compacto onPress={aoCancelar} />
            <Botao rotulo="Desfazer" aparencia="secundario" compacto disabled={!mapaPronto || !podeDesfazer} onPress={() => editor.current?.desfazer()} />
            <Botao rotulo="Limpar área" aparencia="secundario" compacto disabled={!mapaPronto || vertices.length === 0} onPress={limpar} />
            <Botao rotulo="Concluir" compacto disabled={!mapaPronto} onPress={concluir} />
          </View>
        </View>

        <View style={estilos.mapa}>
          {mapbox && !tokenRecusado ? (
            <Desenho
              mapbox={mapbox}
              centro={centro}
              verticesIniciais={verticesIniciais}
              vertices={vertices}
              contorno={provisorio ?? vertices}
              outras={outras}
              selecionado={selecionado}
              aoTocarNoMapa={(ponto) => editor.current?.adicionar(ponto)}
              aoSelecionar={setSelecionado}
              aoIniciarArraste={() => editor.current?.iniciarArraste()}
              aoArrastar={(indice, ponto) => editor.current?.moverDuranteArraste(indice, ponto)}
              aoSoltar={(indice, ponto) => editor.current?.concluirArraste(indice, ponto)}
            />
          ) : (
            <View style={estilos.semMapa}>
              <Aviso tom={tokenRecusado ? "erro" : "atencao"}>{tokenRecusado ? MENSAGEM_TOKEN_RECUSADO : situacao === "pronto" ? "O mapa não pôde ser aberto." : MENSAGEM_MAPA_INDISPONIVEL[situacao].replace("o mapa da rota", "o mapa de zonas")}</Aviso>
            </View>
          )}
        </View>

        <View style={[estilos.rodape, { paddingBottom: margens.bottom + Espaco.tres }]}>
          <View style={estilos.linha}>
            <Texto variante="corpoMedio" style={estilos.flex}>
              {vertices.length} {vertices.length === 1 ? "ponto" : "pontos"}
              {selecionado !== null ? ` · ponto ${selecionado + 1} selecionado` : ""}
            </Texto>
            {selecionado !== null && <Botao rotulo={`Excluir ponto ${selecionado + 1}`} aparencia="perigo" compacto onPress={() => editor.current?.excluir(selecionado)} />}
          </View>
          {aviso && (
            <Texto variante="pequeno" cor="aviso" accessibilityLiveRegion="polite">
              {aviso}
            </Texto>
          )}
        </View>
      </View>
    </Modal>
  );
}

function Desenho({
  mapbox,
  centro,
  verticesIniciais,
  vertices,
  contorno,
  outras,
  selecionado,
  aoTocarNoMapa,
  aoSelecionar,
  aoIniciarArraste,
  aoArrastar,
  aoSoltar,
}: {
  mapbox: Mapbox;
  centro: Coordenadas;
  verticesIniciais: PoligonoZona;
  vertices: PoligonoZona;
  contorno: PoligonoZona;
  outras: readonly { nome: string; vertices: PoligonoZona }[];
  selecionado: number | null;
  aoTocarNoMapa: (ponto: Coordenadas) => void;
  aoSelecionar: (indice: number | null) => void;
  aoIniciarArraste: () => void;
  aoArrastar: (indice: number, ponto: Coordenadas) => void;
  aoSoltar: (indice: number, ponto: Coordenadas) => void;
}) {
  const { MapView, Camera, ShapeSource, FillLayer, LineLayer, PointAnnotation, MarkerView } = mapbox;
  // A câmera abre uma vez (enquadrando a área existente): desenhar não leva o mapa junto.
  const [abertura] = useState(() => ({ limites: limitesDosVertices(verticesIniciais), centro: posicaoNoMapa(verticesIniciais[0] ?? centro) }));
  const referencias = useMemo(() => geojsonDasReferencias(outras), [outras]);
  const forma = useMemo(() => geojsonDoContorno(contorno), [contorno]);

  return (
    <MapView
      style={StyleSheet.absoluteFill}
      styleURL={ESTILO_DO_MAPA_DE_PONTO}
      scaleBarEnabled={false}
      pitchEnabled={false}
      rotateEnabled={false}
      logoEnabled
      attributionEnabled
      onPress={(evento) => {
        // Tocar fora dos pontos com um selecionado só desfaz a seleção; senão, cria um ponto.
        if (selecionado !== null) {
          aoSelecionar(null);
          return;
        }
        const ponto = pontoDoEvento(evento);
        if (ponto) aoTocarNoMapa(ponto);
      }}>
      {abertura.limites ? (
        <Camera defaultSettings={{ bounds: { ne: abertura.limites.nordeste, sw: abertura.limites.sudoeste, paddingTop: 64, paddingBottom: 64, paddingLeft: 48, paddingRight: 48 } }} animationDuration={0} />
      ) : (
        <Camera defaultSettings={{ centerCoordinate: abertura.centro, zoomLevel: 14 }} animationDuration={0} />
      )}

      {/* As OUTRAS zonas, só para referência visual (ajudam a não invadir a vizinha). */}
      <ShapeSource id="zonas-referencia" shape={referencias}>
        <FillLayer id="zonas-referencia-fundo" style={{ fillColor: Cores.conteudoSuave, fillOpacity: 0.12 }} />
        <LineLayer id="zonas-referencia-linha" style={{ lineColor: Cores.conteudoSuave, lineWidth: 1.5, lineDasharray: [2, 2] }} />
      </ShapeSource>
      {outras.map((outra) => {
        const centroDaOutra = centroDoRotulo(outra.vertices);
        return centroDaOutra ? (
          <MarkerView key={outra.nome} coordinate={posicaoNoMapa(centroDaOutra)} allowOverlap>
            <View pointerEvents="none" style={estilos.rotulo}>
              <Texto variante="pequenoForte">{outra.nome}</Texto>
            </View>
          </MarkerView>
        ) : null;
      })}

      <ShapeSource id="zona-atual" shape={forma}>
        <FillLayer id="zona-atual-fundo" filter={["==", ["geometry-type"], "Polygon"]} style={{ fillColor: COR_DO_MARCADOR, fillOpacity: 0.2 }} />
        <LineLayer id="zona-atual-linha" style={{ lineColor: COR_DO_MARCADOR, lineWidth: 3, lineJoin: "round" }} />
      </ShapeSource>

      {vertices.map((vertice, indice) => (
        <PointAnnotation
          // A chave leva a posição: mudou o ponto (ou a numeração), o marcador é refeito.
          key={`${indice}:${vertice.latitude}:${vertice.longitude}:${selecionado === indice ? "s" : "n"}`}
          id={`vertice-${indice}`}
          coordinate={posicaoNoMapa(vertice)}
          draggable
          onSelected={() => aoSelecionar(indice)}
          onDragStart={() => {
            aoSelecionar(null);
            aoIniciarArraste();
          }}
          onDrag={(evento) => {
            const ponto = pontoDoEvento(evento);
            if (ponto) aoArrastar(indice, ponto);
          }}
          onDragEnd={(evento) => {
            const ponto = pontoDoEvento(evento);
            aoSoltar(indice, ponto ?? vertice);
          }}>
          {/* Caixa + círculo, como o marcador do mapa de ponto: o fundo do círculo sai opaco na imagem do marcador. */}
          <View collapsable={false} accessibilityLabel={`Ponto ${indice + 1}`} style={estilos.caixaDoVertice}>
            <View style={[estilos.vertice, selecionado === indice && estilos.verticeSelecionado]}>
              <Texto variante="pequenoForte" cor={selecionado === indice ? "marcaConteudo" : "conteudo"}>
                {indice + 1}
              </Texto>
            </View>
          </View>
        </PointAnnotation>
      ))}
    </MapView>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  tela: { backgroundColor: Cores.superficie, flex: 1 },
  topo: { borderBottomColor: Cores.borda, borderBottomWidth: 1, gap: Espaco.dois, paddingBottom: Espaco.dois, paddingHorizontal: Espaco.tres },
  acoes: { flexDirection: "row", flexWrap: "wrap", gap: Espaco.dois },
  mapa: { backgroundColor: Cores.superficieSuave, flex: 1 },
  semMapa: { padding: Espaco.quatro },
  rodape: { borderTopColor: Cores.borda, borderTopWidth: 1, gap: Espaco.um, paddingHorizontal: Espaco.quatro, paddingTop: Espaco.tres },
  linha: { alignItems: "center", flexDirection: "row", gap: Espaco.dois, minHeight: 36 },
  rotulo: { backgroundColor: "rgba(255,255,255,0.85)", borderRadius: Raio.compacto, paddingHorizontal: 6, paddingVertical: 2 },
  caixaDoVertice: { alignItems: "center", height: 36, justifyContent: "center", width: 36 },
  vertice: { alignItems: "center", backgroundColor: Cores.superficie, borderColor: COR_DO_MARCADOR, borderRadius: 15, borderWidth: 3, height: 30, justifyContent: "center", width: 30 },
  verticeSelecionado: { backgroundColor: COR_DO_MARCADOR },
});
