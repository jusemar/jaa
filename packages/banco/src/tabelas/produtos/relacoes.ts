import { relations } from "drizzle-orm";
import { empresas } from "../empresas/empresas.js";
import { gruposOpcoesProduto } from "./grupos-opcoes-produto.js";
import { opcoesProduto } from "./opcoes-produto.js";
import { produtos } from "./produtos.js";

export const produtosRelacoes = relations(produtos, ({ one, many }) => ({
  empresa: one(empresas, { fields: [produtos.empresaId], references: [empresas.id] }),
  gruposOpcoes: many(gruposOpcoesProduto),
}));

export const gruposOpcoesProdutoRelacoes = relations(gruposOpcoesProduto, ({ one, many }) => ({
  produto: one(produtos, { fields: [gruposOpcoesProduto.produtoId], references: [produtos.id] }),
  opcoes: many(opcoesProduto),
}));

export const opcoesProdutoRelacoes = relations(opcoesProduto, ({ one }) => ({
  grupo: one(gruposOpcoesProduto, { fields: [opcoesProduto.grupoId], references: [gruposOpcoesProduto.id] }),
}));
