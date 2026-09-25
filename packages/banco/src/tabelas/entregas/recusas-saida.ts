import { sql } from "drizzle-orm";
import {
  foreignKey,
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { empresas } from "../empresas/empresas.js";
import { entregadoresEmpresa } from "./entregadores-empresa.js";
import { saidasEntrega } from "./saidas-entrega.js";

/** Auditoria mínima e bloqueio durável de reatribuição automática da mesma saída. */
export const recusasSaida = pgTable(
  "recusas_saida",
  {
    id: uuid()
      .primaryKey()
      .default(sql`uuidv7()`),
    saidaId: uuid().notNull(),
    entregadorId: uuid().notNull(),
    empresaId: uuid()
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    recusadaEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (tabela) => [
    uniqueIndex("recusas_saida_saida_entregador_unico").on(
      tabela.saidaId,
      tabela.entregadorId,
    ),
    index("recusas_saida_entregador_id_idx").on(tabela.entregadorId, tabela.id),
    foreignKey({
      name: "recusas_saida_saida_da_empresa_fk",
      columns: [tabela.saidaId, tabela.empresaId],
      foreignColumns: [saidasEntrega.id, saidasEntrega.empresaId],
    }).onDelete("cascade"),
    foreignKey({
      name: "recusas_saida_entregador_da_empresa_fk",
      columns: [tabela.entregadorId, tabela.empresaId],
      foreignColumns: [entregadoresEmpresa.id, entregadoresEmpresa.empresaId],
    }).onDelete("cascade"),
  ],
);
