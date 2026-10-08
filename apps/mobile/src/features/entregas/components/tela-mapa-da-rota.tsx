import { formatarEnderecoResumido, proximaParada, type SaidaEntrega } from "@jaa/contratos";
import * as Location from "expo-location";
import { useEffect, useMemo, useState } from "react";
import { Linking, Modal, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Botao } from "@/components/ui/botao";
import { Icone } from "@/components/ui/icone";
import { Aviso } from "@/components/ui/superficies";
import { Texto } from "@/components/ui/texto";
import { ALTURA_TOQUE, Cores, Espaco } from "@/constants/theme";
import { desenhoDaRota, linhaDoPercurso } from "../lib/mapa-rota";
import { MENSAGEM_MAPA_INDISPONIVEL, MENSAGEM_TOKEN_RECUSADO, conferirTokenDoMapa, obterMapbox, situacaoDoMapa } from "../lib/mapbox-nativo";
import { quantidadeDeEntregas, tituloDaRota, trajetoCurto, urlDeNavegacao } from "../lib/minhas-entregas";

/*
 * MAPA DA ROTA em tela própria: o mapa ocupa a tela inteira (dá para arrastar e aproximar sem brigar
 * com a rolagem da lista) e a próxima parada fica numa faixa embaixo, com "Navegar".
 *
 * Mapbox, como na Web. O que aparece é o que a API guardou para ESTA ordem: a base, as paradas
 * numeradas (a próxima em destaque) e o traçado REAL pelas ruas — quando não há percurso real,
 * nenhuma linha é desenhada. A posição do entregador é a do próprio aparelho, só para ele se situar.
 */
