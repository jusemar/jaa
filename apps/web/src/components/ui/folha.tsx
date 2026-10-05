"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IconeFechar } from "./icones";

/*
 * FOLHA de detalhes (perfil, informações) que se adapta à tela — no lugar de um modal central pequeno:
 * - celular e tablet: sobe de baixo, ocupa a largura toda e até 92% da altura, com rolagem interna;
 * - janela larga (md+): painel na lateral direita, na altura inteira.
 *
 * É desenhada direto no <body> (portal): um ancestral com `transform`, animação ou `overflow` — como a
 * coluna da conversa — deixaria um elemento `fixed` preso e cortado dentro dele.
 *
 * Fecha no X, com Esc e ao clicar fora; a rolagem da página fica travada enquanto aberta. O conteúdo
 * respeita as áreas seguras do aparelho (entalhe, barra de gestos).
 */
export function Folha({ rotulo, aoFechar, children }: { rotulo: string; aoFechar: () => void; children: ReactNode }) {
  // O portal só existe no navegador.
  const [montada, setMontada] = useState(false);
  useEffect(() => {
    void Promise.resolve().then(() => setMontada(true));
  }, []);

  useEffect(() => {
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") aoFechar();
    };
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = anterior;
    };
  }, [aoFechar]);

  if (!montada) return null;

  return createPortal(
    <div data-folha className="fixed inset-0 z-[1000] flex items-end justify-center bg-black/50 md:items-stretch md:justify-end" onClick={aoFechar}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label={rotulo}
        onClick={(evento) => evento.stopPropagation()}
        className="painel-entrando relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-superficie shadow-suave md:h-dvh md:max-h-none md:w-[26rem] md:max-w-[90vw] md:rounded-none md:border-l md:border-borda"
      >
        {/* Alça: sinal visual de folha no celular (o fechar de verdade é o X, o Esc e o fundo). */}
        <span aria-hidden className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-borda md:hidden" />
        <button
          type="button"
          autoFocus
          aria-label="Fechar"
          title="Fechar"
          data-fechar-folha
          onClick={aoFechar}
          className="absolute right-2 top-2 z-10 grid h-11 w-11 place-items-center rounded-full bg-superficie/90 text-conteudo-suave shadow-suave hover:bg-realce hover:text-conteudo"
          style={{ top: "max(0.5rem, env(safe-area-inset-top))", right: "max(0.5rem, env(safe-area-inset-right))" }}
        >
          <IconeFechar className="h-5 w-5" />
        </button>
        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-3"
          style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))", paddingRight: "max(1.25rem, env(safe-area-inset-right))" }}
        >
          {children}
        </div>
      </section>
    </div>,
    document.body,
  );
}
