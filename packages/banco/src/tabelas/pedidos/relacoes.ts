import { relations } from "drizzle-orm";
import { conversas } from "../conversas/conversas.js";
import { empresas } from "../empresas/empresas.js";
import { identidades } from "../identidades/identidades.js";
import { produtos } from "../produtos/produtos.js";
import { enderecosCliente } from "../enderecos/enderecos-cliente.js";
import { destinosPedido } from "./destinos-pedido.js";
import { historicoStatusPedido } from "./historico-status-pedido.js";
import { itensPedido } from "./itens-pedido.js";
import { pedidos } from "./pedidos.js";

export const pedidosRelacoes = relations(pedidos, ({ one, many }) => ({
  empresa: one(empresas, { fields: [pedidos.empresaId], references: [empresas.id] }),
  cliente: one(identidades, { fields: [pedidos.clienteIdentidadeId], references: [identidades.id] }),
  conversa: one(conversas, { fields: [pedidos.conversaId], references: [conversas.id] }),
  itens: many(itensPedido),
  historico: many(historicoStatusPedido),
  destino: one(destinosPedido, { fields: [pedidos.id], references: [destinosPedido.pedidoId] }),
}));

export const destinosPedidoRelacoes = relations(destinosPedido, ({ one }) => ({
  pedido: one(pedidos, { fields: [destinosPedido.pedidoId], references: [pedidos.id] }),
  endereco: one(enderecosCliente, { fields: [destinosPedido.enderecoId], references: [enderecosCliente.id] }),
}));

export const historicoStatusPedidoRelacoes = relations(historicoStatusPedido, ({ one }) => ({
  pedido: one(pedidos, { fields: [historicoStatusPedido.pedidoId], references: [pedidos.id] }),
}));

export const itensPedidoRelacoes = relations(itensPedido, ({ one }) => ({
  pedido: one(pedidos, { fields: [itensPedido.pedidoId], references: [pedidos.id] }),
  produto: one(produtos, { fields: [itensPedido.produtoId], references: [produtos.id] }),
}));
