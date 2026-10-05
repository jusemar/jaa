import type { ReactNode } from "react";

/**
 * CONFIRMAÇÃO de uma ação que a pessoa precisa decidir de propósito (apagar, descartar alterações…):
 * título curto, a consequência em uma frase e dois botões. É o diálogo das ações de conversa, agora
 * num lugar só para o app inteiro — nada de `window.confirm`, que não segue o visual do Jaa.
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
  return (
    <div className="fixed inset-0 z-[1100] grid place-items-center bg-black/30 p-4">
      <div role="alertdialog" aria-modal="true" aria-labelledby={idTitulo} {...dados} className="flex w-full max-w-sm flex-col gap-3 rounded-jaa border border-borda bg-superficie p-4 shadow-suave">
        <p id={idTitulo} className="font-semibold text-conteudo">
          {titulo}
        </p>
        <p className="text-sm text-conteudo-suave">{texto}</p>
        {erro && (
          <p role="alert" className="text-xs text-perigo">
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
}
