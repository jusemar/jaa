import { TOTAL_MAXIMO_PEDIDO_CENTAVOS, type FormaPagamentoEntrega } from "@jaa/contratos";
import type { ProdutoRegistro } from "../../produtos/repositorios/repositorio-produtos.js";
import type { ItemParaGravar } from "../repositorios/repositorio-pedidos.js";

/*
 * Regras de dinheiro do pedido, puras e em CENTAVOS inteiros. O cliente envia apenas produto e
 * quantidade: preço unitário, subtotal e total são calculados aqui a partir dos produtos do BANCO.
 */

export type ResultadoItens =
  | { tipo: "itens"; itens: ItemParaGravar[]; totalCentavos: number }
  | { tipo: "itens-invalidos"; motivo: "produto-indisponivel-ou-de-outra-empresa" | "produto-repetido" | "total-acima-do-limite" };

export function calcularItens(
  pedidos: Array<{ produtoId: string; quantidade: number }>,
  produtosDisponiveis: ProdutoRegistro[],
): ResultadoItens {
  if (new Set(pedidos.map((item) => item.produtoId)).size !== pedidos.length) {
    return { tipo: "itens-invalidos", motivo: "produto-repetido" };
  }

  const porId = new Map(produtosDisponiveis.map((produto) => [produto.id, produto]));
  const itens: ItemParaGravar[] = [];
  let totalCentavos = 0;

  for (const pedido of pedidos) {
    // Produto inexistente, de outra empresa ou que ficou indisponível antes da confirmação.
    const produto = porId.get(pedido.produtoId);
    if (!produto) return { tipo: "itens-invalidos", motivo: "produto-indisponivel-ou-de-outra-empresa" };

    const subtotalCentavos = produto.precoCentavos * pedido.quantidade;
    totalCentavos += subtotalCentavos;
    itens.push({
      produtoId: produto.id,
      // Snapshot: o pedido antigo continua mostrando o que foi comprado, mesmo se o produto mudar.
      nomeProduto: produto.nome,
      precoUnitarioCentavos: produto.precoCentavos,
      quantidade: pedido.quantidade,
      subtotalCentavos,
    });
  }

  if (totalCentavos < 1 || totalCentavos > TOTAL_MAXIMO_PEDIDO_CENTAVOS) {
    return { tipo: "itens-invalidos", motivo: "total-acima-do-limite" };
  }
  return { tipo: "itens", itens, totalCentavos };
}

export type ResultadoPagamento = { tipo: "pagamento"; trocoParaCentavos: number | null } | { tipo: "pagamento-invalido" };

/**
 * Cartão na entrega nunca tem troco. Dinheiro: sem troco → null; com troco, o valor que o cliente
 * entrega precisa ser MAIOR que o total (igual ao total significa "sem troco" e é normalizado para null).
 */
export function resolverPagamento(
  pagamento: { forma: FormaPagamentoEntrega; trocoParaCentavos?: number | null | undefined },
  totalCentavos: number,
): ResultadoPagamento {
  if (pagamento.forma === "cartao") {
    return pagamento.trocoParaCentavos === undefined || pagamento.trocoParaCentavos === null ? { tipo: "pagamento", trocoParaCentavos: null } : { tipo: "pagamento-invalido" };
  }

  const trocoPara = pagamento.trocoParaCentavos ?? null;
  if (trocoPara === null) return { tipo: "pagamento", trocoParaCentavos: null };
  if (trocoPara < totalCentavos) return { tipo: "pagamento-invalido" };
  return { tipo: "pagamento", trocoParaCentavos: trocoPara === totalCentavos ? null : trocoPara };
}
