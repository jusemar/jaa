import { situacaoBloqueioSchema, type SituacaoBloqueio } from "@jaa/contratos";
import { requisitarApi, type ResultadoApi } from "@/lib/api";
import { cabecalhosIdentidadeAtuante } from "@/lib/identidade-atuante";

// Bloqueio de comunicação: sempre em nome da identidade atuante (a API só aceita pessoa ↔ pessoa).

export function obterSituacaoBloqueio(identidadeId: string): Promise<ResultadoApi<SituacaoBloqueio>> {
  return requisitarApi(`/bloqueios/${encodeURIComponent(identidadeId)}`, situacaoBloqueioSchema, { headers: cabecalhosIdentidadeAtuante() });
}

export function bloquearIdentidade(identidadeId: string): Promise<ResultadoApi<SituacaoBloqueio>> {
  return requisitarApi("/bloqueios", situacaoBloqueioSchema, { method: "POST", headers: cabecalhosIdentidadeAtuante(), body: JSON.stringify({ identidadeId }) });
}

export function desbloquearIdentidade(identidadeId: string): Promise<ResultadoApi<SituacaoBloqueio>> {
  return requisitarApi(`/bloqueios/${encodeURIComponent(identidadeId)}`, situacaoBloqueioSchema, { method: "DELETE", headers: cabecalhosIdentidadeAtuante() });
}
