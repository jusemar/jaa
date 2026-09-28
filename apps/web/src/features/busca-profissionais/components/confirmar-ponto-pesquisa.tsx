"use client";

import type { Coordenadas } from "@jaa/contratos";
import { useEffect, useRef, useState } from "react";
import { Botao } from "@/components/ui/primitivos";
import { criarMapaPontoPreferido } from "@/features/enderecos/mapa/mapa-mapbox";
import type { MapaPonto } from "@/features/enderecos/mapa/provedor-mapa";

/**
 * Confere o LOCAL DA PESQUISA no mapa (mesmo mapa de ponto da base e do checkout). O ponto só passa
 * a valer em "Usar este ponto"; nada aqui grava endereço ou base — é só o parâmetro da pesquisa.
 */
export function ConfirmarPontoPesquisa({
  centro,
  pontoInicial,
  orientacao,
  aoConfirmar,
  aoCancelar,
}: {
  centro: Coordenadas;
  // null = sem palpite: a pessoa toca no local exato.
  pontoInicial: Coordenadas | null;
  orientacao: string;
  aoConfirmar: (ponto: Coordenadas) => void;
  aoCancelar: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ponto, setPonto] = useState<Coordenadas | null>(pontoInicial);

  useEffect(() => {
    const elemento = containerRef.current;
    if (!elemento) return;
    let ativo = true;
    let mapa: MapaPonto | null = null;
    void criarMapaPontoPreferido({ elemento, centro, pontoInicial, aoMoverPonto: setPonto }).then((criado) => {
      if (!ativo) criado.destruir();
      else mapa = criado;
    });
    return () => {
      ativo = false;
      mapa?.destruir();
    };
    // Monta uma vez por abertura: mover o marcador não recria o mapa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-conteudo-suave">{orientacao}</p>
      <div ref={containerRef} data-mapa-local-pesquisa className="h-64 w-full overflow-hidden rounded-jaa-compacto border border-borda" aria-label="Mapa do local da pesquisa" role="application" />
      <div className="flex flex-wrap gap-2">
        <Botao disabled={!ponto} onClick={() => ponto && aoConfirmar(ponto)}>
          Usar este ponto
        </Botao>
        <Botao aparencia="discreto" onClick={aoCancelar}>
          Voltar
        </Botao>
      </div>
    </div>
  );
}
