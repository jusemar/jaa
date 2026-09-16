import {
  entregaAtribuidaSchema,
  entregaDoPedidoSchema,
  entregadorDaEmpresaSchema,
  listaConvitesEntregadorSchema,
  listaEntregadoresSchema,
  listaEntregasSchema,
  listaVinculosEntregadorSchema,
  type EntregaAtribuida,
  type EntregaDoPedido,
  type EntregadorDaEmpresa,
  type ListaConvitesEntregador,
  type ListaEntregadores,
  type ListaEntregas,
  type ListaVinculosEntregador,
} from "@jaa/contratos";
import * as z from "zod";
import { requisitarApi, type ResultadoApi } from "@/lib/api";

/*
 * Dois lados bem separados: a EMPRESA administra entregadores e atribui pedidos; a PESSOA responde
 * convites e vê as entregas atribuídas a ela. Nenhuma rota daqui permite pedir um pedido arbitrário.
 */

const daEmpresa = (empresaId: string, sufixo = "") => `/empresas/${encodeURIComponent(empresaId)}${sufixo}`;

export function listarEntregadores(empresaId: string): Promise<ResultadoApi<ListaEntregadores>> {
  return requisitarApi(daEmpresa(empresaId, "/entregadores"), listaEntregadoresSchema, {});
}

export function convidarEntregador(empresaId: string, nomeUsuario: string): Promise<ResultadoApi<EntregadorDaEmpresa>> {
  return requisitarApi(daEmpresa(empresaId, "/entregadores"), entregadorDaEmpresaSchema, { method: "POST", body: JSON.stringify({ nomeUsuario }) });
}

export function alterarStatusEntregador(empresaId: string, entregadorId: string, status: "ativo" | "inativo"): Promise<ResultadoApi<EntregadorDaEmpresa>> {
  return requisitarApi(daEmpresa(empresaId, `/entregadores/${encodeURIComponent(entregadorId)}`), entregadorDaEmpresaSchema, { method: "PATCH", body: JSON.stringify({ status }) });
}

export function obterEntregaDoPedido(empresaId: string, pedidoId: string): Promise<ResultadoApi<EntregaDoPedido>> {
  return requisitarApi(daEmpresa(empresaId, `/pedidos/${encodeURIComponent(pedidoId)}/entrega`), entregaDoPedidoSchema, {});
}

// `entregadorAtualId` = quem a tela estava mostrando: protege contra atribuição concorrente.
export function atribuirEntrega(empresaId: string, pedidoId: string, entregadorId: string, entregadorAtualId: string | null): Promise<ResultadoApi<EntregaDoPedido>> {
  return requisitarApi(daEmpresa(empresaId, `/pedidos/${encodeURIComponent(pedidoId)}/entrega`), entregaDoPedidoSchema, {
    method: "POST",
    body: JSON.stringify({ entregadorId, entregadorAtualId }),
  });
}

export function listarMeusConvites(): Promise<ResultadoApi<ListaConvitesEntregador>> {
  return requisitarApi("/entregas/convites", listaConvitesEntregadorSchema, {});
}

export function responderConvite(entregadorId: string, resposta: "aceitar" | "recusar"): Promise<ResultadoApi<{ status: string }>> {
  return requisitarApi(`/entregas/convites/${encodeURIComponent(entregadorId)}`, z.object({ status: z.string() }), { method: "POST", body: JSON.stringify({ resposta }) });
}

export function listarMinhasEntregas(): Promise<ResultadoApi<ListaEntregas>> {
  return requisitarApi("/entregas", listaEntregasSchema, {});
}

export function obterMinhaEntrega(pedidoId: string): Promise<ResultadoApi<EntregaAtribuida>> {
  return requisitarApi(`/entregas/${encodeURIComponent(pedidoId)}`, entregaAtribuidaSchema, {});
}

/*
 * DISPONIBILIDADE: decisão do próprio entregador, por empresa. A empresa não tem rota para isto —
 * ela administra o vínculo (ativo/inativo); quem decide aceitar entregas agora é quem entrega.
 */

export function listarMeusVinculos(): Promise<ResultadoApi<ListaVinculosEntregador>> {
  return requisitarApi("/entregas/vinculos", listaVinculosEntregadorSchema, {});
}

export function alterarMinhaDisponibilidade(entregadorId: string, disponivel: boolean): Promise<ResultadoApi<EntregadorDaEmpresa>> {
  return requisitarApi(`/entregas/vinculos/${encodeURIComponent(entregadorId)}`, entregadorDaEmpresaSchema, { method: "PATCH", body: JSON.stringify({ disponivel }) });
}
