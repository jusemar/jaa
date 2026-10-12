import * as z from "zod";
import { participanteConversaSchema } from "../conversas/conversa.ts";
import { formaPagamentoEntregaSchema } from "./pedido.ts";
import { entregadorAtribuidoSchema, eventoAtribuicaoSchema } from "../entregas/entregador.ts";
import { dataLocalSchema, periodoPedidosSchema, problemaDoPeriodoPersonalizado } from "./periodo-pedidos.ts";
import type { SaidaEntrega } from "../entregas/saida.ts";
import { motivoCancelamentoSchema, statusPedidoSchema, type StatusPedido } from "./status-pedido.ts";

/*
 * GESTÃO DO PEDIDO PELA EMPRESA. Mesmo domínio Pedido: a empresa opera, o cliente acompanha.
 * Nenhuma rota aceita "status: qualquerCoisa": a empresa declara a INTENÇÃO (avançar/cancelar) e o
 * status que estava vendo; o servidor confere a transição e o estado atual no banco.
 */

// Agrupamento só de INTERFACE: "Em entrega" reúne dois estados reais, sem inventar status novo.
export const filtroPedidosEmpresaSchema = z.enum(["todos", "recebidos", "em_preparacao", "prontos", "em_entrega", "entregues", "cancelados"]);

export type FiltroPedidosEmpresa = z.infer<typeof filtroPedidosEmpresaSchema>;

export const STATUS_POR_FILTRO_PEDIDOS: Record<FiltroPedidosEmpresa, readonly z.infer<typeof statusPedidoSchema>[]> = {
  todos: [],
  // CONFIRMADO é legado e aparece junto de Recebidos até o pedido histórico avançar.
  recebidos: ["recebido", "confirmado"],
  em_preparacao: ["em_preparacao"],
  prontos: ["pronto"],
  em_entrega: ["saiu_para_entrega", "em_rota"],
  entregues: ["entregue"],
  cancelados: ["cancelado"],
};

export const ROTULO_FILTRO_PEDIDOS: Record<FiltroPedidosEmpresa, string> = {
  todos: "Todos",
  recebidos: "Recebidos",
  em_preparacao: "Em preparação",
  prontos: "Prontos",
  em_entrega: "Em entrega",
  entregues: "Entregues",
  cancelados: "Cancelados",
};

export const LIMITE_PADRAO_PEDIDOS_EMPRESA = 20;
export const LIMITE_MAXIMO_PEDIDOS_EMPRESA = 50;

/**
 * Consulta da lista (query string). O PERÍODO vale para a lista E para as contagens; o filtro de status
 * e a página valem só para a lista. As datas só existem no período personalizado.
 */
export const consultaPedidosEmpresaSchema = z
  .object({
    filtro: filtroPedidosEmpresaSchema.default("todos"),
    antesDe: z.uuid().optional(),
    limite: z.coerce.number().int().min(1).max(LIMITE_MAXIMO_PEDIDOS_EMPRESA).default(LIMITE_PADRAO_PEDIDOS_EMPRESA),
    periodo: periodoPedidosSchema.default("todos"),
    dataInicial: dataLocalSchema.optional(),
    dataFinal: dataLocalSchema.optional(),
  })
  .superRefine((consulta, contexto) => {
    if (consulta.periodo !== "personalizado") return;
    const problema = problemaDoPeriodoPersonalizado(consulta.dataInicial, consulta.dataFinal);
    if (problema) contexto.addIssue({ code: "custom", path: ["dataFinal"], message: problema });
  });

export type ConsultaPedidosEmpresa = z.infer<typeof consultaPedidosEmpresaSchema>;

/** Quantos pedidos cada filtro tem NO PERÍODO pedido — nunca só na página carregada. */
export const contagensPedidosEmpresaSchema = z.object({
  todos: z.number().int().min(0),
  recebidos: z.number().int().min(0),
  em_preparacao: z.number().int().min(0),
  prontos: z.number().int().min(0),
  em_entrega: z.number().int().min(0),
  entregues: z.number().int().min(0),
  cancelados: z.number().int().min(0),
});

export type ContagensPedidosEmpresa = z.infer<typeof contagensPedidosEmpresaSchema>;

/** Soma as quantidades por STATUS real nos filtros da tela ("Em entrega" reúne dois status; "Todos", todos). */
export function contagensPorFiltro(porStatus: Partial<Record<StatusPedido, number>>): ContagensPedidosEmpresa {
  const soma = (status: readonly StatusPedido[]) => status.reduce((total, item) => total + (porStatus[item] ?? 0), 0);
  return {
    todos: Object.values(porStatus).reduce((total, quantidade) => total + (quantidade ?? 0), 0),
    recebidos: soma(STATUS_POR_FILTRO_PEDIDOS.recebidos),
    em_preparacao: soma(STATUS_POR_FILTRO_PEDIDOS.em_preparacao),
    prontos: soma(STATUS_POR_FILTRO_PEDIDOS.prontos),
    em_entrega: soma(STATUS_POR_FILTRO_PEDIDOS.em_entrega),
    entregues: soma(STATUS_POR_FILTRO_PEDIDOS.entregues),
    cancelados: soma(STATUS_POR_FILTRO_PEDIDOS.cancelados),
  };
}

