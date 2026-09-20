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
  sugestao,
  enviando,
  erro,
  aoConfirmar,
  aoCancelar,
}: {
  base: BaseEmpresa;
  sugestao: Coordenadas | null;
  enviando: boolean;
  erro: string | null;
  aoConfirmar: (coordenadas: Coordenadas) => void;
  aoCancelar: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<MapaPonto | null>(null);
  const pontoSalvo = base.latitude !== null && base.longitude !== null ? { latitude: base.latitude, longitude: base.longitude } : null;
  // CENTRO_PADRAO serve só para ABRIR o mapa em algum lugar quando não há ponto: ele nunca é um ponto.
  const centroInicial = pontoSalvo ?? sugestao ?? CENTRO_PADRAO;
  /*
   * Confirmável só o que veio de algo real: o ponto já confirmado antes ou o que o gestor marcar no
   * mapa. Nascendo com o CENTRO_PADRAO, abrir a tela e clicar em confirmar gravava o centro de Belo
   * Horizonte como sendo a base — foi o que aconteceu no fluxo do endereço de entrega.
   */
  const [ponto, setPonto] = useState<Coordenadas | null>(pontoSalvo ?? sugestao);

  useEffect(() => {
    const elemento = containerRef.current;
    if (!elemento) return;
    let ativo = true;

    void criarMapaLeaflet({ elemento, centro: centroInicial, pontoInicial: pontoSalvo ?? sugestao, aoMoverPonto: setPonto, urlTiles: URL_TILES_MAPA, atribuicao: ATRIBUICAO_TILES }).then((mapa) => {
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
        Arraste o marcador (ou toque no mapa) para deixá-lo na porta de saída dos entregadores. O endereço digitado não muda: o ponto é só a referência da base.
      </p>

      <div className="h-64 w-full overflow-hidden rounded-jaa border border-borda">
        <div ref={containerRef} data-mapa-base className="h-full w-full" />
      </div>

      {ponto ? (
        <p data-ponto-base={`${ponto.latitude},${ponto.longitude}`} className="text-xs text-conteudo-suave">
          Quem estiver a até {base.raioMetros} m deste ponto é considerado na base.
        </p>
      ) : (
        <p data-ponto-base-pendente className="text-xs text-aviso">
          Toque no mapa para marcar a porta de saída dos entregadores e liberar a confirmação.
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          data-confirmar-ponto-base
          disabled={enviando || !ponto}
          onClick={() => ponto && aoConfirmar(ponto)}
          className="rounded bg-marca px-3 py-2 text-white disabled:opacity-50"
        >
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
