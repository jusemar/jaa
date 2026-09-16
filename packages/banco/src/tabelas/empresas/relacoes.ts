import { relations } from "drizzle-orm";
import { users } from "../autenticacao/better-auth.js";
import { identidades } from "../identidades/identidades.js";
import { empresas } from "./empresas.js";
import { produtos } from "../produtos/produtos.js";
import { membrosEmpresa } from "./membros-empresa.js";

export const empresasRelacoes = relations(empresas, ({ many }) => ({
  identidades: many(identidades),
  membros: many(membrosEmpresa),
  produtos: many(produtos),
}));

export const membrosEmpresaRelacoes = relations(membrosEmpresa, ({ one }) => ({
  empresa: one(empresas, { fields: [membrosEmpresa.empresaId], references: [empresas.id] }),
  usuario: one(users, { fields: [membrosEmpresa.usuarioId], references: [users.id] }),
}));
