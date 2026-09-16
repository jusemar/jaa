import { empresaSchema, listaEmpresasSchema, type CriarEmpresaEntrada, type Empresa, type ListaEmpresas } from "@jaa/contratos";
import { requisitarApi, type ResultadoApi } from "@/lib/api";

// O proprietário é a conta da sessão: nunca é enviado pelo cliente.
export function criarEmpresa(entrada: CriarEmpresaEntrada): Promise<ResultadoApi<Empresa>> {
  return requisitarApi("/empresas", empresaSchema, { method: "POST", body: JSON.stringify(entrada) });
}

export function listarMinhasEmpresas(): Promise<ResultadoApi<ListaEmpresas>> {
  return requisitarApi("/empresas", listaEmpresasSchema);
}

export function obterEmpresa(empresaId: string): Promise<ResultadoApi<Empresa>> {
  return requisitarApi(`/empresas/${encodeURIComponent(empresaId)}`, empresaSchema);
}
