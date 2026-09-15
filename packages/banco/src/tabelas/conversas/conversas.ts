import { sql } from "drizzle-orm";
import { check, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// "direta" = conversa entre exatamente duas identidades. Grupos e outros tipos entrarão como novos valores.
export const tipoConversa = pgEnum("tipo_conversa", ["direta"]);

export const conversas = pgTable(
  "conversas",
  {
    id: uuid().primaryKey().defaultRandom(),
    tipo: tipoConversa().notNull(),
    // Par canônico "<menor identidadeId>:<maior identidadeId>": A↔B e B↔A geram a mesma chave.
    // A unicidade no banco impede conversas diretas duplicadas, inclusive sob concorrência.
    chaveDireta: text().unique("conversas_chave_direta_unica"),
    criadoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (tabela) => [
    check("conversas_chave_direta_por_tipo", sql`(${tabela.tipo} = 'direta') = (${tabela.chaveDireta} is not null)`),
  ],
);