export function TelaMapaDaRota({ saida, aoFechar }: { saida: SaidaEntrega; aoFechar: () => void }) {
  const margens = useSafeAreaInsets();
  const desenho = useMemo(() => desenhoDaRota(saida), [saida]);
  const [mostrarOndeEstou, setMostrarOndeEstou] = useState(false);
  const [tokenRecusado, setTokenRecusado] = useState(false);
  const situacao = situacaoDoMapa();
  const mapbox = obterMapbox();
  const proxima = proximaParada(saida);
  const trajeto = trajetoCurto(saida);

  // O ponto azul só aparece se a pessoa já permitiu a localização: abrir o mapa não pede nada.
  useEffect(() => {
    let ativo = true;
    void Location.getForegroundPermissionsAsync()
      .then((permissao) => ativo && setMostrarOndeEstou(permissao.granted))
      .catch(() => undefined);
    return () => {
      ativo = false;
    };
  }, []);

  // Token com restrição por URL deixaria o mapa em branco: a tela diz o motivo em vez disso.
  useEffect(() => {
    if (situacaoDoMapa() !== "pronto") return;
    let ativo = true;
    void conferirTokenDoMapa().then((resultado) => ativo && setTokenRecusado(resultado === "recusado"));
    return () => {
      ativo = false;
    };
  }, []);

  return (
    <Modal animationType="slide" presentationStyle="fullScreen" statusBarTranslucent onRequestClose={aoFechar}>
      <View style={estilos.tela}>
        <View style={[estilos.topo, { paddingTop: margens.top + Espaco.dois }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Voltar para minhas entregas" hitSlop={8} onPress={aoFechar} style={({ pressed }) => [estilos.voltar, pressed && estilos.apagado]}>
            <Icone nome="voltar" tamanho={22} cor="conteudo" />
          </Pressable>
          <View style={estilos.tituloDoTopo}>
            <Texto variante="corpoForte" numberOfLines={1}>
              {tituloDaRota(saida)} · {saida.empresa.nome}
            </Texto>
            <Texto variante="pequeno" cor="conteudoSuave" numberOfLines={1}>
              {quantidadeDeEntregas(saida)}
              {trajeto ? ` · ${trajeto}` : ""}
            </Texto>
          </View>
        </View>

        <View style={estilos.mapa}>
          {tokenRecusado ? (
            <View style={estilos.aviso}>
              <Aviso tom="erro">{MENSAGEM_TOKEN_RECUSADO}</Aviso>
            </View>
          ) : mapbox && desenho.limites ? (
            <MapaMapbox mapbox={mapbox} desenho={desenho} mostrarOndeEstou={mostrarOndeEstou} />
          ) : (
            <View style={estilos.aviso}>
              <Aviso tom="atencao">{situacao === "pronto" ? "Esta rota não tem paradas ativas para mostrar." : MENSAGEM_MAPA_INDISPONIVEL[situacao]}</Aviso>
            </View>
          )}
        </View>

        <View style={[estilos.rodape, { paddingBottom: margens.bottom + Espaco.tres }]}>
          {/* A mesma linguagem do mapa, nomeada uma vez: base, você (entregador) e cliente. */}
          {mapbox && !tokenRecusado && (
            <View accessibilityLabel="Legenda do mapa" style={estilos.legenda}>
              {desenho.base && <ItemDaLegenda icone="base" rotulo="Base" />}
              {mostrarOndeEstou && <ItemDaLegenda icone="entregador" rotulo="Você" />}
              <ItemDaLegenda icone="cliente" rotulo="Cliente" />
            </View>
          )}
          {mapbox && !tokenRecusado && !desenho.tracado && (
            <Texto variante="mini" cor="conteudoSuave">
              Sem trajeto calculado pelas ruas para esta ordem: o mapa mostra só os pontos.
            </Texto>
          )}
          {proxima ? (
            <View style={estilos.proxima}>
              <View style={estilos.textoDaProxima}>
                <Texto variante="miniForte" cor="marca" style={estilos.maiusculas}>
                  Próxima parada · Pedido #{proxima.numeroPedido}
                </Texto>
                <Texto variante="corpoForte" numberOfLines={1}>
                  {proxima.cliente.nomeExibicao}
                </Texto>
                <Texto variante="pequeno" cor="conteudoSuave" numberOfLines={2}>
                  {formatarEnderecoResumido(proxima.destino)} · {proxima.destino.bairro}
                </Texto>
              </View>
              <Botao rotulo="Navegar" onPress={() => void Linking.openURL(urlDeNavegacao(proxima.destino, `Pedido ${proxima.numeroPedido}`)).catch(() => undefined)} />
            </View>
          ) : (
            <Texto variante="pequeno" cor="conteudoSuave">
              Nenhuma parada ativa nesta rota.
            </Texto>
          )}
        </View>
      </View>
    </Modal>
  );
}

function ItemDaLegenda({ icone, rotulo }: { icone: "base" | "entregador" | "cliente"; rotulo: string }) {
  return (
    <View style={estilos.itemDaLegenda}>
      <Icone nome={icone} tamanho={14} cor="conteudoSuave" />
      <Texto variante="mini" cor="conteudoSuave">
        {rotulo}
      </Texto>
    </View>
  );
}

function MapaMapbox({ mapbox, desenho, mostrarOndeEstou }: { mapbox: NonNullable<ReturnType<typeof obterMapbox>>; desenho: ReturnType<typeof desenhoDaRota>; mostrarOndeEstou: boolean }) {
  const { MapView, Camera, ShapeSource, LineLayer, MarkerView, LocationPuck, StyleURL } = mapbox;
  const { limites } = desenho;
  if (!limites) return null;
  // Um ponto só (uma parada, sem base): centraliza nele; com vários, enquadra todos.
  const umPontoSo = limites.nordeste[0] === limites.sudoeste[0] && limites.nordeste[1] === limites.sudoeste[1];

  return (
    <MapView style={estilos.flex} styleURL={StyleURL.Street} scaleBarEnabled={false} logoEnabled attributionEnabled>
      {umPontoSo ? (
        <Camera defaultSettings={{ centerCoordinate: limites.nordeste, zoomLevel: 15 }} animationDuration={0} />
      ) : (
        <Camera defaultSettings={{ bounds: { ne: limites.nordeste, sw: limites.sudoeste, paddingTop: 72, paddingBottom: 72, paddingLeft: 56, paddingRight: 56 } }} bounds={{ ne: limites.nordeste, sw: limites.sudoeste }} padding={{ paddingTop: 72, paddingBottom: 72, paddingLeft: 56, paddingRight: 56 }} animationDuration={0} />
      )}

      {desenho.tracado && (
        <ShapeSource id="percurso-rota" shape={linhaDoPercurso(desenho.tracado)}>
          <LineLayer id="percurso-rota-linha" style={{ lineColor: Cores.marca, lineWidth: 5, lineCap: "round", lineJoin: "round" }} />
        </ShapeSource>
      )}

      {desenho.base && (
        <MarkerView coordinate={desenho.base} allowOverlap>
          <View accessibilityLabel="Base, origem da rota" style={[estilos.marcador, estilos.marcadorBase]}>
            <Icone nome="base" tamanho={18} cor="conteudo" />
          </View>
        </MarkerView>
      )}
      {/* De trás para frente: a próxima parada fica por cima quando os pontos são vizinhos. */}
      {[...desenho.paradas].reverse().map((parada) => (
        <MarkerView key={parada.id} coordinate={parada.posicao} allowOverlap>
          {/* CLIENTE: o ícone diz "é um destino" e o número, a ordem na rota. */}
          <View accessibilityLabel={parada.proxima ? `Cliente, próxima parada, número ${parada.rotulo}` : `Cliente, parada ${parada.rotulo}`} style={[estilos.marcadorCliente, parada.proxima && estilos.marcadorProxima]}>
            <Icone nome="cliente" tamanho={parada.proxima ? 18 : 16} cor={parada.proxima ? "marcaConteudo" : "conteudo"} />
            <Texto variante="pequenoForte" cor={parada.proxima ? "marcaConteudo" : "conteudo"}>
              {parada.rotulo}
            </Texto>
          </View>
        </MarkerView>
      ))}

      {mostrarOndeEstou && <LocationPuck puckBearingEnabled visible />}
    </MapView>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1 },
  tela: { backgroundColor: Cores.superficie, flex: 1 },
  topo: { alignItems: "center", borderBottomColor: Cores.borda, borderBottomWidth: 1, flexDirection: "row", gap: Espaco.dois, paddingBottom: Espaco.dois, paddingHorizontal: Espaco.tres },
  voltar: { alignItems: "center", height: ALTURA_TOQUE, justifyContent: "center", width: ALTURA_TOQUE },
  tituloDoTopo: { flex: 1, minWidth: 0 },
  mapa: { backgroundColor: Cores.superficieSuave, flex: 1 },
  aviso: { padding: Espaco.quatro },
  rodape: { borderTopColor: Cores.borda, borderTopWidth: 1, gap: Espaco.dois, paddingHorizontal: Espaco.quatro, paddingTop: Espaco.tres },
  proxima: { alignItems: "center", flexDirection: "row", gap: Espaco.tres },
  textoDaProxima: { flex: 1, gap: 2, minWidth: 0 },
  maiusculas: { letterSpacing: 0.4, textTransform: "uppercase" },
  marcador: { alignItems: "center", backgroundColor: Cores.superficie, borderColor: Cores.conteudo, borderRadius: 15, borderWidth: 2, height: 30, justifyContent: "center", width: 30 },
  // Cápsula do cliente: ícone + número, pequena o bastante para não tapar a rua.
  marcadorCliente: { alignItems: "center", backgroundColor: Cores.superficie, borderColor: Cores.conteudo, borderRadius: 15, borderWidth: 2, flexDirection: "row", gap: 2, height: 30, justifyContent: "center", paddingHorizontal: 6 },
  legenda: { columnGap: Espaco.quatro, flexDirection: "row", flexWrap: "wrap", rowGap: Espaco.um },
  itemDaLegenda: { alignItems: "center", flexDirection: "row", gap: 4 },
  marcadorProxima: { backgroundColor: Cores.marca, borderColor: Cores.superficie, borderRadius: 18, borderWidth: 3, height: 36, paddingHorizontal: 8 },
  marcadorBase: { borderColor: Cores.conteudoSuave },
  apagado: { opacity: 0.5 },
});
