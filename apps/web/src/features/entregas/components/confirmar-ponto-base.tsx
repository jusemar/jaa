"use client";

import { formatarEnderecoResumido, type BaseEmpresa, type Coordenadas } from "@jaa/contratos";
import { useEffect, useRef, useState } from "react";
import { ATRIBUICAO_TILES, URL_TILES_MAPA } from "@/features/enderecos/mapa/configuracao-mapa";
import { criarMapaLeaflet } from "@/features/enderecos/mapa/mapa-leaflet";
import { CENTRO_PADRAO, type MapaPonto } from "@/features/enderecos/mapa/provedor-mapa";

/**
 * "Onde fica a base?": a empresa confirma no mapa o ponto exato de onde os entregadores saem.
 *
 * Mesmas regras do ponto de entrega do cliente: o mapa NÃO corrige o endereço digitado, a coordenada
 * só passa a valer com a ação explícita de confirmar, e mudar o endereço estrutural derruba a
 * confirmação anterior. O raio é a ÁREA DA BASE (para detectar quem chegou), não a região de entrega.
 */
export function ConfirmarPontoBase({
  base,
  enviando,
  erro,
  aoConfirmar,
  aoCancelar,
}: {
  base: BaseEmpresa;
  enviando: boolean;
  erro: string | null;
  aoConfirmar: (coordenadas: Coordenadas) => void;
  aoCancelar: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<MapaPonto | null>(null);
  const pontoSalvo = base.latitude !== null && base.longitude !== null ? { latitude: base.latitude, longitude: base.longitude } : null;
  const centroInicial = pontoSalvo ?? CENTRO_PADRAO;
  const [ponto, setPonto] = useState<Coordenadas>(centroInicial);

  useEffect(() => {
    const elemento = containerRef.current;
    if (!elemento) return;
    let ativo = true;

    void criarMapaLeaflet({ elemento, centro: centroInicial, aoMoverPonto: setPonto, urlTiles: URL_TILES_MAPA, atribuicao: ATRIBUICAO_TILES }).then((mapa) => {
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
    // Monta uma vez: mover o pin não deve recriar o mapa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section aria-label="Confirmar ponto da base" className="flex flex-col gap-2 rounded-jaa border border-borda bg-superficie p-3 text-sm">
      <h3 className="font-semibold">Confirme o ponto exato da base</h3>
      <p data-endereco-base className="text-xs text-conteudo-suave">
        {formatarEnderecoResumido(base)} — {base.bairro}, {base.cidade}/{base.uf}
      </p>
      <p className="text-xs text-conteudo-suave">
        Arraste o mapa para deixar o marcador na porta de saída dos entregadores. O endereço digitado não muda: o ponto é só a referência da base.
      </p>

      <div className="relative h-64 w-full overflow-hidden rounded-jaa border border-borda">
        <div ref={containerRef} data-mapa-base className="h-full w-full" />
        {/* Marcador fixo no centro: move-se o mapa embaixo dele (fácil no celular). */}
        <span aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 z-[400] -translate-x-1/2 -translate-y-full text-2xl">
          📍
        </span>
      </div>

      <p data-ponto-base={`${ponto.latitude},${ponto.longitude}`} className="text-xs text-conteudo-suave">
        Quem estiver a até {base.raioMetros} m deste ponto é considerado na base.
      </p>

      <div className="flex gap-2">
        <button type="button" data-confirmar-ponto-base disabled={enviando} onClick={() => aoConfirmar(ponto)} className="rounded bg-marca px-3 py-2 text-white disabled:opacity-50">
          Confirmar ponto da base
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
