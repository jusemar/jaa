import { sql } from "drizzle-orm";
import { check, foreignKey, index, pgTable, primaryKey, smallint, timestamp, uuid } from "drizzle-orm/pg-core";
import { opcoesProduto } from "./opcoes-produto.js";

/**
 * EM QUAIS DIAS DA SEMANA uma opção é oferecida, quando o grupo dela usa programação semanal
 * (`grupos_opcoes_produto.programacao_semanal`). A MESMA opção ("Arroz") é associada a vários dias —
 * nada é duplicado por dia.
 *
 * `dia_semana` é ISO: 1 = segunda … 7 = domingo (a mesma convenção de `periodos_atendimento`).
 *
 * Linhas aqui só têm efeito com a programação do grupo LIGADA; com ela desligada são ignoradas (o
 * gestor pode desligar e religar sem perder a programação). `empresa_id` viaja junto para a FK
 * composta com `opcoes_produto`: a associação nunca escapa da empresa da opção.
 */
export const opcoesProdutoDias = pgTable(
  "opcoes_produto_dias",
  {
    empresaId: uuid().notNull(),
    opcaoId: uuid().notNull(),
    diaSemana: smallint().notNull(),
    criadoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (tabela) => [
    // Uma opção aparece no máximo uma vez em cada dia.
    primaryKey({ name: "opcoes_produto_dias_pk", columns: [tabela.opcaoId, tabela.diaSemana] }),
    foreignKey({
      name: "opcoes_produto_dias_opcao_fk",
      columns: [tabela.empresaId, tabela.opcaoId],
      foreignColumns: [opcoesProduto.empresaId, opcoesProduto.id],
    }).onDelete("cascade"),
    // "Quais opções valem neste dia?" — a pergunta da tela do gestor.
    index("opcoes_produto_dias_empresa_dia_idx").on(tabela.empresaId, tabela.diaSemana),
    check("opcoes_produto_dias_dia_valido", sql`${tabela.diaSemana} between 1 and 7`),
  ],
);
