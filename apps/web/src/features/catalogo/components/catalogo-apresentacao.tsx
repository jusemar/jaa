"use client";

import { QUANTIDADE_MAXIMA_POR_ITEM, type EmpresaPublica, type ProdutoPublico } from "@jaa/contratos";
import { useState } from "react";
import { formatarPrecoCentavos } from "@/features/produtos/lib/precos";

// Interface TÉCNICA de CLIENTE: catálogo da empresa e detalhe do produto. Somente leitura (sem carrinho
// nem administração). Não é o design final.

export function ListaCatalogo({
  empresa,
  produtos,
  aoVer,
  aoAdicionar,
}: {
  empresa: EmpresaPublica;
  produtos: ProdutoPublico[];
  aoVer: (produto: ProdutoPublico) => void;
  aoAdicionar?: (produto: ProdutoPublico) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">Produtos — {empresa.nome}</h3>
      {produtos.length === 0 ? (
        <p className="text-sm text-conteudo-suave">Nenhum produto disponível no momento.</p>
      ) : (
        <ol aria-label="Catálogo" className="flex flex-col divide-y divide-borda rounded-jaa border border-borda text-sm">
          {produtos.map((produto) => (
            <li key={produto.id} data-produto-catalogo-id={produto.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="min-w-0">
                <span className="block truncate font-medium">{produto.nome}</span>
                <span data-preco className="block">
                  {formatarPrecoCentavos(produto.precoCentavos)}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <button type="button" onClick={() => aoVer(produto)} className="rounded-jaa border px-2 py-1 text-xs">
                  Ver
                </button>
                {aoAdicionar && (
                  <button type="button" aria-label={`Adicionar ${produto.nome}`} onClick={() => aoAdicionar(produto)} className="rounded-jaa border px-2 py-1 text-xs">
                    Adicionar
                  </button>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function DetalheProdutoCatalogo({
  empresa,
  produto,
  aoVoltar,
  aoAdicionar,
}: {
  empresa: EmpresaPublica;
  produto: ProdutoPublico;
  aoVoltar: () => void;
  aoAdicionar?: (produto: ProdutoPublico, quantidade: number) => void;
}) {
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
        className="flex h-24 cursor-not-allowed items-center justify-center rounded-jaa border border-dashed border-borda text-xs text-conteudo-suave/70"
      >
        Imagem em breve
      </button>
      <h4 className="text-base font-semibold">{produto.nome}</h4>
      <p className="text-xs text-conteudo-suave">{empresa.nome}</p>
      {produto.descricao && <p className="whitespace-pre-wrap text-conteudo [overflow-wrap:anywhere]">{produto.descricao}</p>}
      <p data-preco className="font-medium">
        {formatarPrecoCentavos(produto.precoCentavos)}
      </p>
      <p data-disponibilidade className="text-xs text-marca">
        Disponível
      </p>
      {aoAdicionar && <AdicionarAoCarrinho produto={produto} aoAdicionar={aoAdicionar} />}
    </article>
  );
}

// Quantidade (inteira, de 1 ao limite) antes de adicionar ao carrinho.
function AdicionarAoCarrinho({ produto, aoAdicionar }: { produto: ProdutoPublico; aoAdicionar: (produto: ProdutoPublico, quantidade: number) => void }) {
  const [quantidade, setQuantidade] = useState(1);

  return (
    <span className="flex items-center gap-2">
      <label className="flex items-center gap-1 text-xs">
        Quantidade
        <input
          name="quantidadeProduto"
          type="number"
          min={1}
          max={QUANTIDADE_MAXIMA_POR_ITEM}
          value={quantidade}
          onChange={(evento) => setQuantidade(Math.min(Math.max(Math.trunc(Number(evento.target.value) || 1), 1), QUANTIDADE_MAXIMA_POR_ITEM))}
          className="w-16 rounded-jaa border border-borda px-2 py-1"
        />
      </label>
      <button type="button" onClick={() => aoAdicionar(produto, quantidade)} className="rounded bg-marca px-3 py-1.5 text-xs text-white">
        Adicionar ao carrinho
      </button>
    </span>
  );
}
