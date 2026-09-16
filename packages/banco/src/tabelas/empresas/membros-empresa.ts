import { index, pgEnum, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "../autenticacao/better-auth.js";
import { empresas } from "./empresas.js";

// Papéis de quem opera uma empresa. Nesta fase só "proprietario"; administrador, atendente,
// funcionário e entregador entram como novos valores (e permissões), sem mudar a estrutura.
export const papelMembroEmpresa = pgEnum("papel_membro_empresa", ["proprietario"]);

/**
 * Vínculo CONTA ↔ EMPRESA: a conta autenticável (Better Auth) pode operar a identidade empresarial.
 * O vínculo é com a conta, não com a identidade pessoal: operar uma empresa nunca expõe à empresa (nem a
 * seus futuros membros) as conversas, contatos ou dados da identidade pessoal de quem opera.
 * Uma conta pode ter várias empresas e uma empresa, vários membros.
 */
export const membrosEmpresa = pgTable(
  "membros_empresa",
  {
    empresaId: uuid()
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    usuarioId: text()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    papel: papelMembroEmpresa().notNull(),
    criadoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (tabela) => [
    primaryKey({ name: "membros_empresa_pk", columns: [tabela.empresaId, tabela.usuarioId] }),
    // "Quais empresas esta conta pode operar?" (a PK começa por empresa_id e não serve a esta busca).
    index("membros_empresa_usuario_id_empresa_id_idx").on(tabela.usuarioId, tabela.empresaId),
  ],
);
