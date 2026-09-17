import { sql } from "drizzle-orm";
import { check, pgEnum, pgTable, primaryKey, timestamp, uuid } from "drizzle-orm/pg-core";
import { identidades } from "./identidades.js";

// "permitir": vê mesmo que a regra geral esconda. "bloquear": não vê mesmo que a regra geral mostre.
export const decisaoPrivacidade = pgEnum("decisao_privacidade", ["permitir", "bloquear"]);

/**
 * EXCEÇÕES da privacidade: "todos/contatos/ninguém" resolve a maioria dos casos, mas sempre existe
 * aquela pessoa específica para quem eu quero (ou não quero) aparecer. A exceção vale para o conjunto
 * do perfil (foto, status e presença) de uma vez — é a decisão que as pessoas realmente tomam
 * ("some para o meu chefe"), e não um cruzamento de dez chaves.
 *
 * Unilateral como a agenda: é MINHA decisão sobre QUEM vê meu perfil; ninguém é avisado.
 */
export const excecoesPrivacidade = pgTable(
  "excecoes_privacidade",
  {
    identidadeId: uuid()
      .notNull()
      .references(() => identidades.id, { onDelete: "cascade" }),
    alvoIdentidadeId: uuid()
      .notNull()
      .references(() => identidades.id, { onDelete: "cascade" }),
    decisao: decisaoPrivacidade().notNull(),
    criadoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (tabela) => [
    primaryKey({ columns: [tabela.identidadeId, tabela.alvoIdentidadeId] }),
    check("excecoes_privacidade_nao_e_voce", sql`${tabela.identidadeId} <> ${tabela.alvoIdentidadeId}`),
  ],
);
