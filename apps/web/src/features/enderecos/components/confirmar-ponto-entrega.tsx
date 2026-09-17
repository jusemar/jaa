"use client";

import { formatarEnderecoResumido, type Coordenadas, type EnderecoCliente } from "@jaa/contratos";
import { useEffect, useRef, useState } from "react";
import { criarMapaLeaflet } from "../mapa/mapa-leaflet";
import { ATRIBUICAO_TILES, URL_TILES_MAPA } from "../mapa/configuracao-mapa";
import { CENTRO_PADRAO, arredondarCoordenadas, type MapaPonto } from "../mapa/provedor-mapa";

/**
 * "Confirme onde devemos entregar": o cliente confere o ponto no mapa e, se precisar, ajusta.
 *
 * Regras que esta tela respeita:
 * - a coordenada só vira ponto oficial com a AÇÃO EXPLÍCITA "Confirmar ponto de entrega";
 * - ajustar o pin NÃO altera rua, número, bairro ou CEP (nada de reverse geocoding);
 * - a localização do aparelho é só REFERÊNCIA (a pessoa pode pedir para outro endereço), pedida
 *   apenas quando o cliente toca em "Usar minha localização como referência" e nunca armazenada.
 */
export function ConfirmarPontoEntrega({
  endereco,
  sugestao,
  enviando,
  erro,
  aoConfirmar,
  aoCancelar,
}: {
  endereco: EnderecoCliente;
  // Palpite da geocodificação (pode não existir): só serve para abrir o mapa perto.
  sugestao: Coordenadas | null;
  enviando: boolean;
  erro: string | null;
  aoConfirmar: (coordenadas: Coordenadas) => void;
  aoCancelar: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<MapaPonto | null>(null);
  const pontoSalvo = endereco.latitude !== null && endereco.longitude !== null ? { latitude: endereco.latitude, longitude: endereco.longitude } : null;
  const centroInicial = pontoSalvo ?? sugestao ?? CENTRO_PADRAO;
  const [ponto, setPonto] = useState<Coordenadas>(centroInicial);
  const [referencia, setReferencia] = useState<{ situacao: "ausente" | "obtendo" | "erro" | "obtida"; distanciaKm?: number }>({ situacao: "ausente" });

  useEffect(() => {
    const elemento = containerRef.current;
    if (!elemento) return;
    let ativo = true;

    void criarMapaLeaflet({
      elemento,
      centro: centroInicial,
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
  }, [endereco.id]);

  // Só pede a localização do aparelho quando o cliente pede, e explicando para quê.
  function usarLocalizacaoComoReferencia() {
    if (!navigator.geolocation) {
      setReferencia({ situacao: "erro" });
      return;
    }
    setReferencia({ situacao: "obtendo" });
    navigator.geolocation.getCurrentPosition(
      (posicao) => {
        const atual = arredondarCoordenadas({ latitude: posicao.coords.latitude, longitude: posicao.coords.longitude });
        // Comparação apenas informativa: estar longe NÃO impede o pedido.
        setReferencia({ situacao: "obtida", distanciaKm: distanciaAproximadaKm(atual, ponto) });
      },
      () => setReferencia({ situacao: "erro" }),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  return (
    <section aria-label="Confirmar ponto de entrega" className="flex flex-col gap-2 rounded-jaa border border-borda bg-superficie p-3 text-sm">
      <h3 className="font-semibold">Confirme onde devemos entregar</h3>
      <p data-endereco-confirmacao className="text-xs text-conteudo-suave">
        {endereco.apelido} · {formatarEnderecoResumido(endereco)} — {endereco.bairro}, {endereco.cidade}/{endereco.uf}
      </p>
      <p className="text-xs text-conteudo-suave">Confira o ponto no mapa. Se necessário, arraste o mapa para deixar o marcador no local exato da entrega.</p>

      <div className="relative h-64 w-full overflow-hidden rounded-jaa border border-borda">
        <div ref={containerRef} data-mapa-ponto className="h-full w-full" />
        {/* Marcador fixo no centro: o cliente move o mapa embaixo dele (fácil no celular). */}
        <span aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 z-[400] -translate-x-1/2 -translate-y-full text-2xl">
          📍
        </span>
      </div>

      <p data-ponto-selecionado={`${ponto.latitude},${ponto.longitude}`} className="text-xs text-conteudo-suave">
        Marcador posicionado. O endereço digitado não muda: o ponto é só onde entregar.
      </p>

      <div className="flex flex-col gap-1">
        <button type="button" onClick={usarLocalizacaoComoReferencia} className="self-start rounded-jaa border px-2 py-1 text-xs">
          Usar minha localização como referência
        </button>
        <p className="text-xs text-conteudo-suave">Usamos sua localização apenas para ajudar você a conferir o ponto de entrega. Ela não é guardada.</p>
        {referencia.situacao === "obtendo" && <p className="text-xs text-conteudo-suave">Obtendo sua localização…</p>}
        {referencia.situacao === "erro" && <p className="text-xs text-conteudo-suave">Não foi possível obter sua localização. Você pode confirmar o ponto mesmo assim.</p>}
        {referencia.situacao === "obtida" && (
          <p data-referencia-localizacao className="text-xs text-conteudo-suave">
            {(referencia.distanciaKm ?? 0) <= 1
              ? "Você parece estar próximo deste endereço."
              : "Você está longe do endereço selecionado. Confira o ponto de entrega — pedir para outro lugar é normal."}
          </p>
        )}
      </div>

      <div className="flex gap-2">
        <button type="button" data-confirmar-ponto disabled={enviando} onClick={() => aoConfirmar(ponto)} className="rounded bg-marca px-3 py-2 text-white disabled:opacity-50">
          Confirmar ponto de entrega
        </button>
        <button type="button" onClick={aoCancelar} className="rounded-jaa border px-3 py-2">
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
  const x = paraRadianos(b.longitude - a.longitude) * Math.cos(paraRadianos((a.latitude + b.latitude) / 2));
  const y = paraRadianos(b.latitude - a.latitude);
  return Math.sqrt(x * x + y * y) * raioTerraKm;
}
