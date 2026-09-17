import type { Produto } from "@jaa/contratos";
import type { ProdutoComCategoria, ProdutoRegistro } from "../repositorios/repositorio-produtos.js";

/**
 * Visão administrativa. Campos escolhidos um a um: nada de conta, membros ou dados pessoais.
 *
 * A imagem sai como URL pública montada na LEITURA, a partir da chave gravada. O banco guarda chave,
 * nunca URL: trocar de provedor ou de domínio não invalida linha nenhuma.
 */
export function serializarProduto(produto: ProdutoRegistro | ProdutoComCategoria, urlPublica: (chave: string) => string | null = () => null): Produto {
  return {
    id: produto.id,
    empresaId: produto.empresaId,
    nome: produto.nome,
    descricao: produto.descricao,
    precoCentavos: produto.precoCentavos,
    disponibilidade: produto.disponibilidade,
    categoriaId: produto.categoriaId,
    categoriaNome: "categoriaNome" in produto ? produto.categoriaNome : null,
    imagemUrl: produto.imagemChave ? urlPublica(produto.imagemChave) : null,
    criadoEm: produto.criadoEm.toISOString(),
    atualizadoEm: produto.atualizadoEm.toISOString(),
  };
}
