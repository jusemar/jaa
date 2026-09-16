import { relations } from "drizzle-orm";
import { empresas } from "../empresas/empresas.js";
import { pedidos } from "../pedidos/pedidos.js";
import { atribuicoesEntrega } from "./atribuicoes-entrega.js";
import { entregadoresEmpresa } from "./entregadores-empresa.js";
import { paradasSaida } from "./paradas-saida.js";
import { saidasEntrega } from "./saidas-entrega.js";
import { compatibilidadesZona, zonasEntrega } from "./zonas-entrega.js";
import { configuracoesDespacho } from "./configuracoes-despacho.js";
import { consumosRoteamento } from "./consumos-roteamento.js";

export const entregadoresEmpresaRelacoes = relations(entregadoresEmpresa, ({ one, many }) => ({
  empresa: one(empresas, { fields: [entregadoresEmpresa.empresaId], references: [empresas.id] }),
  atribuicoes: many(atribuicoesEntrega),
  saidas: many(saidasEntrega),
}));

export const atribuicoesEntregaRelacoes = relations(atribuicoesEntrega, ({ one }) => ({
  pedido: one(pedidos, { fields: [atribuicoesEntrega.pedidoId], references: [pedidos.id] }),
  entregador: one(entregadoresEmpresa, { fields: [atribuicoesEntrega.entregadorId], references: [entregadoresEmpresa.id] }),
}));

export const saidasEntregaRelacoes = relations(saidasEntrega, ({ one, many }) => ({
  empresa: one(empresas, { fields: [saidasEntrega.empresaId], references: [empresas.id] }),
  entregador: one(entregadoresEmpresa, { fields: [saidasEntrega.entregadorId], references: [entregadoresEmpresa.id] }),
  zonaPrincipal: one(zonasEntrega, { fields: [saidasEntrega.zonaPrincipalId], references: [zonasEntrega.id] }),
  paradas: many(paradasSaida),
}));

export const zonasEntregaRelacoes = relations(zonasEntrega, ({ one, many }) => ({
  empresa: one(empresas, { fields: [zonasEntrega.empresaId], references: [empresas.id] }),
  saidas: many(saidasEntrega),
}));

export const compatibilidadesZonaRelacoes = relations(compatibilidadesZona, ({ one }) => ({
  empresa: one(empresas, { fields: [compatibilidadesZona.empresaId], references: [empresas.id] }),
  zonaMenor: one(zonasEntrega, { fields: [compatibilidadesZona.zonaMenorId], references: [zonasEntrega.id], relationName: "zonaMenor" }),
  zonaMaior: one(zonasEntrega, { fields: [compatibilidadesZona.zonaMaiorId], references: [zonasEntrega.id], relationName: "zonaMaior" }),
}));

export const consumosRoteamentoRelacoes = relations(consumosRoteamento, ({ one }) => ({
  empresa: one(empresas, { fields: [consumosRoteamento.empresaId], references: [empresas.id] }),
}));

export const configuracoesDespachoRelacoes = relations(configuracoesDespacho, ({ one }) => ({
  empresa: one(empresas, { fields: [configuracoesDespacho.empresaId], references: [empresas.id] }),
}));

export const paradasSaidaRelacoes = relations(paradasSaida, ({ one }) => ({
  saida: one(saidasEntrega, { fields: [paradasSaida.saidaId], references: [saidasEntrega.id] }),
  pedido: one(pedidos, { fields: [paradasSaida.pedidoId], references: [pedidos.id] }),
}));
