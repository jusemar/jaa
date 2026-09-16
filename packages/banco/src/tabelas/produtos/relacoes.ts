import { relations } from "drizzle-orm";
import { empresas } from "../empresas/empresas.js";
import { produtos } from "./produtos.js";

export const produtosRelacoes = relations(produtos, ({ one }) => ({
  empresa: one(empresas, { fields: [produtos.empresaId], references: [empresas.id] }),
}));
