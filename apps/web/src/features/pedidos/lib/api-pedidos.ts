import { pedidoSchema, type CriarPedidoEntrada, type Pedido } from "@jaa/contratos";
import { requisitarApi, type ResultadoApi } from "@/lib/api";
import { cabecalhosIdentidadeAtuante } from "@/lib/identidade-atuante";

// O cliente envia produto e quantidade; preço, subtotais e total são do servidor.
export function criarPedido(entrada: CriarPedidoEntrada): Promise<ResultadoApi<Pedido>> {
  return requisitarApi("/pedidos", pedidoSchema, { method: "POST", headers: cabecalhosIdentidadeAtuante(), body: JSON.stringify(entrada) });
}

export function obterPedido(pedidoId: string): Promise<ResultadoApi<Pedido>> {
  return requisitarApi(`/pedidos/${encodeURIComponent(pedidoId)}`, pedidoSchema, { headers: cabecalhosIdentidadeAtuante() });
}
