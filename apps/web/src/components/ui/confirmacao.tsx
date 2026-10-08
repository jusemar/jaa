import type { ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * CONFIRMAÇÃO de uma ação que a pessoa precisa decidir de propósito (apagar, descartar alterações…):
 * título curto, a consequência em uma frase e dois botões. É o diálogo das ações de conversa, agora
 * num lugar só para o app inteiro — nada de `window.confirm`, que não segue o visual do Jaa.
 *
 * É desenhado no `<body>` (portal), como a `Folha`: um `position: fixed` DENTRO de um elemento com
 * `transform`/`translate` fica preso a ele. O "⋯" da lista de conversas é centralizado com translate —
 * a confirmação de "Apagar conversa" nascia espremida dentro daquele botão de 32 px, cortada e
 * ilegível, e a pessoa não conseguia confirmar. No `<body>` ela cobre a tela em qualquer lugar de uso.
 *
 * Fica acima de folhas e menus (`z-[1100]`). `perigosa` pinta o botão principal de vermelho; ações
 * que não destroem nada usam a cor da marca.
 */
export function DialogoConfirmacao({
  titulo,
  texto,
  rotuloConfirmar,
  rotuloCancelar = "Cancelar",
  perigosa = false,
  ocupado = false,
  erro = null,
  aoConfirmar,
  aoCancelar,
  dados,
  idTitulo = "titulo-confirmacao",
}: {
  titulo: string;
  texto: ReactNode;
  rotuloConfirmar: string;
  rotuloCancelar?: string;
  perigosa?: boolean;
  ocupado?: boolean;
  erro?: string | null;
  aoConfirmar: () => void;
  aoCancelar: () => void;
  // Atributos `data-*` do diálogo (identificação em testes e automação).
  dados?: Record<`data-${string}`, string | boolean>;
  idTitulo?: string;
}) {
  const dialogo = (
    <div data-dialogo-confirmacao className="fixed inset-0 z-[1100] grid place-items-center overflow-y-auto bg-black/30 p-4">
      <div role="alertdialog" aria-modal="true" aria-labelledby={idTitulo} {...dados} className="flex w-full max-w-sm flex-col gap-3 rounded-jaa border border-borda bg-superficie p-4 shadow-suave">
        <p id={idTitulo} className="font-semibold text-conteudo [overflow-wrap:anywhere]">
          {titulo}
        </p>
        <p className="text-sm text-conteudo-suave">{texto}</p>
        {erro && (
          // Erro da ação (ex.: resposta da API): inteiro e legível, quebrando linha em qualquer largura.
          <p role="alert" data-erro-da-confirmacao className="rounded-jaa-compacto bg-perigo/10 px-3 py-2 text-sm text-perigo [overflow-wrap:anywhere]">
            {erro}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" disabled={ocupado} onClick={aoCancelar} className="min-h-11 rounded-full border border-borda px-4 text-sm sm:min-h-9">
            {rotuloCancelar}
          </button>
          <button
            type="button"
            data-confirmar-acao-sim
            disabled={ocupado}
            onClick={aoConfirmar}
            className={`min-h-11 rounded-full px-4 text-sm font-medium text-white disabled:opacity-50 sm:min-h-9 ${perigosa ? "bg-perigo" : "bg-marca"}`}
          >
            {ocupado ? "Aguarde…" : rotuloConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
  // Sem documento (renderização no servidor/testes) não há onde portar: o diálogo só existe após um clique.
  return typeof document === "undefined" ? dialogo : createPortal(dialogo, document.body);
}
