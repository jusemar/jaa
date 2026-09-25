import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { opcoesProduto } from "../produtos/opcoes-produto.js";
import { itensPedido } from "./itens-pedido.js";

/**
 * ESCOLHAS do item, em SNAPSHOT — a mesma regra dos itens: o pedido guarda o que o cliente escolheu
 * NO MOMENTO DA COMPRA. Renomear a opção, mudar o acréscimo, deixá-la indisponível ou apagar o grupo
 * inteiro depois não altera pedido nenhum, porque nome, nome do grupo e acréscimo estão gravados aqui.
 *
 * `opcao_id` é apenas referência auxiliar (SET NULL se a opção sumir); o histórico continua legível
 * sem ela. `posicao` preserva a ordem em que o cliente viu os grupos, para o pedido ser lido como foi
 * montado ("Grande · Bife bovino · Arroz · Feijão"), e não em ordem alfabética arbitrária.
 */
export const escolhasItemPedido = pgTable(
  "escolhas_item_pedido",
  {
    id: uuid().primaryKey().defaultRandom(),
    itemPedidoId: uuid()
      .notNull()
      .references(() => itensPedido.id, { onDelete: "cascade" }),
    opcaoId: uuid().references(() => opcoesProduto.id, { onDelete: "set null" }),
    grupoNome: text().notNull(),
    opcaoNome: text().notNull(),
    precoAdicionalCentavos: integer().notNull(),
    posicao: integer().notNull().default(0),
  },
  (tabela) => [
    index("escolhas_item_pedido_item_idx").on(tabela.itemPedidoId, tabela.posicao),
    check("escolhas_item_pedido_grupo_nome_valido", sql`char_length(${tabela.grupoNome}) between 1 and 80`),
    check("escolhas_item_pedido_opcao_nome_valido", sql`char_length(${tabela.opcaoNome}) between 1 and 80`),
    check("escolhas_item_pedido_preco_adicional_valido", sql`${tabela.precoAdicionalCentavos} between 0 and 99999999`),
  ],
);
