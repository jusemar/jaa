import { empresaSchema, listaEmpresasSchema, type CriarEmpresaEntrada, type Empresa, type ListaEmpresas } from "@jaa/contratos";
import { requisitarApi, type RespostaApi } from "@/lib/api";

/*
 * MINHAS EMPRESAS — as mesmas rotas da Web. O proprietário é a CONTA da sessão: nunca é enviado pelo
 * app, e quem decide o que cada conta pode ver ou fazer é o servidor (sem acesso = 404).
 */
export function criarEmpresa(entrada: CriarEmpresaEntrada): Promise<RespostaApi<Empresa>> {
  return requisitarApi("/empresas", empresaSchema, { method: "POST", body: JSON.stringify(entrada) });
}

export function listarMinhasEmpresas(): Promise<RespostaApi<ListaEmpresas>> {
  return requisitarApi("/empresas", listaEmpresasSchema);
}

export function obterEmpresa(empresaId: string): Promise<RespostaApi<Empresa>> {
  return requisitarApi(`/empresas/${encodeURIComponent(empresaId)}`, empresaSchema);
}
