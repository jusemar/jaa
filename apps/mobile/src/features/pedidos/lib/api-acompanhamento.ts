import { acompanhamentoPedidoSchema, type AcompanhamentoPedido } from "@jaa/contratos";
import { requisitarApi, type RespostaApi } from "@/lib/api";
import { cabecalhosIdentidadeAtuante } from "@/lib/identidade-atuante";

// O que o CLIENTE pode saber do próprio pedido: fila derivada, entregador atual e, na vez dele, a posição.
export function obterAcompanhamentoDoPedido(pedidoId: string): Promise<RespostaApi<AcompanhamentoPedido>> {
  return requisitarApi(`/pedidos/${encodeURIComponent(pedidoId)}/acompanhamento`, acompanhamentoPedidoSchema, { headers: cabecalhosIdentidadeAtuante() });
}
