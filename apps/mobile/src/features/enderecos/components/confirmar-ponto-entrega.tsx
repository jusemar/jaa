import { formatarEnderecoResumido, type Coordenadas, type EnderecoCliente } from "@jaa/contratos";
import * as Location from "expo-location";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Botao } from "@/components/ui/botao";
import { Aviso } from "@/components/ui/superficies";
import { Texto } from "@/components/ui/texto";
import { Espaco } from "@/constants/theme";
import { validarCoberturaEntrega } from "../lib/api-enderecos";
import { CENTRO_PADRAO, arredondarCoordenadas, distanciaAproximadaKm } from "../lib/mapa-ponto";
import { MapaPonto } from "./mapa-ponto";

/*
 * "CONFIRME ONDE DEVEMOS ENTREGAR" — a mesma etapa da Web, com as mesmas regras:
 *  - o palpite da geocodificação só serve para ABRIR o mapa perto; quem confirma é a pessoa;
 *  - o mapa não corrige o endereço digitado;
 *  - a localização do aparelho é só referência, pedida ao toque e nunca guardada;
 *  - o servidor diz se a empresa entrega naquele ponto; fora da área não dá para salvar.
 */
type Cobertura = "pendente" | "validando" | "atendida" | "fora" | "erro";

export function ConfirmarPontoEntrega({
  endereco,
  empresaIdentidadeId,
  sugestao,
  enviando,
  erro,
  aoConfirmar,
  aoCancelar,
}: {
  endereco: Pick<EnderecoCliente, "apelido" | "logradouro" | "numero" | "complemento" | "bairro" | "cidade" | "uf">;
  empresaIdentidadeId: string;
  // Palpite da geocodificação ou ponto já salvo (pode não existir): só abre o mapa perto.
  sugestao: Coordenadas | null;
  enviando: boolean;
  erro: string | null;
  aoConfirmar: (coordenadas: Coordenadas) => void;
  aoCancelar: () => void;
}) {
  const [centro, setCentro] = useState<Coordenadas>(sugestao ?? CENTRO_PADRAO);
  // null = ainda não há ponto: sem palpite, a pessoa precisa levar o mapa até o lugar.
  const [ponto, setPonto] = useState<Coordenadas | null>(sugestao);
  const [cobertura, setCobertura] = useState<Cobertura>("pendente");
  const [referencia, setReferencia] = useState<{ situacao: "ausente" | "obtendo" | "erro" | "obtida"; distanciaKm?: number }>({ situacao: "ausente" });

  // Cada vez que o ponto muda, o SERVIDOR confere se a empresa entrega ali (com uma pausa curta).
  useEffect(() => {
    if (!ponto) return;
    let ativo = true;
    const temporizador = setTimeout(() => {
      setCobertura("validando");
      void validarCoberturaEntrega(empresaIdentidadeId, ponto).then((resultado) => {
        if (ativo) setCobertura(resultado.ok ? (resultado.dados.atendida ? "atendida" : "fora") : "erro");
      });
    }, 250);
    return () => {
      ativo = false;
      clearTimeout(temporizador);
    };
  }, [empresaIdentidadeId, ponto]);

  // Estável (o mapa guarda os gestos entre uma pintura e outra).
  const mover = useCallback((novoCentro: Coordenadas) => {
    setCentro(novoCentro);
    setPonto(novoCentro);
  }, []);

  // Só pede a localização do aparelho quando a pessoa pede, e explicando para quê.
  async function usarOndeEstouAgora() {
    setReferencia({ situacao: "obtendo" });
    try {
      const permissao = await Location.requestForegroundPermissionsAsync();
      if (!permissao.granted) {
        setReferencia({ situacao: "erro" });
        return;
      }
      const posicao = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const atual = arredondarCoordenadas({ latitude: posicao.coords.latitude, longitude: posicao.coords.longitude });
      // Comparação só informativa: estar longe NÃO impede o pedido.
      setReferencia({ situacao: "obtida", distanciaKm: distanciaAproximadaKm(atual, ponto ?? centro) });
      // Pedido explicitamente: leva o mapa até aqui, de onde a pessoa ajusta o ponto exato.
      mover(atual);
    } catch {
      setReferencia({ situacao: "erro" });
    }
  }

  return (
    <View accessibilityLabel="Confirmar ponto de entrega" style={estilos.etapa}>
      <Texto variante="corpoForte">Confirme onde devemos entregar</Texto>
      <Texto variante="pequeno" cor="conteudoSuave">
        {endereco.apelido ? `${endereco.apelido} · ` : ""}
        {formatarEnderecoResumido(endereco)} — {endereco.bairro}, {endereco.cidade}/{endereco.uf}
      </Texto>
      <Texto variante="pequeno" cor="conteudoSuave">
        Arraste o mapa até o marcador ficar no local exato da entrega. Aproximar e afastar não muda o ponto.
      </Texto>

      <MapaPonto centro={centro} aoMover={mover} />

      {ponto ? (
        <Texto variante="pequeno" cor="conteudoSuave">
          Marcador posicionado. O endereço digitado não muda: o ponto é só onde entregar.
        </Texto>
      ) : (
        <Texto variante="pequeno" cor="aviso">
          Arraste o mapa para marcar o local exato da entrega e liberar a confirmação.
        </Texto>
      )}

      <View style={estilos.referencia}>
        <Botao rotulo="Usar onde estou agora" aparencia="secundario" compacto carregando={referencia.situacao === "obtendo"} textoCarregando="Obtendo sua localização…" onPress={() => void usarOndeEstouAgora()} />
        <Texto variante="pequeno" cor="conteudoSuave">
          Opcional: leva o mapa até onde você está, caso esteja no local da entrega. Sua localização não é guardada — e o endereço informado continua sendo a referência.
        </Texto>
        {referencia.situacao === "erro" && (
          <Texto variante="pequeno" cor="conteudoSuave">
            Não foi possível obter sua localização. Confirme o ponto pelo mapa normalmente.
          </Texto>
        )}
        {referencia.situacao === "obtida" && (
          <Texto variante="pequeno" cor="conteudoSuave">
            {(referencia.distanciaKm ?? 0) <= 1 ? "Você estava perto do ponto marcado." : `Você estava a cerca de ${Math.round(referencia.distanciaKm ?? 0)} km do ponto marcado antes.`}
          </Texto>
        )}
      </View>

      {cobertura === "fora" && <Aviso tom="atencao">Esta empresa ainda não realiza entregas neste endereço.</Aviso>}
      {cobertura === "erro" && <Aviso tom="erro">Não foi possível validar a área de entrega. Tente novamente.</Aviso>}
      {erro && <Aviso tom="erro">{erro}</Aviso>}

      <View style={estilos.acoes}>
        <View style={estilos.principal}>
          <Botao
            rotulo={cobertura === "validando" ? "Validando área…" : "Salvar endereço"}
            larguraTotal
            carregando={enviando}
            textoCarregando="Salvando…"
            disabled={!ponto || cobertura !== "atendida"}
            onPress={() => ponto && aoConfirmar(ponto)}
          />
        </View>
        <Botao rotulo="Voltar" aparencia="secundario" disabled={enviando} onPress={aoCancelar} />
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  etapa: { gap: Espaco.dois },
  referencia: { alignItems: "flex-start", gap: 6 },
  acoes: { flexDirection: "row", gap: Espaco.dois, marginTop: Espaco.dois },
  principal: { flex: 1 },
});
