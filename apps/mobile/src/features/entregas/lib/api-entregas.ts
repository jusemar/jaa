import type { EnviarPosicaoEntrada, ListaSaidas, PosicaoEntregador, SaidaEntrega } from "@jaa/contratos";
import { requisitar, type ResultadoApi } from "@/lib/api";

// API de entregas do entregador. O cliente HTTP (sessão no cabeçalho `Cookie`) é o de `@/lib/api`.
export type { ResultadoApi };

/** Saídas do entregador autenticado. A saída EM ANDAMENTO é o que liga (ou não) o rastreamento. */
export async function listarMinhasSaidas(): Promise<ResultadoApi<ListaSaidas>> {
  return requisitar<ListaSaidas>("/entregas/saidas");
}

export function saidaEmAndamento(saidas: SaidaEntrega[]): SaidaEntrega | null {
  return saidas.find((saida) => saida.status === "em_andamento") ?? null;
}

/**
 * Envia UMA leitura. O aparelho informa o que mediu; o servidor decide se aceita, e devolve 409
 * quando a saída não está mais em andamento — o sinal de que o rastreamento deve parar.
 */
export function enviarPosicao(saidaId: string, leitura: EnviarPosicaoEntrada): Promise<ResultadoApi<PosicaoEntregador | { aplicada: false }>> {
  return requisitar(`/entregas/saidas/${encodeURIComponent(saidaId)}/posicao`, { method: "POST", body: JSON.stringify(leitura) });
}
