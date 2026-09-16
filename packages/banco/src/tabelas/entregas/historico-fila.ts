import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { entregadoresEmpresa } from "./entregadores-empresa.js";

/**
 * Auditoria mínima da FILA DA BASE: quando o entregador entrou e quando (e por que) saiu.
 * Não guarda localização nenhuma — só o fato derivado, que é o que a operação precisa revisar depois.
 */
export const historicoFilaEntregador = pgTable(
  "historico_fila_entregador",
  {
    id: uuid().primaryKey().default(sql`uuidv7()`),
    entregadorId: uuid()
      .notNull()
      .references(() => entregadoresEmpresa.id, { onDelete: "cascade" }),
    entrouEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
    saiuEm: timestamp({ withTimezone: true }),
    motivoSaida: text(),
  },
  (tabela) => [index("historico_fila_entregador_entregador_id_id_idx").on(tabela.entregadorId, tabela.id)],
);
