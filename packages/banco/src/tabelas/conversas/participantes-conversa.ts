import { index, pgTable, primaryKey, timestamp, uuid } from "drizzle-orm/pg-core";
import { identidades } from "../identidades/identidades.js";
import { conversas } from "./conversas.js";

// Quem participa de uma conversa é uma IDENTIDADE (pessoal hoje; empresarial no futuro), nunca a conta.
export const participantesConversa = pgTable(
  "participantes_conversa",
  {
    conversaId: uuid()
      .notNull()
      .references(() => conversas.id, { onDelete: "cascade" }),
    identidadeId: uuid()
      .notNull()
      .references(() => identidades.id, { onDelete: "restrict" }),
    criadoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (tabela) => [
    primaryKey({ name: "participantes_conversa_pk", columns: [tabela.conversaId, tabela.identidadeId] }),
    // Lista de conversas: WHERE identidade_id = ? (a PK começa por conversa_id e não serve a esta busca).
    index("participantes_conversa_identidade_id_conversa_id_idx").on(tabela.identidadeId, tabela.conversaId),
  ],
);
