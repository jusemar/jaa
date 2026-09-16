"use client";

import type { CatalogoPublico, ProdutoPublico } from "@jaa/contratos";
import { useEffect, useState } from "react";
import { obterCatalogo, obterProdutoDoCatalogo } from "../lib/api-catalogo";
import { DetalheProdutoCatalogo, ListaCatalogo } from "./catalogo-apresentacao";

// Catálogo aberto a partir de uma conversa com empresa. Usa a consulta PÚBLICA do mesmo domínio Produto.
export function CatalogoDaEmpresa({
  identidadeEmpresaId,
  aoFechar,
  aoAdicionarAoCarrinho,
}: {
  identidadeEmpresaId: string;
  aoFechar: () => void;
  // Ausente quando quem olha é a própria empresa (não faz pedido de si mesma).
  aoAdicionarAoCarrinho?: (empresa: CatalogoPublico["empresa"], produto: ProdutoPublico, quantidade: number) => void;
}) {
  const [catalogo, setCatalogo] = useState<CatalogoPublico | null>(null);
  const [produto, setProduto] = useState<ProdutoPublico | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    void obterCatalogo(identidadeEmpresaId).then((resultado) => {
      if (!ativo) return;
      if (resultado.ok) setCatalogo(resultado.dados);
      else setErro(resultado.mensagem);
    });
    return () => {
      ativo = false;
    };
  }, [identidadeEmpresaId]);

  async function ver(escolhido: ProdutoPublico) {
    // Relê do servidor: pode ter ficado indisponível desde a listagem.
    const resultado = await obterProdutoDoCatalogo(identidadeEmpresaId, escolhido.id);
    if (!resultado.ok) {
      setErro(resultado.mensagem);
      return;
    }
    setErro(null);
    setProduto(resultado.dados.produto);
  }

  return (
    <section aria-label="Catálogo da empresa" className="flex flex-col gap-2 rounded border border-zinc-200 bg-white p-3">
      <button type="button" onClick={aoFechar} aria-label="Fechar produtos" className="self-end text-xs underline">
        Fechar produtos
      </button>
      {!catalogo && !erro && <p className="text-sm text-zinc-500">Carregando produtos…</p>}
      {catalogo && !produto && (
        <ListaCatalogo
          empresa={catalogo.empresa}
          produtos={catalogo.produtos}
          aoVer={(p) => void ver(p)}
          {...(aoAdicionarAoCarrinho ? { aoAdicionar: (p: ProdutoPublico) => aoAdicionarAoCarrinho(catalogo.empresa, p, 1) } : {})}
        />
      )}
      {catalogo && produto && (
        <DetalheProdutoCatalogo
          empresa={catalogo.empresa}
          produto={produto}
          aoVoltar={() => setProduto(null)}
          {...(aoAdicionarAoCarrinho ? { aoAdicionar: (p: ProdutoPublico, quantidade: number) => aoAdicionarAoCarrinho(catalogo.empresa, p, quantidade) } : {})}
        />
      )}
      {erro && (
        <p role="alert" className="text-sm text-red-600">
          {erro}
        </p>
      )}
    </section>
  );
}
