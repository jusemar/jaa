import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { produtos } from "./produtos.js";

/**
 * GRUPO DE OPÇÕES de um produto ("Tamanho", "Guarnições", "Tipo de carne"…). O domínio não conhece
 * nenhum desses nomes: quem os cadastra é a empresa. O que o Jaa define é a ESTRUTURA — nome,
 * instrução e quantas opções podem ser escolhidas.
 *
 * `minimo_escolhas`/`maximo_escolhas` descrevem sozinhos o comportamento: obrigatório é mínimo ≥ 1 e
 * escolha única é máximo = 1. Não existe coluna "obrigatorio" ou "tipo" que possa contradizê-los.
 *
 * `empresa_id` viaja junto (desnormalizado de propósito) para a FK composta com `produtos`: o grupo
 * nunca troca de empresa e nunca escapa do escopo do produto.
 */
export const gruposOpcoesProduto = pgTable(
  "grupos_opcoes_produto",
  {
    id: uuid().primaryKey().defaultRandom(),
    empresaId: uuid().notNull(),
    produtoId: uuid().notNull(),
    nome: text().notNull(),
    // null = sem linha de ajuda (nunca string vazia).
    instrucao: text(),
    minimoEscolhas: integer().notNull().default(0),
    maximoEscolhas: integer().notNull().default(1),
    // Ordem de apresentação escolhida pela empresa (menor primeiro); empate resolve pelo id.
    posicao: integer().notNull().default(0),
    criadoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (tabela) => [
    // O grupo é do produto E da empresa dele: o banco garante, não a rota.
    foreignKey({
      name: "grupos_opcoes_produto_produto_fk",
      columns: [tabela.empresaId, tabela.produtoId],
      foreignColumns: [produtos.empresaId, produtos.id],
    }).onDelete("cascade"),
    index("grupos_opcoes_produto_produto_posicao_idx").on(tabela.produtoId, tabela.posicao),
    // Alvo da FK composta das opções: a opção é do grupo E da empresa dele.
    uniqueIndex("grupos_opcoes_produto_empresa_id_id_unico").on(tabela.empresaId, tabela.id),
    // Mantidos em sincronia com @jaa/contratos (produtos/personalizacao.ts).
    check("grupos_opcoes_produto_nome_valido", sql`char_length(${tabela.nome}) between 1 and 80 and ${tabela.nome} = btrim(${tabela.nome})`),
    check(
      "grupos_opcoes_produto_instrucao_valida",
      sql`${tabela.instrucao} is null or (char_length(${tabela.instrucao}) between 1 and 200 and ${tabela.instrucao} = btrim(${tabela.instrucao}))`,
    ),
    // Um grupo que não aceita nenhuma escolha não é um grupo; e exigir mais do que o teto é impossível.
    check("grupos_opcoes_produto_faixa_valida", sql`${tabela.maximoEscolhas} between 1 and 50 and ${tabela.minimoEscolhas} between 0 and ${tabela.maximoEscolhas}`),
    check("grupos_opcoes_produto_posicao_valida", sql`${tabela.posicao} between 0 and 9999`),
  ],
);
