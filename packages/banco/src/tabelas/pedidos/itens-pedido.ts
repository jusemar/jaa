import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
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
    /*
     * OBSERVAÇÃO desta linha ("sem cebola"), parte do snapshot: pertence ao item, não ao pedido.
     * Dois pratos montados no mesmo pedido podem pedir coisas diferentes, e quem prepara lê cada uma
     * junto do prato a que ela se refere. É instrução de preparo — não muda preço nem disponibilidade.
     * null = sem observação (nunca string vazia).
     */
    observacao: text(),
  },
  (tabela) => [
    index("itens_pedido_pedido_id_idx").on(tabela.pedidoId),
    /*
     * NÃO existe mais "um item por produto no pedido" (o índice único foi removido na migration 0028).
     * Com personalização, dois pratos do MESMO produto com montagens diferentes são dois itens
     * legítimos, com preços unitários diferentes. Quem soma quantidades de configurações IGUAIS é o
     * carrinho, antes de enviar; o servidor recusa a repetição exata (mesmo produto e mesmas opções).
     */
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
    // Mantido em sincronia com @jaa/contratos (pedidos/pedido.ts).
    check("itens_pedido_observacao_valida", sql`${tabela.observacao} is null or char_length(${tabela.observacao}) between 1 and 200`),
    // Subtotal conferido pelo banco: total e subtotais nunca vêm do cliente.
    check("itens_pedido_subtotal_coerente", sql`${tabela.subtotalCentavos} = ${tabela.precoUnitarioCentavos} * ${tabela.quantidade}`),
  ],
);
