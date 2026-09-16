import type { DisponibilidadeProduto, Produto } from "@jaa/contratos";
import { formatarPrecoCentavos } from "../lib/precos";

// Interface TÉCNICA: produtos da empresa na administração Web. Não é o design final.

export const ROTULO_DISPONIBILIDADE: Record<DisponibilidadeProduto, string> = { disponivel: "Disponível", indisponivel: "Indisponível" };

export function ListaProdutos({
  produtos,
  aoEditar,
  aoAlternarDisponibilidade,
}: {
  produtos: Produto[];
  aoEditar: (produto: Produto) => void;
  aoAlternarDisponibilidade: (produto: Produto) => void;
}) {
  if (produtos.length === 0) return <p className="text-sm text-zinc-500">Nenhum produto cadastrado.</p>;

  return (
    <ol aria-label="Produtos" className="flex flex-col divide-y divide-zinc-200 rounded border border-zinc-200 text-sm">
      {produtos.map((produto) => (
        <li key={produto.id} data-produto-id={produto.id} data-disponibilidade={produto.disponibilidade} className="flex items-start justify-between gap-3 px-3 py-2">
          <span className="min-w-0">
            <span className={`block truncate font-medium ${produto.disponibilidade === "indisponivel" ? "text-zinc-500" : ""}`}>{produto.nome}</span>
            {produto.descricao && <span className="line-clamp-2 block whitespace-pre-wrap text-xs text-zinc-500 [overflow-wrap:anywhere]">{produto.descricao}</span>}
            <span data-preco className="block">
              {formatarPrecoCentavos(produto.precoCentavos)}
            </span>
            <span data-rotulo-disponibilidade className={`text-xs ${produto.disponibilidade === "disponivel" ? "text-emerald-700" : "text-amber-700"}`}>
              {ROTULO_DISPONIBILIDADE[produto.disponibilidade]}
            </span>
          </span>
          <span className="flex shrink-0 flex-col items-end gap-1">
            <button type="button" onClick={() => aoEditar(produto)} className="rounded border px-2 py-1 text-xs">
              Editar
            </button>
            <button type="button" onClick={() => aoAlternarDisponibilidade(produto)} className="rounded px-2 py-1 text-xs underline">
              {produto.disponibilidade === "disponivel" ? "Marcar indisponível" : "Marcar disponível"}
            </button>
          </span>
        </li>
      ))}
    </ol>
  );
}
