import {
  catalogoPublicoSchema,
  listaEmpresasPublicasSchema,
  produtoPublicoDetalheSchema,
  type CatalogoPublico,
  type ListaEmpresasPublicas,
  type ProdutoPublicoDetalhe,
} from "@jaa/contratos";
import { requisitarApi, type ResultadoApi } from "@/lib/api";

// Consulta de CLIENTE (pública): nunca usa as rotas administrativas de produtos.
export function obterCatalogo(identidadeEmpresaId: string): Promise<ResultadoApi<CatalogoPublico>> {
  return requisitarApi(`/publico/empresas/${encodeURIComponent(identidadeEmpresaId)}/catalogo`, catalogoPublicoSchema);
}

export function obterProdutoDoCatalogo(identidadeEmpresaId: string, produtoId: string): Promise<ResultadoApi<ProdutoPublicoDetalhe>> {
  return requisitarApi(`/publico/empresas/${encodeURIComponent(identidadeEmpresaId)}/catalogo/produtos/${encodeURIComponent(produtoId)}`, produtoPublicoDetalheSchema);
}

// Descoberta TÉCNICA temporária (não é o "Encontrar" definitivo).
export function buscarEmpresas(busca: string): Promise<ResultadoApi<ListaEmpresasPublicas>> {
  const consulta = busca.trim() ? `?busca=${encodeURIComponent(busca.trim())}` : "";
  return requisitarApi(`/descoberta/empresas${consulta}`, listaEmpresasPublicasSchema);
}
