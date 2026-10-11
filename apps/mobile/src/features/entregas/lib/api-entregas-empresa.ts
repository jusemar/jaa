import { entregaDoPedidoSchema, listaEntregadoresSchema, listaSaidasSchema, type EntregaDoPedido, type ListaEntregadores, type ListaSaidas } from "@jaa/contratos";
import { requisitarApi, type RespostaApi } from "@/lib/api";

/*
 * Lado da EMPRESA nas entregas — as mesmas rotas da Web (`entregas/lib/api-entregas.ts`). Quem
 * autoriza é o servidor, pelo vínculo da conta com a empresa (sem acesso = 404).
 */
const daEmpresa = (empresaId: string, sufixo = "") => `/empresas/${encodeURIComponent(empresaId)}${sufixo}`;

export function listarEntregadores(empresaId: string): Promise<RespostaApi<ListaEntregadores>> {
  return requisitarApi(daEmpresa(empresaId, "/entregadores"), listaEntregadoresSchema, {});
}

export function obterEntregaDoPedido(empresaId: string, pedidoId: string): Promise<RespostaApi<EntregaDoPedido>> {
  return requisitarApi(daEmpresa(empresaId, `/pedidos/${encodeURIComponent(pedidoId)}/entrega`), entregaDoPedidoSchema, {});
}

// `entregadorAtualId` = quem a tela estava mostrando: protege contra atribuição concorrente.
// `transferirDaSaida`: o gerente confirmou tirar o pedido da saída que ainda não saiu.
export function atribuirEntrega(empresaId: string, pedidoId: string, entregadorId: string, entregadorAtualId: string | null, transferirDaSaida = false): Promise<RespostaApi<EntregaDoPedido>> {
  return requisitarApi(daEmpresa(empresaId, `/pedidos/${encodeURIComponent(pedidoId)}/entrega`), entregaDoPedidoSchema, {
    method: "POST",
    body: JSON.stringify({ entregadorId, entregadorAtualId, ...(transferirDaSaida ? { transferirDaSaida: true } : {}) }),
  });
}

export function listarSaidasDaEmpresa(empresaId: string, apenasAtivas = true): Promise<RespostaApi<ListaSaidas>> {
  return requisitarApi(`${daEmpresa(empresaId, "/saidas")}${apenasAtivas ? "" : "?ativas=false"}`, listaSaidasSchema, {});
}
