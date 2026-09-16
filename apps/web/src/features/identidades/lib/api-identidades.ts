import { identidadeOperavelSchema, listaIdentidadesOperaveisSchema, type IdentidadeOperavel, type ListaIdentidadesOperaveis } from "@jaa/contratos";
import { requisitarApi, type ResultadoApi } from "@/lib/api";

export function listarIdentidadesOperaveis(): Promise<ResultadoApi<ListaIdentidadesOperaveis>> {
  return requisitarApi("/identidades/operaveis", listaIdentidadesOperaveisSchema);
}

// O servidor confirma se a conta pode operar a identidade escolhida (404 se não puder).
export function verificarIdentidadeOperavel(identidadeId: string): Promise<ResultadoApi<IdentidadeOperavel>> {
  return requisitarApi(`/identidades/operaveis/${encodeURIComponent(identidadeId)}`, identidadeOperavelSchema);
}
