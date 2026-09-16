import type { EmpresaPublica, ProdutoPublico } from "@jaa/contratos";
import { formatarPrecoCentavos } from "@/features/produtos/lib/precos";

// Interface TÉCNICA de CLIENTE: catálogo da empresa e detalhe do produto. Somente leitura (sem carrinho
// nem administração). Não é o design final.

export function ListaCatalogo({ empresa, produtos, aoVer }: { empresa: EmpresaPublica; produtos: ProdutoPublico[]; aoVer: (produto: ProdutoPublico) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">Produtos — {empresa.nome}</h3>
      {produtos.length === 0 ? (
        <p className="text-sm text-zinc-500">Nenhum produto disponível no momento.</p>
      ) : (
        <ol aria-label="Catálogo" className="flex flex-col divide-y divide-zinc-200 rounded border border-zinc-200 text-sm">
          {produtos.map((produto) => (
            <li key={produto.id} data-produto-catalogo-id={produto.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="min-w-0">
                <span className="block truncate font-medium">{produto.nome}</span>
                <span data-preco className="block">
                  {formatarPrecoCentavos(produto.precoCentavos)}
                </span>
              </span>
              <button type="button" onClick={() => aoVer(produto)} className="shrink-0 rounded border px-2 py-1 text-xs">
                Ver
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function DetalheProdutoCatalogo({ empresa, produto, aoVoltar }: { empresa: EmpresaPublica; produto: ProdutoPublico; aoVoltar: () => void }) {
  return (
    <article aria-label="Detalhe do produto" className="flex flex-col gap-2 text-sm">
      <button type="button" onClick={aoVoltar} className="self-start text-xs underline">
        ← Produtos
      </button>
      {/* Imagem ainda sem storage: controle propositalmente desabilitado. */}
      <button
        type="button"
        disabled
        aria-label="Imagem do produto em breve"
        data-imagem-produto-futura
        className="flex h-24 cursor-not-allowed items-center justify-center rounded border border-dashed border-zinc-300 text-xs text-zinc-400"
      >
        Imagem em breve
      </button>
      <h4 className="text-base font-semibold">{produto.nome}</h4>
      <p className="text-xs text-zinc-500">{empresa.nome}</p>
      {produto.descricao && <p className="whitespace-pre-wrap text-zinc-700 [overflow-wrap:anywhere]">{produto.descricao}</p>}
      <p data-preco className="font-medium">
        {formatarPrecoCentavos(produto.precoCentavos)}
      </p>
      <p data-disponibilidade className="text-xs text-emerald-700">
        Disponível
      </p>
    </article>
  );
}
