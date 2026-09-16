"use client";

import { useRef } from "react";

// Interface TÉCNICA: ações de uma mensagem num menu compacto (⋯). Só aparecem as ações permitidas;
// a API continua sendo quem autoriza cada uma.

export type AcaoMensagem = { rotulo: string; executar: () => void; perigosa?: boolean };

export function MenuMensagem({ acoes }: { acoes: AcaoMensagem[] }) {
  const detalhesRef = useRef<HTMLDetailsElement>(null);
  if (acoes.length === 0) return null;

  return (
    <details ref={detalhesRef} className="relative shrink-0 self-center">
      <summary
        aria-label="Mais ações"
        title="Mais ações"
        className="cursor-pointer list-none rounded px-1.5 text-sm text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 [&::-webkit-details-marker]:hidden"
      >
        ⋯
      </summary>
      <ul role="menu" className="absolute right-0 z-10 mt-1 flex min-w-40 flex-col rounded border border-zinc-200 bg-white py-1 text-sm shadow">
        {acoes.map((acao) => (
          <li key={acao.rotulo} role="none">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                if (detalhesRef.current) detalhesRef.current.open = false;
                acao.executar();
              }}
              className={`w-full px-3 py-1.5 text-left hover:bg-zinc-100 ${acao.perigosa ? "text-red-700" : ""}`}
            >
              {acao.rotulo}
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
