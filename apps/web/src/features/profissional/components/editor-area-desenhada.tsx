"use client";

import { MINIMO_VERTICES_ZONA, zonaTemGeometriaValida, type Coordenadas, type PoligonoZona } from "@jaa/contratos";
import { useEffect, useRef, useState } from "react";
import { Botao } from "@/components/ui/primitivos";
import { criarMapaZonaPreferido } from "@/features/entregas/mapa/mapa-zona-mapbox";
import type { MapaZona } from "@/features/entregas/mapa/provedor-mapa-zona";

/** Por que ainda não dá para concluir o desenho (null = pode concluir). */
export function problemaDoDesenho(vertices: PoligonoZona): string | null {
  if (vertices.length < MINIMO_VERTICES_ZONA) return `Marque ao menos ${MINIMO_VERTICES_ZONA} pontos.`;
  if (!zonaTemGeometriaValida(vertices)) return "As linhas da área não podem se cruzar.";
  return null;
}

/**
 * "Desenhar no mapa": tela cheia com o MESMO editor de área das zonas de entrega (`CriarMapaZona`,
 * Mapbox). Aqui só existe o enquadramento da tela; marcar, arrastar, excluir e desfazer são do
 * editor. Nada é salvo aqui: "Concluir" devolve os vértices e quem salva é a etapa Área.
 */
export function EditorAreaDesenhada({
  titulo,
  centro,
  verticesIniciais,
  outrosDesenhos,
  aoConcluir,
  aoCancelar,
}: {
  titulo: string;
  // Base confirmada (ou o desenho existente): só onde o mapa ABRE, nunca um ponto salvo.
  centro: Coordenadas;
  verticesIniciais: PoligonoZona;
  // Outras partes da mesma área, só como referência visual.
  outrosDesenhos?: PoligonoZona[];
  aoConcluir: (vertices: PoligonoZona) => void;
  aoCancelar: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<MapaZona | null>(null);
  const [vertices, setVertices] = useState<PoligonoZona>(verticesIniciais);
  const [podeDesfazer, setPodeDesfazer] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const problema = problemaDoDesenho(vertices);

  useEffect(() => {
    const elemento = containerRef.current;
    if (!elemento) return;
    let ativo = true;
    void criarMapaZonaPreferido({
      elemento,
      centro: verticesIniciais[0] ?? centro,
      verticesIniciais,
      enquadrarInicial: true,
      aoMudarVertices: (novos) => {
        setVertices(novos);
        setAviso(null);
      },
      aoMudarPodeDesfazer: setPodeDesfazer,
      aoBloquearExclusao: () => setAviso("A área precisa manter pelo menos 3 pontos."),
      outrasZonas: (outrosDesenhos ?? []).map((desenho, indice) => ({ nome: `Parte ${indice + 2}`, vertices: desenho })),
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
    // Monta uma vez por abertura: marcar ou arrastar pontos não recria o mapa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div data-editor-area-desenhada role="dialog" aria-modal="true" aria-label={titulo} className="fixed inset-0 z-[1000] flex h-dvh w-screen flex-col bg-superficie">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-borda p-2 sm:p-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-conteudo">{titulo}</p>
          <p className="text-xs text-conteudo-suave">Toque no mapa para marcar os cantos. Arraste para ajustar; duplo clique exclui.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Botao aparencia="discreto" onClick={aoCancelar}>
            Cancelar
          </Botao>
          <Botao aparencia="secundario" disabled={!podeDesfazer} onClick={() => mapaRef.current?.desfazer()}>
            Desfazer
          </Botao>
          <Botao aparencia="secundario" disabled={vertices.length === 0} onClick={() => mapaRef.current?.limpar()}>
            Limpar
          </Botao>
          <Botao disabled={problema !== null} onClick={() => aoConcluir(vertices)}>
            Concluir
          </Botao>
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        <div ref={containerRef} data-mapa-area-desenhada className="absolute inset-0" />
      </div>
      <div className="flex min-h-10 items-center justify-between gap-3 border-t border-borda px-3 py-2 text-xs">
        <span>
          {vertices.length} {vertices.length === 1 ? "ponto" : "pontos"}
        </span>
        {(aviso ?? (vertices.length > 0 ? problema : null)) && (
          <span role="status" className="text-aviso">
            {aviso ?? problema}
          </span>
        )}
      </div>
    </div>
  );
}
