import { QUANTIDADE_MAXIMA_POR_ITEM, MAXIMO_ITENS_POR_PEDIDO, type EmpresaPublica, type ProdutoPublico } from "@jaa/contratos";

/*
 * Carrinho do CLIENTE: estado de interface, com UMA empresa por vez. Guarda nome e preço só para
 * exibir; na confirmação o servidor recalcula tudo a partir do banco (o carrinho nunca é autoridade).
 */

export interface ItemCarrinho {
  produtoId: string;
  nome: string;
  precoCentavos: number;
  quantidade: number;
}

export interface Carrinho {
  empresa: EmpresaPublica;
  itens: ItemCarrinho[];
}

export type ResultadoAdicionar =
  | { tipo: "adicionado"; carrinho: Carrinho }
  // Carrinho aberto de outra empresa: quem chama pergunta antes de substituir (nunca troca em silêncio).
  | { tipo: "outra-empresa"; empresaAtual: EmpresaPublica }
  | { tipo: "limite-de-itens" };

export function totalCentavos(carrinho: Carrinho | null): number {
  return (carrinho?.itens ?? []).reduce((total, item) => total + item.precoCentavos * item.quantidade, 0);
}

export function quantidadeTotal(carrinho: Carrinho | null): number {
  return (carrinho?.itens ?? []).reduce((total, item) => total + item.quantidade, 0);
}

const limitarQuantidade = (quantidade: number) => Math.min(Math.max(Math.trunc(quantidade), 1), QUANTIDADE_MAXIMA_POR_ITEM);

export function adicionarAoCarrinho(
  carrinho: Carrinho | null,
  empresa: EmpresaPublica,
  produto: ProdutoPublico,
  quantidade = 1,
): ResultadoAdicionar {
  if (carrinho && carrinho.itens.length > 0 && carrinho.empresa.identidadeId !== empresa.identidadeId) {
    return { tipo: "outra-empresa", empresaAtual: carrinho.empresa };
  }

  const atual = carrinho && carrinho.empresa.identidadeId === empresa.identidadeId ? carrinho : { empresa, itens: [] };
  const existente = atual.itens.find((item) => item.produtoId === produto.id);
  if (!existente && atual.itens.length >= MAXIMO_ITENS_POR_PEDIDO) return { tipo: "limite-de-itens" };

  const itens = existente
    ? atual.itens.map((item) => (item.produtoId === produto.id ? { ...item, quantidade: limitarQuantidade(item.quantidade + quantidade) } : item))
    : [...atual.itens, { produtoId: produto.id, nome: produto.nome, precoCentavos: produto.precoCentavos, quantidade: limitarQuantidade(quantidade) }];

  return { tipo: "adicionado", carrinho: { empresa, itens } };
}

export function alterarQuantidade(carrinho: Carrinho, produtoId: string, quantidade: number): Carrinho {
  if (quantidade < 1) return removerDoCarrinho(carrinho, produtoId);
  return { ...carrinho, itens: carrinho.itens.map((item) => (item.produtoId === produtoId ? { ...item, quantidade: limitarQuantidade(quantidade) } : item)) };
}

export function removerDoCarrinho(carrinho: Carrinho, produtoId: string): Carrinho {
  return { ...carrinho, itens: carrinho.itens.filter((item) => item.produtoId !== produtoId) };
}

// Itens para a API: só produto e quantidade (preço e total são do servidor).
export function itensParaPedido(carrinho: Carrinho): Array<{ produtoId: string; quantidade: number }> {
  return carrinho.itens.map((item) => ({ produtoId: item.produtoId, quantidade: item.quantidade }));
}

/*
 * Persistência local por identidade: o carrinho sobrevive a recarregar a página e a navegar entre telas,
 * sem virar autoridade comercial. Outra identidade no mesmo navegador não herda o carrinho.
 */
const chave = (identidadeId: string) => `jaa:carrinho:${identidadeId}`;

export function lerCarrinho(identidadeId: string): Carrinho | null {
  try {
    const guardado = window.localStorage.getItem(chave(identidadeId));
    if (!guardado) return null;
    const carrinho = JSON.parse(guardado) as Carrinho;
    return carrinho?.empresa?.identidadeId && Array.isArray(carrinho.itens) ? carrinho : null;
  } catch {
    return null;
  }
}

export function gravarCarrinho(identidadeId: string, carrinho: Carrinho | null): void {
  try {
    if (!carrinho || carrinho.itens.length === 0) window.localStorage.removeItem(chave(identidadeId));
    else window.localStorage.setItem(chave(identidadeId), JSON.stringify(carrinho));
  } catch {
    // Sem armazenamento: o carrinho vale só enquanto a página estiver aberta.
  }
}
