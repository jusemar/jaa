import type { Banco } from "@jaa/banco";
import { buscarEmpresaPublicaPorId, type EmpresaPublicaRegistro } from "../../catalogo/repositorios/repositorio-empresas-publicas.js";
import { buscarEmpresaDaIdentidade } from "../../empresas/repositorios/repositorio-empresas.js";
import { buscarPedido, type PedidoComItensRegistro } from "../repositorios/repositorio-pedidos.js";

/**
 * Consulta autorizada do pedido pela IDENTIDADE ATUANTE:
 * - o cliente dono do pedido; ou
 * - a identidade empresarial da empresa do pedido (operada por quem tem vínculo — já validado antes).
 * Qualquer outra identidade recebe "não encontrado" (sem revelar que o pedido existe).
 */
export async function obterPedidoAutorizado(
  banco: Banco,
  identidadeAtuanteId: string,
  pedidoId: string,
): Promise<{ tipo: "pedido"; pedido: PedidoComItensRegistro; empresa: EmpresaPublicaRegistro } | { tipo: "pedido-nao-encontrado" }> {
  const pedido = await buscarPedido(banco, pedidoId);
  if (!pedido) return { tipo: "pedido-nao-encontrado" };

  const empresaDaIdentidade = await buscarEmpresaDaIdentidade(banco, identidadeAtuanteId);
  const ehCliente = pedido.pedido.clienteIdentidadeId === identidadeAtuanteId;
  const ehEmpresaDoPedido = empresaDaIdentidade === pedido.pedido.empresaId;
  if (!ehCliente && !ehEmpresaDoPedido) return { tipo: "pedido-nao-encontrado" };

  const empresa = await buscarEmpresaPublicaPorId(banco, pedido.pedido.empresaId);
  if (!empresa) return { tipo: "pedido-nao-encontrado" };
  return { tipo: "pedido", pedido, empresa };
}
