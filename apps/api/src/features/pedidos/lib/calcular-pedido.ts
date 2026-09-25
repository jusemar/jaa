import { precoUnitarioComEscolhas, validarEscolhas, TOTAL_MAXIMO_PEDIDO_CENTAVOS, type FormaPagamentoEntrega, type GrupoOpcoesPublico } from "@jaa/contratos";
import type { ProdutoRegistro } from "../../produtos/repositorios/repositorio-produtos.js";
import type { EscolhaParaGravar, ItemParaGravar } from "../repositorios/repositorio-pedidos.js";

/*
 * Regras de dinheiro do pedido, puras e em CENTAVOS inteiros. O cliente envia apenas produto,
 * quantidade e quais OPÇÕES escolheu: preço unitário, acréscimos, subtotal e total são calculados
 * aqui a partir dos produtos e grupos lidos do BANCO.
 *
 * A validação de mínimo/máximo usa `validarEscolhas` de @jaa/contratos — a MESMA função pura que a
 * interface usa para habilitar o botão. A interface não é autoridade: aqui a regra é reexecutada
 * sobre os grupos do banco, então "escolhi 7 guarnições onde cabem 5" é recusado mesmo que a tela
 * do cliente tenha sido alterada.
 */

export interface ItemPedidoEntrada {
  produtoId: string;
  quantidade: number;
  opcaoIds?: readonly string[] | undefined;
  // Instrução de preparo DESTA linha (já normalizada pelo contrato); null/ausente = sem observação.
  observacao?: string | null | undefined;
}

export type ResultadoItens =
  | { tipo: "itens"; itens: ItemParaGravar[]; totalCentavos: number }
  | { tipo: "itens-invalidos"; motivo: "produto-indisponivel-ou-de-outra-empresa" | "produto-repetido" | "total-acima-do-limite" }
  | { tipo: "escolhas-invalidas"; motivo: "opcao-desconhecida" | "faltam-escolhas" | "escolhas-demais"; grupoNome?: string | undefined };

/*
 * Duas linhas do MESMO produto com a MESMA montagem seriam a mesma coisa somada: o carrinho já une
 * quantidades, então repetir aqui é erro do cliente. Montagens DIFERENTES continuam sendo itens
 * distintos e legítimos (é por isso que o índice único por produto saiu do banco na migration 0028).
 *
 * A OBSERVAÇÃO entra na assinatura: "prato grande sem cebola" e "prato grande" são pedidos diferentes
 * para quem prepara, mesmo com as mesmas opções.
 */
const assinatura = (item: ItemPedidoEntrada) =>
  `${item.produtoId}|${[...(item.opcaoIds ?? [])].sort().join(",")}|${item.observacao ?? ""}`;

export function calcularItens(
  pedidos: readonly ItemPedidoEntrada[],
  produtosDisponiveis: readonly ProdutoRegistro[],
  gruposPorProduto: ReadonlyMap<string, GrupoOpcoesPublico[]> = new Map(),
): ResultadoItens {
  if (new Set(pedidos.map(assinatura)).size !== pedidos.length) {
    return { tipo: "itens-invalidos", motivo: "produto-repetido" };
  }

  const porId = new Map(produtosDisponiveis.map((produto) => [produto.id, produto]));
  const itens: ItemParaGravar[] = [];
  let totalCentavos = 0;

  for (const pedido of pedidos) {
    // Produto inexistente, de outra empresa ou que ficou indisponível antes da confirmação.
    const produto = porId.get(pedido.produtoId);
    if (!produto) return { tipo: "itens-invalidos", motivo: "produto-indisponivel-ou-de-outra-empresa" };

    const grupos = gruposPorProduto.get(produto.id) ?? [];
    const opcaoIds = pedido.opcaoIds ?? [];
    // Opção enviada para produto SEM grupos é tentativa inválida, não algo a ignorar em silêncio.
    if (grupos.length === 0 && opcaoIds.length > 0) return { tipo: "escolhas-invalidas", motivo: "opcao-desconhecida" };

    const escolhasValidas = validarEscolhas(grupos, opcaoIds);
    if (!escolhasValidas.valido) {
      return { tipo: "escolhas-invalidas", motivo: escolhasValidas.motivo, grupoNome: escolhasValidas.grupoNome };
    }

    // Preço unitário = preço do produto + acréscimos das opções (tudo lido do banco).
    const precoUnitarioCentavos = precoUnitarioComEscolhas(produto.precoCentavos, grupos, opcaoIds);
    const subtotalCentavos = precoUnitarioCentavos * pedido.quantidade;
    totalCentavos += subtotalCentavos;

    itens.push({
      produtoId: produto.id,
      // Snapshot: o pedido antigo continua mostrando o que foi comprado, mesmo se o produto mudar.
      nomeProduto: produto.nome,
      precoUnitarioCentavos,
      quantidade: pedido.quantidade,
      subtotalCentavos,
      escolhas: montarEscolhas(grupos, opcaoIds),
      // Snapshot também da observação: mudar nada depois altera o que a cozinha leu na hora.
      observacao: pedido.observacao ?? null,
    });
  }

  if (totalCentavos < 1 || totalCentavos > TOTAL_MAXIMO_PEDIDO_CENTAVOS) {
    return { tipo: "itens-invalidos", motivo: "total-acima-do-limite" };
  }
  return { tipo: "itens", itens, totalCentavos };
}

/**
 * Snapshot das escolhas na ordem em que o cliente viu os grupos (e, dentro do grupo, as opções).
 * Guarda NOME do grupo, NOME da opção e acréscimo: renomear ou apagar o grupo depois não altera
 * pedido nenhum. `posicao` preserva a leitura "Grande · Bife bovino · Arroz · Feijão".
 */
function montarEscolhas(grupos: readonly GrupoOpcoesPublico[], opcaoIds: readonly string[]): EscolhaParaGravar[] {
  const escolhidas = new Set(opcaoIds);
  const escolhas: EscolhaParaGravar[] = [];
  for (const grupo of grupos) {
    for (const opcao of grupo.opcoes) {
      if (!escolhidas.has(opcao.id)) continue;
      escolhas.push({
        opcaoId: opcao.id,
        grupoNome: grupo.nome,
        opcaoNome: opcao.nome,
        precoAdicionalCentavos: opcao.precoAdicionalCentavos,
        posicao: escolhas.length,
      });
    }
  }
  return escolhas;
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
