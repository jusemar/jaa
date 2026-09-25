"use client";

import {
  formatarEnderecoResumido,
  type Coordenadas,
  type EnderecoCliente,
} from "@jaa/contratos";
import { useEffect, useRef, useState } from "react";
import { criarMapaLeaflet } from "../mapa/mapa-leaflet";
import { ATRIBUICAO_TILES, URL_TILES_MAPA } from "../mapa/configuracao-mapa";
import { validarCoberturaEntrega } from "../lib/api-enderecos";
import {
  CENTRO_PADRAO,
  arredondarCoordenadas,
  type MapaPonto,
} from "../mapa/provedor-mapa";

/**
 * "Confirme onde devemos entregar": o cliente confere o ponto no mapa e, se precisar, ajusta.
 *
 * Regras que esta tela respeita:
 * - a REFERÊNCIA é sempre o ENDEREÇO informado: ele é geocodificado, o mapa abre ali e o marcador
 *   começa naquele palpite. Onde o celular está não entra nessa conta — pedir de Contagem uma pizza
 *   para a mãe em Belo Horizonte é normal, e a tela não pode tratar isso como erro;
 * - a coordenada só vira ponto oficial com a AÇÃO EXPLÍCITA "Confirmar ponto de entrega";
 * - ajustar o pin NÃO altera rua, número, bairro ou CEP (nada de reverse geocoding);
 * - a localização do aparelho é OPCIONAL: só é pedida se a pessoa tocar em "Usar onde estou agora",
 *   e nunca é armazenada. Sem esse toque, nada é comparado e nenhum aviso de distância aparece.
 */
