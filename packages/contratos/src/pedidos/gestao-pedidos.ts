import * as z from "zod";
import { participanteConversaSchema } from "../conversas/conversa.ts";
import { formaPagamentoEntregaSchema } from "./pedido.ts";
import { motivoCancelamentoSchema, statusPedidoSchema } from "./status-pedido.ts";

/*
 * GESTÃO DO PEDIDO PELA EMPRESA. Mesmo domínio Pedido: a empresa opera, o cliente acompanha.
 * Nenhuma rota aceita "status: qualquerCoisa": a empresa declara a INTENÇÃO (avançar/cancelar) e o
 * status que estava vendo; o servidor confere a transição e o estado atual no banco.
 */

// Agrupamento só de INTERFACE: "Em entrega" reúne dois estados reais, sem inventar status novo.
export const filtroPedidosEmpresaSchema = z.enum(["todos", "recebidos", "confirmados", "em_preparacao", "prontos", "em_entrega", "entregues", "cancelados"]);

export type FiltroPedidosEmpresa = z.infer<typeof filtroPedidosEmpresaSchema>;

export const STATUS_POR_FILTRO_PEDIDOS: Record<FiltroPedidosEmpresa, readonly z.infer<typeof statusPedidoSchema>[]> = {
  todos: [],
  recebidos: ["recebido"],
  confirmados: ["confirmado"],
  em_preparacao: ["em_preparacao"],
  prontos: ["pronto"],
  em_entrega: ["saiu_para_entrega", "em_rota"],
  entregues: ["entregue"],
  cancelados: ["cancelado"],
};

export const ROTULO_FILTRO_PEDIDOS: Record<FiltroPedidosEmpresa, string> = {
  todos: "Todos",
  recebidos: "Recebidos",
  confirmados: "Confirmados",
  em_preparacao: "Em preparação",
  prontos: "Prontos",
  em_entrega: "Em entrega",
  entregues: "Entregues",
  cancelados: "Cancelados",
};

export const LIMITE_PADRAO_PEDIDOS_EMPRESA = 20;
export const LIMITE_MAXIMO_PEDIDOS_EMPRESA = 50;

// Linha da lista operacional: o suficiente para triagem, sem carregar os itens de todos os pedidos.
export const pedidoDaEmpresaSchema = z.object({
  id: z.uuid(),
  status: statusPedidoSchema,
  cliente: participanteConversaSchema,
  conversaId: z.uuid().nullable(),
  quantidadeItens: z.number().int().min(1),
  totalCentavos: z.number().int(),
  formaPagamentoNaEntrega: formaPagamentoEntregaSchema,
  trocoParaCentavos: z.number().int().nullable(),
  criadoEm: z.iso.datetime(),
});

export type PedidoDaEmpresa = z.infer<typeof pedidoDaEmpresaSchema>;

export const listaPedidosEmpresaSchema = z.object({
  pedidos: z.array(pedidoDaEmpresaSchema),
  // Cursor = id (UUIDv7) do pedido mais antigo da página; ordem determinística do mais recente ao mais antigo.
  proximoCursor: z.uuid().nullable(),
});

export type ListaPedidosEmpresa = z.infer<typeof listaPedidosEmpresaSchema>;

/**
 * `statusAtual` é o estado que a empresa estava vendo. Se outro operador já mudou o pedido, a operação
 * é recusada (409) em vez de produzir um histórico impossível.
 */
export const avancarStatusPedidoEntradaSchema = z.object({ statusAtual: statusPedidoSchema });

export type AvancarStatusPedidoEntrada = z.infer<typeof avancarStatusPedidoEntradaSchema>;

export const cancelarPedidoEntradaSchema = z.object({ statusAtual: statusPedidoSchema, motivo: motivoCancelamentoSchema });

export type CancelarPedidoEntrada = z.infer<typeof cancelarPedidoEntradaSchema>;
