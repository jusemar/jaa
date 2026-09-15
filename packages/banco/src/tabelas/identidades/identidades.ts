import { sql } from "drizzle-orm";
import { check, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "../autenticacao/better-auth.js";

// Na Fase 1 só existe identidade pessoal. Identidades empresariais entrarão como novo valor
// deste enum, com vínculo à organização, sem alterar quem envia mensagens (a identidade).
export const tipoIdentidade = pgEnum("tipo_identidade", ["pessoal"]);

export const identidades = pgTable(
  "identidades",
  {
    id: uuid().primaryKey().defaultRandom(),
    // Conta autenticável (Better Auth) dona da identidade pessoal.
    usuarioId: text()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    tipo: tipoIdentidade().notNull(),
    nomeExibicao: text().notNull(),
    // Sempre armazenado na forma canônica minúscula; ver normalizarNomeUsuario em @jaa/contratos.
    nomeUsuario: text().notNull(),
    criadoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (tabela) => [
    uniqueIndex("identidades_nome_usuario_unico").on(tabela.nomeUsuario),
    // Exatamente uma identidade pessoal por conta, garantido pelo banco.
    uniqueIndex("identidades_pessoal_por_usuario_unico")
      .on(tabela.usuarioId)
      .where(sql`${tabela.tipo} = 'pessoal'`),
    // Formato canônico: minúsculas impedem duplicidade por variação de maiúsculas.
    check("identidades_nome_usuario_formato", sql`${tabela.nomeUsuario} ~ '^[a-z][a-z0-9_]{2,29}$'`),
    check(
      "identidades_nome_exibicao_valido",
      sql`char_length(${tabela.nomeExibicao}) between 1 and 50 and ${tabela.nomeExibicao} = btrim(${tabela.nomeExibicao})`,
    ),
  ],
);
