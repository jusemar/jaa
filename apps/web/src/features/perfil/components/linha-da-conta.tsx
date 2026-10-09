import type { ReactNode } from "react";

/**
 * Uma linha de "Conta e segurança": o nome do dado, o valor atual e UMA ação à direita. O formulário
 * de troca (`children`) só existe quando a pessoa pede — fechado, a linha ocupa duas linhas de texto.
 */
export function LinhaDaConta({ rotulo, valor, vazio = false, acao, children }: { rotulo: string; valor: ReactNode; vazio?: boolean; acao?: ReactNode; children?: ReactNode }) {
  return (
    <div data-linha-da-conta={rotulo} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="text-sm text-conteudo-suave">{rotulo}</p>
          <p className={vazio ? "text-conteudo-suave" : "break-all font-medium text-conteudo"}>{valor}</p>
        </div>
        {acao}
      </div>
      {children}
    </div>
  );
}
