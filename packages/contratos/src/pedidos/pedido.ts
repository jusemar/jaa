import * as z from "zod";
import { empresaPublicaSchema } from "../catalogo/catalogo-publico.ts";
import { participanteConversaSchema } from "../conversas/conversa.ts";
import { eventoStatusPedidoSchema, statusPedidoSchema } from "./status-pedido.ts";

/*
 * PEDIDO JAA: domínio ÚNICO, qualquer que seja a origem (hoje, a conversa com a empresa; no futuro,
 * loja pública e app). O Jaa NÃO processa pagamento nesta versão: o cliente informa apenas como
 * pretende pagar NA ENTREGA. Preço unitário, subtotais e total são SEMPRE recalculados pelo servidor
 * a partir do banco; o cliente envia só produto e quantidade.
 */

export const QUANTIDADE_MAXIMA_POR_ITEM = 99;
export const MAXIMO_ITENS_POR_PEDIDO = 30;
export const TOTAL_MAXIMO_PEDIDO_CENTAVOS = 999_999_999;

export const origemPedidoSchema = z.enum(["conversa"]);

// Pagamento PRESENCIAL, na entrega. Nunca há dados de cartão no Jaa.
export const formaPagamentoEntregaSchema = z.enum(["dinheiro", "cartao"]);

export type FormaPagamentoEntrega = z.infer<typeof formaPagamentoEntregaSchema>;

export const ROTULO_PAGAMENTO_ENTREGA: Record<FormaPagamentoEntrega, string> = {
  dinheiro: "Dinheiro na entrega",
  cartao: "Cartão na entrega",
};

const centavosPositivos = z.number().int().min(1).max(TOTAL_MAXIMO_PEDIDO_CENTAVOS);

/**
 * Pagamento escolhido:
 * - `cartao`: nada além da forma (payload com troco é RECUSADO, não só escondido na interface);
 * - `dinheiro`: `trocoParaCentavos` só quando o cliente PRECISA de troco. Sem troco → null/ausente.
 *   O servidor ainda valida contra o total (precisa ser maior; igual ao total vira "sem troco").
 */
export const pagamentoNaEntregaEntradaSchema = z.discriminatedUnion("forma", [
  z.object({ forma: z.literal("cartao") }).strict(),
  z.object({ forma: z.literal("dinheiro"), trocoParaCentavos: centavosPositivos.nullable().optional() }),
]);

export type PagamentoNaEntradaEntrada = z.input<typeof pagamentoNaEntregaEntradaSchema>;

// O cliente envia produto e quantidade; jamais preço, subtotal ou total.
export const itemPedidoEntradaSchema = z.object({
  produtoId: z.uuid(),
  quantidade: z.number().int().min(1).max(QUANTIDADE_MAXIMA_POR_ITEM),
});

/**
 * Criação do pedido. A identidade do CLIENTE vem da sessão (identidade atuante), nunca do corpo.
 * `idCliente` é a chave de idempotência da tentativa: confirmar duas vezes devolve o MESMO pedido.
 * Todos os itens precisam ser da empresa informada (o servidor confere; o banco também).
 */
export const criarPedidoEntradaSchema = z.object({
  idCliente: z.uuid(),
  // Empresa pela sua identidade pública (a mesma da conversa e do catálogo).
  empresaIdentidadeId: z.uuid(),
  conversaId: z.uuid(),
  itens: z.array(itemPedidoEntradaSchema).min(1, "Adicione ao menos um produto.").max(MAXIMO_ITENS_POR_PEDIDO),
  pagamento: pagamentoNaEntregaEntradaSchema,
});

export type CriarPedidoEntrada = z.input<typeof criarPedidoEntradaSchema>;

// Snapshot histórico: nome e preço como estavam na compra (mudanças posteriores não alteram o pedido).
export const itemPedidoSchema = z.object({
  id: z.uuid(),
  // Referência ao produto atual quando ainda existir; o snapshot vale por si.
  produtoId: z.uuid().nullable(),
  nomeProduto: z.string(),
  precoUnitarioCentavos: z.number().int(),
  quantidade: z.number().int(),
  subtotalCentavos: z.number().int(),
});

export type ItemPedido = z.infer<typeof itemPedidoSchema>;

export const pedidoSchema = z.object({
  id: z.uuid(),
  origem: origemPedidoSchema,
  conversaId: z.uuid().nullable(),
  empresa: empresaPublicaSchema,
  // Dados públicos do cliente (a empresa precisa saber de quem é o pedido).
  cliente: participanteConversaSchema,
  status: statusPedidoSchema,
  // Preenchido só quando a empresa cancela (o cliente vê o motivo; nunca quem operou).
  motivoCancelamento: z.string().nullable(),
  formaPagamentoNaEntrega: formaPagamentoEntregaSchema,
  // Só no dinheiro com troco; sempre > total. Cartão nunca tem troco.
  trocoParaCentavos: z.number().int().nullable(),
  totalCentavos: z.number().int(),
  itens: z.array(itemPedidoSchema).min(1),
  // Append-only, em ordem cronológica: só o que REALMENTE aconteceu (começa em "recebido").
  historico: z.array(eventoStatusPedidoSchema).min(1),
  criadoEm: z.iso.datetime(),
  atualizadoEm: z.iso.datetime(),
});

export type Pedido = z.infer<typeof pedidoSchema>;

// Card do pedido na conversa: referencia o Pedido real (id) e traz o resumo para exibir.
export const resumoPedidoSchema = z.object({
  id: z.uuid(),
  status: statusPedidoSchema,
  formaPagamentoNaEntrega: formaPagamentoEntregaSchema,
  trocoParaCentavos: z.number().int().nullable(),
  totalCentavos: z.number().int(),
  itens: z.array(z.object({ nomeProduto: z.string(), quantidade: z.number().int(), subtotalCentavos: z.number().int() })),
});

export type ResumoPedido = z.infer<typeof resumoPedidoSchema>;

// Troco a devolver = valor que o cliente entrega − total. Informativo (o Jaa não movimenta dinheiro).
export function trocoEsperadoCentavos(pedido: { totalCentavos: number; trocoParaCentavos: number | null }): number | null {
  return pedido.trocoParaCentavos === null ? null : pedido.trocoParaCentavos - pedido.totalCentavos;
}
