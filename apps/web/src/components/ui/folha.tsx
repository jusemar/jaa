"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IconeFechar, IconeVoltar } from "./icones";

/*
 * FOLHA de trabalho/detalhes (perfil, edição de um grupo…) que se adapta à tela — no lugar de um
 * modal central pequeno:
 * - celular e tablet estreito: sobe de baixo, ocupa a largura toda e até 92% da altura, com rolagem
 *   interna;
 * - janela larga (md+): painel na lateral direita, na altura inteira.
 *
 * É desenhada direto no <body> (portal): um ancestral com `transform`, animação ou `overflow` — como a
 * coluna da conversa — deixaria um elemento `fixed` preso e cortado dentro dele.
 *
 * Fecha no X, com Esc e ao clicar fora; a rolagem da página fica travada enquanto aberta. O conteúdo
 * respeita as áreas seguras do aparelho (entalhe, barra de gestos). Quem abre decide o que "fechar"
 * faz (`aoFechar`) — por exemplo, perguntar antes quando há alteração não salva.
 *
 * Com `titulo`, ganha um cabeçalho fixo (e `aoVoltar` para uma etapa interna: a MESMA folha troca de
 * conteúdo, nunca se abre folha sobre folha). `rodape` fica fixo embaixo, acima do teclado/área segura:
 * é onde mora a ação principal da tarefa.
 */
export function Folha({
  rotulo,
  aoFechar,
  children,
  titulo,
  subtitulo,
  aoVoltar,
  rotuloVoltar,
  rodape,
}: {
  rotulo: string;
  aoFechar: () => void;
  children: ReactNode;
  titulo?: string | undefined;
  subtitulo?: string | undefined;
  // Etapa interna da folha: volta para a etapa anterior sem fechar.
  aoVoltar?: (() => void) | undefined;
  rotuloVoltar?: string | undefined;
  rodape?: ReactNode;
}) {
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

  const fechar = (
    <button
      type="button"
      autoFocus
      aria-label="Fechar"
      title="Fechar"
      data-fechar-folha
      onClick={aoFechar}
      className={
        titulo
          ? "grid h-11 w-11 shrink-0 place-items-center rounded-full text-conteudo-suave hover:bg-realce hover:text-conteudo"
          : "absolute right-[max(0.5rem,env(safe-area-inset-right))] top-[max(0.5rem,env(safe-area-inset-top))] z-10 grid h-11 w-11 place-items-center rounded-full bg-superficie/90 text-conteudo-suave shadow-suave hover:bg-realce hover:text-conteudo"
      }
    >
      <IconeFechar className="h-5 w-5" />
    </button>
  );

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

        {titulo ? (
          <header data-cabecalho-folha className="flex shrink-0 items-center gap-1 border-b border-borda py-1 pl-[max(0.25rem,env(safe-area-inset-left))] pr-[max(0.25rem,env(safe-area-inset-right))] md:pt-[max(0.25rem,env(safe-area-inset-top))]">
            {aoVoltar ? (
              <button
                type="button"
                data-voltar-folha
                aria-label={rotuloVoltar ?? "Voltar"}
                title={rotuloVoltar ?? "Voltar"}
                onClick={aoVoltar}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-conteudo-suave hover:bg-realce hover:text-conteudo"
              >
                <IconeVoltar className="h-5 w-5" />
              </button>
            ) : (
              <span aria-hidden className="w-3 shrink-0" />
            )}
            <div className="flex min-w-0 flex-1 flex-col py-1">
              <h2 className="fonte-display truncate text-base font-bold">{titulo}</h2>
              {subtitulo && <p className="truncate text-xs text-conteudo-suave">{subtitulo}</p>}
            </div>
            {fechar}
          </header>
        ) : (
          fechar
        )}

        <div
          data-corpo-folha
          className={`min-h-0 flex-1 overflow-y-auto overscroll-contain pl-[max(1.25rem,env(safe-area-inset-left))] pr-[max(1.25rem,env(safe-area-inset-right))] pt-3 ${
            rodape ? "pb-4" : "pb-[max(1.25rem,env(safe-area-inset-bottom))]"
          }`}
        >
          {children}
        </div>

        {rodape && (
          <footer data-rodape-folha className="shrink-0 border-t border-borda bg-superficie pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(1.25rem,env(safe-area-inset-left))] pr-[max(1.25rem,env(safe-area-inset-right))] pt-3">
            {rodape}
          </footer>
        )}
      </section>
    </div>,
    document.body,
  );
}
