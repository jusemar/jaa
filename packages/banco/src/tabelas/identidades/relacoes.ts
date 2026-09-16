import { relations } from "drizzle-orm";
import { users } from "../autenticacao/better-auth.js";
import { empresas } from "../empresas/empresas.js";
import { identidades } from "./identidades.js";

export const identidadesRelacoes = relations(identidades, ({ one }) => ({
  usuario: one(users, {
    fields: [identidades.usuarioId],
    references: [users.id],
  }),
  empresa: one(empresas, {
    fields: [identidades.empresaId],
    references: [empresas.id],
  }),
}));
