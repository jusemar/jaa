import type { ResumoPedido } from "@jaa/contratos";
import { sql, type SQL } from "drizzle-orm";

/**
 * Resumo do Pedido para o CARD na conversa, lido do próprio Pedido (nada é copiado para a mensagem).
 * Uma busca pela PK do pedido + itens por pedido_id para cada mensagem de card retornada.
 * SQL com nomes qualificados: o Drizzle omite o nome da tabela em selects de tabela única.
 */
export function resumoPedidoSql(tabelaMensagens = "mensagens"): SQL<ResumoPedido | null> {
  const mensagem = sql.identifier(tabelaMensagens);

  return sql<ResumoPedido | null>`(
    select json_build_object(
      'id', pedido.id,
      'numero', pedido.numero,
      'status', pedido.status,
      'formaPagamentoNaEntrega', pedido.forma_pagamento_na_entrega,
      'trocoParaCentavos', pedido.troco_para_centavos,
      'totalCentavos', pedido.total_centavos,
      'itens', coalesce((
        select json_agg(
          json_build_object(
            'nomeProduto', item.nome_produto,
            'quantidade', item.quantidade,
            'subtotalCentavos', item.subtotal_centavos,
            'observacao', item.observacao,
            -- Só os nomes das opções: o card mostra a montagem em uma linha ("Grande · Bife bovino").
            'escolhas', coalesce((
              select json_agg(escolha.opcao_nome order by escolha.posicao, escolha.id)
              from escolhas_item_pedido escolha
              where escolha.item_pedido_id = item.id
            ), '[]'::json)
          )
          order by item.nome_produto, item.id
        )
        from itens_pedido item
        where item.pedido_id = pedido.id
      ), '[]'::json)
    )
    from pedidos pedido
    where pedido.id = ${mensagem}.pedido_id
  )`;
}
