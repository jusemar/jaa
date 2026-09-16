import { sql } from "drizzle-orm";
import { index, integer, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { empresas } from "../empresas/empresas.js";

export const operacaoRoteamento = pgEnum("operacao_roteamento", ["otimizacao", "percurso"]);

export const resultadoRoteamento = pgEnum("resultado_roteamento", ["sucesso", "falha", "nao_aplicavel"]);

/**
 * CONSUMO DE ROTEAMENTO por empresa: uma linha por chamada ao provedor (ou por tentativa recusada
 * antes de chamar). Não é cobrança — é observabilidade, para responder "quantas operações de rota a
 * Empresa X gerou neste período?" antes de qualquer decisão comercial sobre custo.
 *
 * Guarda só o mínimo: empresa, saída, provedor, tipo da operação, resultado e tamanho do problema.
 * Nenhuma coordenada de cliente vive aqui.
 */
export const consumosRoteamento = pgTable(
  "consumos_roteamento",
  {
    id: uuid().primaryKey().default(sql`uuidv7()`),
    empresaId: uuid()
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    // A saída pode ser apagada no futuro sem levar junto o histórico de consumo.
    saidaId: uuid(),
    provedor: text().notNull(),
    operacao: operacaoRoteamento().notNull(),
    resultado: resultadoRoteamento().notNull(),
    // Quantas paradas o cálculo envolvia (proxy do tamanho do problema e do custo).
    paradas: integer().notNull(),
    // Preenchido quando o provedor não pôde ser usado (mesmos motivos expostos no contrato da rota).
    motivo: text(),
    duracaoMs: integer(),
    criadoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (tabela) => [
    // "Consumo da empresa X no período": a consulta que essa tabela existe para responder.
    index("consumos_roteamento_empresa_criado_em_idx").on(tabela.empresaId, tabela.criadoEm),
  ],
);
