"use client";

import { useEffect, useRef, useState, type HTMLAttributes, type ReactNode } from "react";
import { pistasDeRolagem } from "./rolagem-horizontal";

/*
 * FAIXA QUE ROLA NA HORIZONTAL com uma pista discreta de que há mais para o lado: a borda onde existe
 * conteúdo escondido ESMAECE (máscara), deixando à vista o começo do próximo item. Sem seta e sem
 * faixa colorida por cima — nada cobre texto, preço ou botão.
 *
 * A pista só existe quando há o que rolar e some do lado em que a pessoa chegou ao fim. É recalculada
 * ao rolar (toque, mouse, teclado), quando a faixa muda de largura e quando o conteúdo muda.
 */
const ESMAECER = "1.75rem";

export function FaixaRolavel({ children, className = "", ...props }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  const faixa = useRef<HTMLDivElement | null>(null);
  const [pistas, setPistas] = useState({ inicio: false, fim: false });

  useEffect(() => {
    const elemento = faixa.current;
    if (!elemento) return;
    const medir = () => {
      const novas = pistasDeRolagem(elemento);
      setPistas((atuais) => (atuais.inicio === novas.inicio && atuais.fim === novas.fim ? atuais : novas));
    };
    medir();
    elemento.addEventListener("scroll", medir, { passive: true });
    // Largura da faixa (janela, painel) e do conteúdo (itens entrando/saindo, fonte carregando).
    const observador = new ResizeObserver(medir);
    observador.observe(elemento);
    for (const filho of elemento.children) observador.observe(filho);
    return () => {
      elemento.removeEventListener("scroll", medir);
      observador.disconnect();
    };
  }, [children]);

  const mascara =
    pistas.inicio || pistas.fim
      ? `linear-gradient(to right, ${pistas.inicio ? "transparent" : "black"} 0, black ${ESMAECER}, black calc(100% - ${ESMAECER}), ${pistas.fim ? "transparent" : "black"} 100%)`
      : undefined;

  return (
    <div
      {...props}
      ref={faixa}
      data-faixa-rolavel
      data-mais-no-inicio={pistas.inicio ? "" : undefined}
      data-mais-no-fim={pistas.fim ? "" : undefined}
      /*
       * `relative`: filhos posicionados (ex.: o controle nativo escondido de cada opção) passam a ser
       * contidos e cortados por ESTA faixa. Sem isso eles se posicionam em relação à página e, estando
       * à direita do que cabe na tela, alargam o documento inteiro — rolagem horizontal na página.
       */
      className={`relative overflow-x-auto ${className}`}
      style={{ ...props.style, maskImage: mascara, WebkitMaskImage: mascara }}
    >
      {children}
    </div>
  );
}
