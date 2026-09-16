import {
  listaPedidosEmpresaSchema,
  pedidoSchema,
  type CriarPedidoEntrada,
  type FiltroPedidosEmpresa,
  type ListaPedidosEmpresa,
  type Pedido,
  type StatusPedido,
} from "@jaa/contratos";
import { requisitarApi, type ResultadoApi } from "@/lib/api";
import { cabecalhosIdentidadeAtuante } from "@/lib/identidade-atuante";

// O cliente envia produto e quantidade; preço, subtotais e total são do servidor.
export function criarPedido(entrada: CriarPedidoEntrada): Promise<ResultadoApi<Pedido>> {
  return requisitarApi("/pedidos", pedidoSchema, { method: "POST", headers: cabecalhosIdentidadeAtuante(), body: JSON.stringify(entrada) });
}

export function obterPedido(pedidoId: string): Promise<ResultadoApi<Pedido>> {
  return requisitarApi(`/pedidos/${encodeURIComponent(pedidoId)}`, pedidoSchema, { headers: cabecalhosIdentidadeAtuante() });
}

/*
 * Operação da EMPRESA. A tela nunca escolhe um status livremente: manda a intenção (avançar/cancelar)
 * e o status que estava exibindo — o servidor valida a transição e o estado atual no banco.
 */

const caminhoEmpresa = (empresaId: string, sufixo = "") => `/empresas/${encodeURIComponent(empresaId)}/pedidos${sufixo}`;

export function listarPedidosDaEmpresa(empresaId: string, opcoes: { filtro: FiltroPedidosEmpresa; antesDe?: string }): Promise<ResultadoApi<ListaPedidosEmpresa>> {
  const consulta = new URLSearchParams({ filtro: opcoes.filtro, ...(opcoes.antesDe ? { antesDe: opcoes.antesDe } : {}) });
  return requisitarApi(`${caminhoEmpresa(empresaId)}?${consulta.toString()}`, listaPedidosEmpresaSchema, {});
}

export function obterPedidoDaEmpresa(empresaId: string, pedidoId: string): Promise<ResultadoApi<Pedido>> {
  return requisitarApi(caminhoEmpresa(empresaId, `/${encodeURIComponent(pedidoId)}`), pedidoSchema, {});
}

export function avancarStatusPedido(empresaId: string, pedidoId: string, statusAtual: StatusPedido): Promise<ResultadoApi<Pedido>> {
  return requisitarApi(caminhoEmpresa(empresaId, `/${encodeURIComponent(pedidoId)}/avancar`), pedidoSchema, { method: "POST", body: JSON.stringify({ statusAtual }) });
}

export function cancelarPedido(empresaId: string, pedidoId: string, statusAtual: StatusPedido, motivo: string): Promise<ResultadoApi<Pedido>> {
  return requisitarApi(caminhoEmpresa(empresaId, `/${encodeURIComponent(pedidoId)}/cancelar`), pedidoSchema, { method: "POST", body: JSON.stringify({ statusAtual, motivo }) });
}
