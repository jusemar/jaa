import { relations } from "drizzle-orm";
import { empresas } from "../empresas/empresas.js";
import { pedidos } from "../pedidos/pedidos.js";
import { atribuicoesEntrega } from "./atribuicoes-entrega.js";
import { entregadoresEmpresa } from "./entregadores-empresa.js";

export const entregadoresEmpresaRelacoes = relations(entregadoresEmpresa, ({ one, many }) => ({
  empresa: one(empresas, { fields: [entregadoresEmpresa.empresaId], references: [empresas.id] }),
  atribuicoes: many(atribuicoesEntrega),
}));

export const atribuicoesEntregaRelacoes = relations(atribuicoesEntrega, ({ one }) => ({
  pedido: one(pedidos, { fields: [atribuicoesEntrega.pedidoId], references: [pedidos.id] }),
  entregador: one(entregadoresEmpresa, { fields: [atribuicoesEntrega.entregadorId], references: [entregadoresEmpresa.id] }),
}));
