"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IconeFechar } from "./icones";

/*
 * JANELA de edição: uma tarefa inteira (editar um grupo, ver a prévia) com cabeçalho, corpo rolável e
 * rodapé de ações.
 *
 * A mesma janela tem DUAS composições, porque celular e desktop não são o mesmo lugar:
 *  - no celular (abaixo de `sm`) ela É A TELA: ocupa tudo, sem cantos nem margem, cabeçalho no topo e
 *    as ações presas embaixo, acima da área segura — a sensação é de tela de aplicativo, não de um
 *    painel de desktop espremido;
 *  - a partir de `sm` é um diálogo centralizado, com a página visível atrás.
 *
 * `abas` fica fixo logo abaixo do título (não rola junto com o conteúdo). Fechar: X, Esc ou o fundo —
 * quem decide se pode fechar (alteração pendente) é `aoFechar`.
 */

const LARGURAS = {
  // Edição com tabela de opções: precisa de largura.
  larga: "sm:max-w-3xl",
  // Leitura em coluna única (prévia do cliente).
  estreita: "sm:max-w-lg",
} as const;

export function Janela({
  rotulo,
  titulo,
  subtitulo,
  largura = "larga",
  abas,
  rodape,
  aoFechar,
  children,
}: {
  rotulo: string;
  titulo: string;
  subtitulo?: string | undefined;
  largura?: keyof typeof LARGURAS;
  abas?: ReactNode;
  rodape?: ReactNode;
  aoFechar: () => void;
  children: ReactNode;
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

  return createPortal(
    <div data-janela className="fixed inset-0 z-[1000] flex bg-black/40 sm:items-center sm:justify-center sm:p-5" onClick={aoFechar}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label={rotulo}
        onClick={(evento) => evento.stopPropagation()}
        className={`painel-entrando flex h-dvh w-full flex-col overflow-hidden bg-superficie sm:h-auto sm:max-h-[90dvh] sm:rounded-jaa sm:border sm:border-borda sm:shadow-suave ${LARGURAS[largura]}`}
      >
        <header
          data-cabecalho-janela
          className="flex shrink-0 items-start gap-2 pb-3 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 sm:pt-6"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h2 className="fonte-display text-lg font-bold leading-tight text-conteudo sm:text-xl">{titulo}</h2>
            {subtitulo && <p className="text-sm text-conteudo-suave [overflow-wrap:anywhere]">{subtitulo}</p>}
          </div>
          <button
            type="button"
            aria-label="Fechar"
            title="Fechar"
            data-fechar-janela
            onClick={aoFechar}
            className="-mt-1 grid h-11 w-11 shrink-0 place-items-center rounded-full text-conteudo-suave hover:bg-realce hover:text-conteudo"
          >
            <IconeFechar className="h-5 w-5" />
          </button>
        </header>

        {abas && <div className="shrink-0 px-4 sm:px-6">{abas}</div>}

        <div data-corpo-janela className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">
          {children}
        </div>

        {rodape && (
          <footer data-rodape-janela className="shrink-0 border-t border-borda bg-superficie px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:pb-5 sm:pt-4">
            {rodape}
          </footer>
        )}
      </section>
    </div>,
    document.body,
  );
}

/**
 * Faixa de abas da janela: sublinhado na aba atual, como um seletor de seção — não são botões soltos.
 * No celular as abas dividem a largura; a partir de `sm` ficam lado a lado, do tamanho do texto.
 */
export function AbasDaJanela<T extends string>({ atual, abas, aoEscolher }: { atual: T; abas: Array<{ id: T; rotulo: ReactNode; pendente?: boolean }>; aoEscolher: (id: T) => void }) {
  return (
    <div role="tablist" data-abas-janela className="grid auto-cols-fr grid-flow-col border-b border-borda sm:flex sm:gap-6">
      {abas.map((aba) => {
        const selecionada = aba.id === atual;
        return (
          <button
            key={aba.id}
            type="button"
            role="tab"
            aria-selected={selecionada}
            data-aba={aba.id}
            data-pendente={aba.pendente ? "" : undefined}
            onClick={() => aoEscolher(aba.id)}
            className={`-mb-px flex min-h-12 items-center justify-center gap-1.5 border-b-2 px-1 text-[13px] font-medium leading-tight transition-colors sm:justify-start sm:text-sm ${
              selecionada ? "border-marca text-marca" : "border-transparent text-conteudo-suave hover:text-conteudo"
            }`}
          >
            {aba.rotulo}
            {aba.pendente && (
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-aviso">
                <span className="sr-only">alterações não salvas</span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
