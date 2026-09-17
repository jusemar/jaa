import { sql } from "drizzle-orm";
import { boolean, check, index, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { identidades } from "../identidades/identidades.js";

/**
 * AGENDA DE CONTATOS, por IDENTIDADE.
 *
 * A relação é UNILATERAL: Junior salvar @maria coloca Maria na agenda de Junior e NÃO coloca Junior
 * na agenda de Maria. Cada um decide a própria agenda.
 *
 * A agenda é da identidade ATUANTE: a agenda pessoal de quem opera uma empresa não se mistura com a
 * agenda da empresa. E contato não é autorização: conversar com alguém nunca dependeu de estar salvo
 * (nem salvar alguém dá acesso a coisa nenhuma).
 */
export const contatos = pgTable(
  "contatos",
  {
    // Dona da agenda (pessoal ou empresarial).
    identidadeId: uuid()
      .notNull()
      .references(() => identidades.id, { onDelete: "cascade" }),
    // Quem foi salvo.
    contatoIdentidadeId: uuid()
      .notNull()
      .references(() => identidades.id, { onDelete: "cascade" }),
    // Apelido opcional na agenda de quem salvou (não muda o nome público da outra identidade).
    apelido: text(),
    // Bloqueio/silenciamento entram aqui no futuro, sem tabela nova.
    favorito: boolean().notNull().default(false),
    criadoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (tabela) => [
    primaryKey({ name: "contatos_pk", columns: [tabela.identidadeId, tabela.contatoIdentidadeId] }),
    // "Meus contatos", em ordem estável.
    index("contatos_identidade_idx").on(tabela.identidadeId, tabela.criadoEm),
    check("contatos_nao_e_voce", sql`${tabela.identidadeId} <> ${tabela.contatoIdentidadeId}`),
    check("contatos_apelido_valido", sql`${tabela.apelido} is null or length(btrim(${tabela.apelido})) between 1 and 40`),
  ],
);
