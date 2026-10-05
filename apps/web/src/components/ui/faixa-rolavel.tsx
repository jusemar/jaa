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
// As três máscaras possíveis, por extenso: o Tailwind só gera classes que existem inteiras no código.
const MASCARA = {
  inicio: "[mask-image:linear-gradient(to_right,transparent_0,black_1.75rem,black_100%)]",
  fim: "[mask-image:linear-gradient(to_right,black_0,black_calc(100%_-_1.75rem),transparent_100%)]",
  ambos: "[mask-image:linear-gradient(to_right,transparent_0,black_1.75rem,black_calc(100%_-_1.75rem),transparent_100%)]",
} as const;

export function FaixaRolavel({ children, className = "", ...props }: Omit<HTMLAttributes<HTMLDivElement>, "style"> & { children: ReactNode }) {
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

  const mascara = pistas.inicio && pistas.fim ? MASCARA.ambos : pistas.inicio ? MASCARA.inicio : pistas.fim ? MASCARA.fim : "";

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
      className={`relative overflow-x-auto ${mascara} ${className}`}
    >
      {children}
    </div>
  );
}
