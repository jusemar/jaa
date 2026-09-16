import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { produtos } from "../produtos/produtos.js";
import { pedidos } from "./pedidos.js";

/**
 * Item do pedido com SNAPSHOT histórico: nome e preço unitário como estavam na compra.
 * Mudar nome/preço do produto depois, ou torná-lo indisponível, não altera pedidos antigos.
 * `produto_id` é só referência (SET NULL se o produto um dia sumir); o histórico continua legível.
 * O subtotal é conferido pelo próprio banco, e a FK composta impede item de outra empresa.
 */
export const itensPedido = pgTable(
  "itens_pedido",
  {
    id: uuid().primaryKey().defaultRandom(),
    pedidoId: uuid().notNull(),
    // Empresa do pedido, repetida para as FKs compostas (item ↔ pedido ↔ produto na mesma empresa).
    empresaId: uuid().notNull(),
    produtoId: uuid().references(() => produtos.id, { onDelete: "set null" }),
    nomeProduto: text().notNull(),
    precoUnitarioCentavos: integer().notNull(),
    quantidade: integer().notNull(),
    subtotalCentavos: integer().notNull(),
  },
  (tabela) => [
    index("itens_pedido_pedido_id_idx").on(tabela.pedidoId),
    // Um item por produto no pedido (quantidades são somadas no carrinho).
    uniqueIndex("itens_pedido_produto_por_pedido_unico").on(tabela.pedidoId, tabela.produtoId).where(sql`${tabela.produtoId} is not null`),
    foreignKey({
      name: "itens_pedido_pedido_fk",
      columns: [tabela.pedidoId, tabela.empresaId],
      foreignColumns: [pedidos.id, pedidos.empresaId],
    }).onDelete("cascade"),
    // O produto pertence à MESMA empresa do pedido: garantido pelo banco.
    foreignKey({
      name: "itens_pedido_produto_da_empresa_fk",
      columns: [tabela.empresaId, tabela.produtoId],
      foreignColumns: [produtos.empresaId, produtos.id],
    }).onDelete("set null"),
    check("itens_pedido_quantidade_valida", sql`${tabela.quantidade} between 1 and 99`),
    check("itens_pedido_preco_valido", sql`${tabela.precoUnitarioCentavos} between 1 and 99999999`),
    check("itens_pedido_nome_valido", sql`char_length(${tabela.nomeProduto}) between 1 and 120`),
    // Subtotal conferido pelo banco: total e subtotais nunca vêm do cliente.
    check("itens_pedido_subtotal_coerente", sql`${tabela.subtotalCentavos} = ${tabela.precoUnitarioCentavos} * ${tabela.quantidade}`),
  ],
);