// Linha da lista operacional: o suficiente para triagem, sem carregar os itens de todos os pedidos.
export const pedidoDaEmpresaSchema = z.object({
  id: z.uuid(),
  numero: z.number().int().positive(),
  status: statusPedidoSchema,
  cliente: participanteConversaSchema,
  conversaId: z.uuid().nullable(),
  quantidadeItens: z.number().int().min(1),
  // total = subtotal + freteFinal; a zona é o snapshot do pedido (null sem zona aplicada).
  subtotalCentavos: z.number().int(),
  freteFinalCentavos: z.number().int(),
  zonaEntregaNome: z.string().nullable(),
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
  // Quantos pedidos o FILTRO tem ao todo (não só nesta página): é o que permite "1–10 de 36" e
  // "Página 1 de 4" sem carregar a lista inteira.
  total: z.number().int().min(0),
  // Quantidade de cada filtro no PERÍODO da consulta (independe do filtro marcado e da página).
  contagens: contagensPedidosEmpresaSchema,
});

export type ListaPedidosEmpresa = z.infer<typeof listaPedidosEmpresaSchema>;

/**
 * Visão OPERACIONAL do pedido para a empresa: entregador atual + histórico de atribuições.
 * Não faz parte do contrato do cliente — ele não precisa saber de trocas internas de entregador.
 */
export const entregaDoPedidoSchema = z.object({
  entregadorAtual: entregadorAtribuidoSchema.nullable(),
  historico: z.array(eventoAtribuicaoSchema),
});

export type EntregaDoPedido = z.infer<typeof entregaDoPedidoSchema>;

/**
 * `statusAtual` é o estado que a empresa estava vendo. Se outro operador já mudou o pedido, a operação
 * é recusada (409) em vez de produzir um histórico impossível.
 */
export const avancarStatusPedidoEntradaSchema = z.object({ statusAtual: statusPedidoSchema });

export type AvancarStatusPedidoEntrada = z.infer<typeof avancarStatusPedidoEntradaSchema>;

export const cancelarPedidoEntradaSchema = z.object({ statusAtual: statusPedidoSchema, motivo: motivoCancelamentoSchema });

export type CancelarPedidoEntrada = z.infer<typeof cancelarPedidoEntradaSchema>;

/*
 * RESUMO LOGÍSTICO do pedido na área de Pedidos: de qual rota falar e o que dizer do entregador.
 * Só apresentação — nenhuma regra de domínio muda aqui, e o status da rota não é tocado.
 */

/**
 * A rota que vale para o pedido. Um pedido pode ter passado por mais de uma (saiu de uma formação para
 * uma rota montada à mão, por exemplo): vale aquela em que a parada dele ainda está ATIVA; sem nenhuma,
 * a de encerramento mais recente (a última em que ele esteve).
 */
export function saidaDoPedido(saidas: readonly SaidaEntrega[], pedidoId: string): SaidaEntrega | null {
  let escolhida: { saida: SaidaEntrega; encerradaEm: string | null } | null = null;
  for (const saida of saidas) {
    const parada = saida.paradas.find((item) => item.pedidoId === pedidoId);
    if (!parada) continue;
    if (!parada.encerradaEm) return saida;
    if (escolhida === null || (escolhida.encerradaEm !== null && parada.encerradaEm > escolhida.encerradaEm)) escolhida = { saida, encerradaEm: parada.encerradaEm };
  }
  return escolhida?.saida ?? null;
}

export type EntregadorNoResumo = { tipo: "atribuido"; nome: string } | { tipo: "aguardando" };

// Status em que o pedido ainda pode receber (ou trocar) entregador.
const PEDIDO_ENCERRADO = new Set<StatusPedido>(["entregue", "cancelado"]);

/**
 * O que dizer do entregador: quem está (ou esteve) com o pedido; "aguardando" só enquanto o pedido
 * ainda pode receber alguém; `null` = não dizer nada (pedido entregue/cancelado, ou rota encerrada,
 * que nunca teve entregador — "aguardando atribuição" ali seria falso).
 */
export function entregadorNoResumoDoPedido(statusPedido: StatusPedido, saida: Pick<SaidaEntrega, "entregador" | "status"> | null): EntregadorNoResumo | null {
  if (!saida) return null;
  if (saida.entregador) return { tipo: "atribuido", nome: saida.entregador.nomeExibicao };
  if (PEDIDO_ENCERRADO.has(statusPedido) || saida.status === "concluida") return null;
  return { tipo: "aguardando" };
}
