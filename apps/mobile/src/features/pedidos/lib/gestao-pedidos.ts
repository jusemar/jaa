import { MOTIVOS_CANCELAMENTO_SUGERIDOS, type SaidaEntrega, type StatusPedido, type StatusSaida } from "@jaa/contratos";

/*
 * GESTÃO DOS PEDIDOS pela empresa no app — as regras de apresentação da Web
 * (`pedidos/components/resumo-logistico-pedido.tsx`, `acoes-pedido-empresa.tsx` e
 * `entregas/components/entrega-do-pedido.tsx`), sem nada de tela. Mudou lá, muda aqui.
 */

export type StatusVisualEntrega = StatusSaida | "cancelada";

export const ROTULO_STATUS_PEDIDO_NA_LISTA: Record<StatusPedido, string> = {
  recebido: "Recebido",
  confirmado: "Confirmado (legado)",
  em_preparacao: "Em preparação",
  pronto: "Pronto",
  saiu_para_entrega: "Saiu para entrega",
  em_rota: "Saiu para entrega",
  entregue: "Entregue",
  cancelado: "Cancelado",
};

// As mesmas cores de fundo da Web (amber/orange/violet/sky/teal/slate/red 50), em sRGB.
export const APRESENTACAO_STATUS_ENTREGA: Record<StatusVisualEntrega, { rotulo: string; fundo: string }> = {
  em_formacao: { rotulo: "Em formação", fundo: "#FFFBEB" },
  aguardando_entregador: { rotulo: "Aguardando entregador", fundo: "#FFF7ED" },
  preparada: { rotulo: "Aguardando liberação", fundo: "#F5F3FF" },
  liberada_retirada: { rotulo: "Liberado para retirada", fundo: "#F0F9FF" },
  em_andamento: { rotulo: "Em rota", fundo: "#F0FDFA" },
  concluida: { rotulo: "Concluído", fundo: "#F8FAFC" },
  cancelada: { rotulo: "Cancelada", fundo: "#FEF2F2" },
};

export function statusVisualEntregaDoPedido(statusPedido: StatusPedido, saida: SaidaEntrega | null): StatusVisualEntrega | null {
  if (statusPedido === "cancelado") return "cancelada";
  if (statusPedido === "entregue") return "concluida";
  return saida?.status ?? null;
}

export function apresentacaoEntregaDoPedido(statusPedido: StatusPedido, saida: SaidaEntrega | null) {
  const status = statusVisualEntregaDoPedido(statusPedido, saida);
  return status ? APRESENTACAO_STATUS_ENTREGA[status] : null;
}

export function encontrarSaidaDoPedido(saidas: readonly SaidaEntrega[], pedidoId: string): SaidaEntrega | null {
  return saidas.find((saida) => saida.paradas.some((parada) => parada.pedidoId === pedidoId)) ?? null;
}

export function nomeDaRota(saida: SaidaEntrega): string {
  return saida.zonaPrincipal ? [saida.zonaPrincipal.nome, ...saida.zonasCombinadas.map((zona) => zona.nome)].join(" + ") : "Manual";
}

/** A saída que chegou por evento entra na lista (ou substitui a que já estava). */
export function adotarSaida(saidas: readonly SaidaEntrega[], atualizada: SaidaEntrega): SaidaEntrega[] {
  return saidas.some((item) => item.id === atualizada.id) ? saidas.map((item) => (item.id === atualizada.id ? atualizada : item)) : [atualizada, ...saidas];
}

// Só faz sentido atribuir quando o pedido está pronto ou já na rua.
const STATUS_COM_ENTREGADOR = new Set<StatusPedido>(["pronto", "saiu_para_entrega", "em_rota"]);
export const podeAtribuirEntregador = (status: StatusPedido) => STATUS_COM_ENTREGADOR.has(status);

export const OUTRO_MOTIVO = "Outro motivo";
export const MOTIVOS_DE_CANCELAMENTO: readonly string[] = [...MOTIVOS_CANCELAMENTO_SUGERIDOS, OUTRO_MOTIVO];

/** O motivo que será enviado: a sugestão escolhida ou o texto livre de "Outro motivo". */
export function motivoEscolhido(motivo: string, outroMotivo: string): string {
  return (motivo === OUTRO_MOTIVO ? outroMotivo : motivo).trim();
}

// O servidor exige de 3 a 200 caracteres; a tela só não deixa confirmar antes do mínimo.
export const motivoValido = (motivo: string) => motivo.length >= 3;

export const rotuloDeItens = (quantidade: number) => `${quantidade} ${quantidade === 1 ? "item" : "itens"}`;
