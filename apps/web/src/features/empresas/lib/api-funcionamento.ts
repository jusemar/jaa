import { funcionamentoEmpresaSchema, type DefinirFuncionamentoEntrada, type FuncionamentoEmpresa } from "@jaa/contratos";
import { requisitarApi, type ResultadoApi } from "@/lib/api";

const rota = (empresaId: string) => `/empresas/${encodeURIComponent(empresaId)}/funcionamento`;

// Visão do gestor: a configuração inteira e o estado que ela produz AGORA (calculado no servidor).
export function consultarFuncionamento(empresaId: string): Promise<ResultadoApi<FuncionamentoEmpresa>> {
  return requisitarApi(rota(empresaId), funcionamentoEmpresaSchema);
}

// Substitui a semana inteira. A empresa vem da rota e do vínculo da conta, nunca do corpo.
export function salvarFuncionamento(empresaId: string, entrada: DefinirFuncionamentoEntrada): Promise<ResultadoApi<FuncionamentoEmpresa>> {
  return requisitarApi(rota(empresaId), funcionamentoEmpresaSchema, { method: "PUT", body: JSON.stringify(entrada) });
}
