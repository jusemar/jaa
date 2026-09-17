import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { empresas } from "../empresas/empresas.js";

/**
 * CATEGORIA DE PRODUTO — POR EMPRESA. "Bebidas" da Pizzaria não é "Bebidas" do Mercado: não existe
 * lista global de categorias, e uma empresa nunca enxerga nem reaproveita a categoria de outra.
 *
 * A categoria ORGANIZA o catálogo; não é regra comercial (não muda preço, disponibilidade ou pedido).
 * Por isso o produto pode não ter categoria (`categoria_id` nulo = "Sem categoria") e apagar uma
 * categoria não apaga produto nenhum — eles só voltam para "Sem categoria" (ON DELETE SET NULL).
 */
export const categoriasProduto = pgTable(
  "categorias_produto",
  {
    id: uuid().primaryKey().defaultRandom(),
    empresaId: uuid()
      .notNull()
      .references(() => empresas.id, { onDelete: "restrict" }),
    nome: text().notNull(),
    // Ordem de exibição escolhida pela empresa (menor primeiro); empate resolve pelo nome.
    posicao: integer().notNull().default(0),
    criadoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (tabela) => [
    index("categorias_produto_empresa_posicao_idx").on(tabela.empresaId, tabela.posicao),
    // Nome único dentro da empresa, sem depender de maiúsculas: "Bebidas" e "bebidas" são a mesma.
    uniqueIndex("categorias_produto_nome_por_empresa_unico").on(tabela.empresaId, sql`lower(${tabela.nome})`),
    // Alvo da FK composta em produtos: a categoria do produto é da mesma empresa do produto.
    uniqueIndex("categorias_produto_empresa_id_id_unico").on(tabela.empresaId, tabela.id),
    check("categorias_produto_nome_valido", sql`char_length(${tabela.nome}) between 1 and 60 and ${tabela.nome} = btrim(${tabela.nome})`),
    check("categorias_produto_posicao_valida", sql`${tabela.posicao} between 0 and 9999`),
  ],
);
