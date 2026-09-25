import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { disponibilidadeProduto } from "./produtos.js";
import { gruposOpcoesProduto } from "./grupos-opcoes-produto.js";

/**
 * OPÇÃO dentro de um grupo ("Grande", "Arroz branco", "Bife bovino"). Reaproveita o enum de
 * disponibilidade dos produtos: opção indisponível continua existindo e administrável, apenas não
 * é oferecida ao cliente — a mesma regra do produto, sem conceito novo.
 *
 * `preco_adicional_centavos` é um ACRÉSCIMO sobre o preço do produto (0 = não muda o preço). É assim
 * que "Pequeno R$ 24,90 / Grande R$ 29,90" existe sem um segundo preço paralelo ao do produto.
 */
export const opcoesProduto = pgTable(
  "opcoes_produto",
  {
    id: uuid().primaryKey().defaultRandom(),
    empresaId: uuid().notNull(),
    grupoId: uuid().notNull(),
    nome: text().notNull(),
    // Dinheiro em CENTAVOS inteiros, como em todo o resto do Jaa.
    precoAdicionalCentavos: integer().notNull().default(0),
    disponibilidade: disponibilidadeProduto().notNull().default("disponivel"),
    posicao: integer().notNull().default(0),
    criadoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (tabela) => [
    foreignKey({
      name: "opcoes_produto_grupo_fk",
      columns: [tabela.empresaId, tabela.grupoId],
      foreignColumns: [gruposOpcoesProduto.empresaId, gruposOpcoesProduto.id],
    }).onDelete("cascade"),
    index("opcoes_produto_grupo_posicao_idx").on(tabela.grupoId, tabela.posicao),
    // Alvo da FK composta das escolhas gravadas no pedido (referência auxiliar ao snapshot).
    uniqueIndex("opcoes_produto_empresa_id_id_unico").on(tabela.empresaId, tabela.id),
    check("opcoes_produto_nome_valido", sql`char_length(${tabela.nome}) between 1 and 80 and ${tabela.nome} = btrim(${tabela.nome})`),
    check("opcoes_produto_preco_adicional_valido", sql`${tabela.precoAdicionalCentavos} between 0 and 99999999`),
    check("opcoes_produto_posicao_valida", sql`${tabela.posicao} between 0 and 9999`),
  ],
);
