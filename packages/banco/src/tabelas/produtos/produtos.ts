import { sql } from "drizzle-orm";
import { check, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { empresas } from "../empresas/empresas.js";

// "indisponivel": continua existindo e administrável; futuramente não entra em pedidos novos.
export const disponibilidadeProduto = pgEnum("disponibilidade_produto", ["disponivel", "indisponivel"]);

/**
 * PRODUTO DA EMPRESA: um único domínio para todos os canais (administração Web, futura loja pública,
 * chat e app). Sem tabela "catálogo" nesta fase: o catálogo de uma empresa é o conjunto dos seus produtos.
 * Categorias, seções, ordenação e destaques poderão referenciar esta tabela sem alterá-la.
 *
 * `empresa_id` é estrutural e IMUTÁVEL (trigger `produtos_empresa_imutavel`, migration 0008): produto
 * nunca troca de empresa por edição. Sem DELETE nas APIs: exclusão futura será lógica, pois pedidos
 * históricos poderão referenciar o produto.
 */
export const produtos = pgTable(
  "produtos",
  {
    id: uuid().primaryKey().defaultRandom(),
    empresaId: uuid()
      .notNull()
      .references(() => empresas.id, { onDelete: "restrict" }),
    nome: text().notNull(),
    // null = sem descrição (nunca string vazia).
    descricao: text(),
    // Dinheiro em CENTAVOS inteiros (R$ 39,90 = 3990): sem ponto flutuante em nenhuma camada.
    precoCentavos: integer().notNull(),
    disponibilidade: disponibilidadeProduto().notNull().default("disponivel"),
    criadoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (tabela) => [
    // Listagem administrativa (e futura consulta pública) sempre filtra por empresa.
    index("produtos_empresa_id_criado_em_idx").on(tabela.empresaId, tabela.criadoEm),
    // Alvo da FK composta dos itens de pedido: o produto do item é da mesma empresa do pedido.
    uniqueIndex("produtos_empresa_id_id_unico").on(tabela.empresaId, tabela.id),
    // Mantidos em sincronia com os schemas de @jaa/contratos (produtos/produto.ts).
    check("produtos_nome_valido", sql`char_length(${tabela.nome}) between 1 and 120 and ${tabela.nome} = btrim(${tabela.nome})`),
    check(
      "produtos_descricao_valida",
      sql`${tabela.descricao} is null or (char_length(${tabela.descricao}) between 1 and 1000 and ${tabela.descricao} = btrim(${tabela.descricao}))`,
    ),
    check("produtos_preco_centavos_valido", sql`${tabela.precoCentavos} between 1 and 99999999`),
  ],
);
