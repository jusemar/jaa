import type { Produto } from "@jaa/contratos";
import type { ProdutoRegistro } from "../repositorios/repositorio-produtos.js";

// Visão administrativa. Campos escolhidos um a um: nada de conta, membros ou dados pessoais.
export function serializarProduto(produto: ProdutoRegistro): Produto {
  return {
    id: produto.id,
    empresaId: produto.empresaId,
    nome: produto.nome,
    descricao: produto.descricao,
    precoCentavos: produto.precoCentavos,
    disponibilidade: produto.disponibilidade,
    criadoEm: produto.criadoEm.toISOString(),
    atualizadoEm: produto.atualizadoEm.toISOString(),
  };
}