export function ConfirmarPontoEntrega({
  endereco,
  chaveMapa,
  empresaIdentidadeId,
  sugestao,
  enviando,
  erro,
  aoConfirmar,
  aoCancelar,
}: {
  endereco: Pick<
    EnderecoCliente,
    | "apelido"
    | "cep"
    | "logradouro"
    | "numero"
    | "complemento"
    | "bairro"
    | "cidade"
    | "uf"
    | "pontoReferencia"
  >;
  chaveMapa: string;
  empresaIdentidadeId: string;
  // Palpite da geocodificação (pode não existir): só serve para abrir o mapa perto.
  sugestao: Coordenadas | null;
  enviando: boolean;
  erro: string | null;
  aoConfirmar: (coordenadas: Coordenadas) => void;
  aoCancelar: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<MapaPonto | null>(null);
  const centroInicial = sugestao ?? CENTRO_PADRAO;
  /*
   * O ponto que pode ser confirmado nasce SÓ de algo real: o ponto já confirmado antes, o palpite da
   * geocodificação ou o mapa movido pela pessoa. NUNCA do CENTRO_PADRAO — ele é só onde o mapa abre
   * quando não há nada melhor, e não tem relação nenhuma com o endereço.
   *
   * Antes o estado nascia com o CENTRO_PADRAO e "Confirmar" o gravava mesmo sem o mapa ter sido
   * tocado (ou quando o mapa não respondia): o pedido saía com o destino no centro de BH, e o percurso
   * era calculado até lá (ex.: 19 km a partir de uma base no Barreiro).
   */
  const [ponto, setPonto] = useState<Coordenadas | null>(sugestao);
  const [referencia, setReferencia] = useState<{
    situacao: "ausente" | "obtendo" | "erro" | "obtida";
    distanciaKm?: number;
  }>({ situacao: "ausente" });
  const [cobertura, setCobertura] = useState<
    "pendente" | "validando" | "atendida" | "fora" | "erro"
  >("pendente");

  useEffect(() => {
    const elemento = containerRef.current;
    if (!elemento) return;
    let ativo = true;

    void criarMapaLeaflet({
      elemento,
      centro: centroInicial,
      pontoInicial: sugestao,
      aoMoverPonto: setPonto,
      urlTiles: URL_TILES_MAPA,
      atribuicao: ATRIBUICAO_TILES,
    }).then((mapa) => {
      if (!ativo) {
        mapa.destruir();
        return;
      }
      mapaRef.current = mapa;
    });

    return () => {
      ativo = false;
      mapaRef.current?.destruir();
      mapaRef.current = null;
    };
    // Monta uma vez por endereço: mudar o ponto não deve recriar o mapa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveMapa]);

  useEffect(() => {
    if (!ponto) return;
    let ativo = true;
    queueMicrotask(() => ativo && setCobertura("validando"));
    const temporizador = setTimeout(() => {
      void validarCoberturaEntrega(empresaIdentidadeId, ponto).then(
        (resultado) => {
          if (!ativo) return;
          setCobertura(
            resultado.ok
              ? resultado.dados.atendida
                ? "atendida"
                : "fora"
              : "erro",
          );
        },
      );
    }, 250);
    return () => {
      ativo = false;
      clearTimeout(temporizador);
    };
  }, [empresaIdentidadeId, ponto]);

  // Só pede a localização do aparelho quando o cliente pede, e explicando para quê.
  function usarOndeEstouAgora() {
    if (!navigator.geolocation) {
      setReferencia({ situacao: "erro" });
      return;
    }
    setReferencia({ situacao: "obtendo" });
    navigator.geolocation.getCurrentPosition(
      (posicao) => {
        const atual = arredondarCoordenadas({
          latitude: posicao.coords.latitude,
          longitude: posicao.coords.longitude,
        });
        // Pedido explicitamente: leva o mapa até aqui, de onde a pessoa ajusta o ponto exato.
        mapaRef.current?.centralizar(atual);
        // Comparação só informativa, e só porque ela pediu: estar longe NÃO impede o pedido.
        setReferencia({
          situacao: "obtida",
          distanciaKm: distanciaAproximadaKm(atual, ponto ?? centroInicial),
        });
      },
      () => setReferencia({ situacao: "erro" }),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  return (
    <section
      aria-label="Confirmar ponto de entrega"
      className="flex flex-col gap-2 rounded-jaa border border-borda bg-superficie p-3 text-sm"
    >
      <h3 className="font-semibold">Confirme onde devemos entregar</h3>
      <p data-endereco-confirmacao className="text-xs text-conteudo-suave">
        {endereco.apelido} · {formatarEnderecoResumido(endereco)} —{" "}
        {endereco.bairro}, {endereco.cidade}/{endereco.uf}
      </p>
      <p className="text-xs text-conteudo-suave">
        Confira o ponto no mapa. Se necessário, arraste o marcador (ou toque no
        mapa) para deixá-lo no local exato da entrega. Aproximar e afastar não
        muda o ponto.
      </p>

      <div className="h-64 w-full overflow-hidden rounded-jaa border border-borda">
        <div ref={containerRef} data-mapa-ponto className="h-full w-full" />
      </div>

      {ponto ? (
        <p
          data-ponto-selecionado={`${ponto.latitude},${ponto.longitude}`}
          className="text-xs text-conteudo-suave"
        >
          Marcador posicionado. O endereço digitado não muda: o ponto é só onde
          entregar.
        </p>
      ) : (
        <p data-ponto-pendente className="text-xs text-aviso">
          Toque no mapa para marcar o local exato da entrega e liberar a
          confirmação.
        </p>
      )}

      <div className="flex flex-col gap-1">
        <button
          type="button"
          data-usar-onde-estou
          onClick={usarOndeEstouAgora}
          className="self-start rounded-jaa border px-2 py-1 text-xs"
        >
          Usar onde estou agora
        </button>
        <p className="text-xs text-conteudo-suave">
          Opcional: leva o mapa até onde você está, caso esteja no local da
          entrega. Sua localização não é guardada — e o endereço informado
          continua sendo a referência.
        </p>
        {referencia.situacao === "obtendo" && (
          <p className="text-xs text-conteudo-suave">
            Obtendo sua localização…
          </p>
        )}
        {referencia.situacao === "erro" && (
          <p className="text-xs text-conteudo-suave">
            Não foi possível obter sua localização. Confirme o ponto pelo mapa
            normalmente.
          </p>
        )}
        {referencia.situacao === "obtida" && (
          <p
            data-referencia-localizacao
            className="text-xs text-conteudo-suave"
          >
            {(referencia.distanciaKm ?? 0) <= 1
              ? "Você está perto do ponto marcado."
              : `Você está a cerca de ${Math.round(referencia.distanciaKm ?? 0)} km do ponto marcado — normal quando a entrega é para outro endereço.`}
          </p>
        )}
      </div>

      {cobertura === "fora" ? (
        <p
          data-fora-area
          role="alert"
          className="rounded-jaa border border-aviso bg-aviso/10 p-2 text-sm font-medium text-aviso"
        >
          Esta empresa ainda não realiza entregas neste endereço.
        </p>
      ) : null}
      {cobertura === "erro" ? (
        <p role="alert" className="text-sm text-perigo">
          Não foi possível validar a área de entrega. Tente novamente.
        </p>
      ) : null}

      <div className="flex gap-2">
        <button
          type="button"
          data-confirmar-ponto
          disabled={enviando || !ponto || cobertura !== "atendida"}
          onClick={() => ponto && aoConfirmar(ponto)}
          className="rounded bg-marca px-3 py-2 text-white disabled:opacity-50"
        >
          {cobertura === "validando" ? "Validando área…" : "Salvar endereço"}
        </button>
        <button
          type="button"
          onClick={aoCancelar}
          className="rounded-jaa border px-3 py-2"
        >
          Voltar
        </button>
      </div>

      {erro && (
        <p role="alert" className="text-perigo">
          {erro}
        </p>
      )}
    </section>
  );
}

// Distância aproximada (equirretangular) só para a mensagem de contexto; não é regra de negócio.
function distanciaAproximadaKm(a: Coordenadas, b: Coordenadas): number {
  const raioTerraKm = 6371;
  const paraRadianos = (grau: number) => (grau * Math.PI) / 180;
  const x =
    paraRadianos(b.longitude - a.longitude) *
    Math.cos(paraRadianos((a.latitude + b.latitude) / 2));
  const y = paraRadianos(b.latitude - a.latitude);
  return Math.sqrt(x * x + y * y) * raioTerraKm;
}
