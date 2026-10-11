import type { DisponibilidadeProduto, Produto } from "@jaa/contratos";
import { interpretarPrecoDigitado } from "./precos.ts";

/*
 * RASCUNHO do formulário de produto: o que está NA TELA comparado com o produto como o servidor o
 * devolveu. É daqui que sai "há alteração pendente?" — e, portanto, se "Salvar produto" fica habilitado.
 */

export interface RascunhoDoProduto {
  nome: string;
  descricao: string;
  // Texto digitado, em reais ("39,90").
  preco: string;
  disponibilidade: DisponibilidadeProduto;
  // "" = sem categoria.
  categoriaId: string;
}

type ProdutoSalvo = Pick<Produto, "nome" | "descricao" | "precoCentavos" | "disponibilidade" | "categoriaId">;

/** Descrição como vai para o servidor: sem espaços nas pontas; vazia = null. */
export function descricaoDoRascunho(descricao: string): string | null {
  const limpa = descricao.trim();
  return limpa === "" ? null : limpa;
}

/**
 * Há algo no rascunho que ainda não está no servidor? Produto novo (`null`) sempre tem: ele ainda não
 * existe. Espaços nas pontas não contam (o servidor os descarta); preço inválido conta como alterado.
 * Depois de um salvamento com SUCESSO o produto salvo passa a ser o devolvido pelo servidor, e isto
 * volta a ser `false`; se o salvamento falha, o produto salvo não muda e isto continua `true`.
 */
export function produtoAlterado(salvo: ProdutoSalvo | null, rascunho: RascunhoDoProduto): boolean {
  if (salvo === null) return true;
  return (
    rascunho.nome.trim() !== salvo.nome ||
    descricaoDoRascunho(rascunho.descricao) !== salvo.descricao ||
    interpretarPrecoDigitado(rascunho.preco) !== salvo.precoCentavos ||
    rascunho.disponibilidade !== salvo.disponibilidade ||
    (rascunho.categoriaId || null) !== salvo.categoriaId
  );
}
