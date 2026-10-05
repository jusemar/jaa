import type { ReactNode } from "react";

/**
 * Cabeçalho das telas do cardápio: a trilha (onde estou), o título, uma frase curta e as ações.
 * No celular as ações ocupam a largura toda, lado a lado; a partir de `sm` ficam à direita do título.
 */
export function CabecalhoDaPagina({
  trilha,
  titulo,
  subtitulo,
  acoes,
}: {
  // O último item é a tela atual; os anteriores com `aoIr` são caminhos de volta.
  trilha: Array<{ rotulo: string; aoIr?: () => void }>;
  titulo: string;
  subtitulo?: string;
  acoes?: ReactNode;
}) {
  return (
    <header data-cabecalho-pagina className="flex flex-col gap-4">
      <nav aria-label="Você está em" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-conteudo-suave">
        {trilha.map((item, indice) => {
          const atual = indice === trilha.length - 1;
          return (
            <span key={item.rotulo} className="flex items-center gap-2">
              {indice > 0 && <span aria-hidden>›</span>}
              {item.aoIr && !atual ? (
                <button type="button" onClick={item.aoIr} className="-my-3 inline-flex min-h-11 items-center underline-offset-4 hover:text-conteudo hover:underline sm:min-h-9">
                  {item.rotulo}
                </button>
              ) : (
                <span aria-current={atual ? "page" : undefined} className={atual ? "text-conteudo" : ""}>
                  {item.rotulo}
                </span>
              )}
            </span>
          );
        })}
      </nav>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="fonte-display text-2xl font-bold leading-tight text-conteudo">{titulo}</h1>
          {subtitulo && <p className="text-sm text-conteudo-suave">{subtitulo}</p>}
        </div>
        {acoes && <div className="grid shrink-0 auto-cols-fr grid-flow-col gap-2.5 sm:flex sm:gap-2">{acoes}</div>}
      </div>
    </header>
  );
}
