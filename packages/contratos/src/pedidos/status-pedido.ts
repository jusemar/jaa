import * as z from "zod";

/*
 * MÁQUINA DE ESTADOS do Pedido Jaa, compartilhada por API e clientes.
 * O servidor é quem decide e valida; o cliente usa isto só para EXIBIR (próxima ação, timeline).
 * Ninguém — nem cliente, nem empresa — envia um status arbitrário: a transição é sempre conferida.
 */

export const statusPedidoSchema = z.enum([
  "recebido",
  "confirmado",
  "em_preparacao",
  "pronto",
  "saiu_para_entrega",
  "em_rota",
  "entregue",
  // Terminal alternativo: o pedido não será atendido (decisão da empresa, com motivo).
  "cancelado",
]);

export type StatusPedido = z.infer<typeof statusPedidoSchema>;

export const ROTULO_STATUS_PEDIDO: Record<StatusPedido, string> = {
  recebido: "Pedido recebido",
  confirmado: "Confirmado",
  em_preparacao: "Em preparação",
  pronto: "Pronto",
  saiu_para_entrega: "Saiu para entrega",
  em_rota: "Em rota",
  entregue: "Entregue",
  cancelado: "Pedido cancelado",
};

// Caminho normal, em ordem. Cancelado não entra: é desvio terminal, não etapa do fluxo.
export const FLUXO_STATUS_PEDIDO = ["recebido", "confirmado", "em_preparacao", "pronto", "saiu_para_entrega", "em_rota", "entregue"] as const satisfies readonly StatusPedido[];

// Um passo por vez: nada de saltar (recebido → entregue) nem regredir (em_rota → em_preparacao).
const PROXIMO_STATUS: Record<StatusPedido, StatusPedido | null> = {
  recebido: "confirmado",
  confirmado: "em_preparacao",
  em_preparacao: "pronto",
  pronto: "saiu_para_entrega",
  saiu_para_entrega: "em_rota",
  em_rota: "entregue",
  entregue: null,
  cancelado: null,
};

// Rótulo da ÚNICA ação de avanço disponível em cada estado (a interface nunca mostra sete botões).
export const ROTULO_ACAO_AVANCAR: Record<StatusPedido, string | null> = {
  recebido: "Confirmar pedido",
  confirmado: "Iniciar preparação",
  em_preparacao: "Marcar como pronto",
  pronto: "Saiu para entrega",
  saiu_para_entrega: "Marcar em rota",
  em_rota: "Marcar como entregue",
  entregue: null,
  cancelado: null,
};

export function proximoStatusPedido(status: StatusPedido): StatusPedido | null {
  return PROXIMO_STATUS[status];
}

// Terminais: não avançam, não regridem, não cancelam.
export function statusPedidoTerminal(status: StatusPedido): boolean {
  return status === "entregue" || status === "cancelado";
}

// Só a empresa cancela, e só enquanto o pedido não terminou (entregue não cancela; cancelado não repete).
export function podeCancelarPedido(status: StatusPedido): boolean {
  return !statusPedidoTerminal(status);
}

export const MOTIVO_CANCELAMENTO_TAMANHO_MAXIMO = 200;

// Motivos sugeridos na interface; texto livre curto continua permitido (sem catálogo de motivos).
export const MOTIVOS_CANCELAMENTO_SUGERIDOS = [
  "Produto indisponível",
  "Loja impossibilitada de atender",
  "Pedido duplicado",
] as const;

export const motivoCancelamentoSchema = z.string().trim().min(3, "Informe o motivo do cancelamento.").max(MOTIVO_CANCELAMENTO_TAMANHO_MAXIMO);

// Um evento REAL do pedido: só entra no histórico quando acontece (nunca eventos futuros).
export const eventoStatusPedidoSchema = z.object({
  id: z.uuid(),
  status: statusPedidoSchema,
  ocorridoEm: z.iso.datetime(),
  // Só no cancelamento. Nunca expõe quem operou: a empresa é a entidade visível ao cliente.
  motivo: z.string().nullable(),
});

export type EventoStatusPedido = z.infer<typeof eventoStatusPedidoSchema>;

export type EtapaTimelinePedido = { status: StatusPedido; situacao: "concluida" | "atual" | "futura"; ocorridoEm: string | null };

/**
 * Timeline exibida: etapas concluídas (com o horário REAL do histórico), a atual e as futuras
 * (derivadas da máquina de estados só para visualização — não existem como registro).
 * Pedido cancelado não segue desenhando o fluxo: mostra o que aconteceu e encerra em "Pedido cancelado".
 */
export function montarTimelinePedido(status: StatusPedido, historico: EventoStatusPedido[]): EtapaTimelinePedido[] {
  const ocorridoPorStatus = new Map(historico.map((evento) => [evento.status, evento.ocorridoEm]));
  const concluidas = FLUXO_STATUS_PEDIDO.filter((etapa) => ocorridoPorStatus.has(etapa)).map(
    (etapa): EtapaTimelinePedido => ({ status: etapa, situacao: etapa === status ? "atual" : "concluida", ocorridoEm: ocorridoPorStatus.get(etapa) ?? null }),
  );

  if (status === "cancelado") {
    return [...concluidas, { status: "cancelado", situacao: "atual", ocorridoEm: ocorridoPorStatus.get("cancelado") ?? null }];
  }

  const posicaoAtual = FLUXO_STATUS_PEDIDO.indexOf(status as (typeof FLUXO_STATUS_PEDIDO)[number]);
  const futuras = FLUXO_STATUS_PEDIDO.slice(posicaoAtual + 1).map((etapa): EtapaTimelinePedido => ({ status: etapa, situacao: "futura", ocorridoEm: null }));
  return [...concluidas, ...futuras];
}
