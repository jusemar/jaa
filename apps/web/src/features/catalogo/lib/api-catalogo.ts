import { catalogoPublicoSchema, produtoPublicoDetalheSchema, type CatalogoPublico, type ProdutoPublicoDetalhe } from "@jaa/contratos";
import { requisitarApi, type ResultadoApi } from "@/lib/api";

// Consulta de CLIENTE (pública): nunca usa as rotas administrativas de produtos.
export function obterCatalogo(identidadeEmpresaId: string): Promise<ResultadoApi<CatalogoPublico>> {
  return requisitarApi(`/publico/empresas/${encodeURIComponent(identidadeEmpresaId)}/catalogo`, catalogoPublicoSchema);
}

export function obterProdutoDoCatalogo(identidadeEmpresaId: string, produtoId: string): Promise<ResultadoApi<ProdutoPublicoDetalhe>> {
  return requisitarApi(`/publico/empresas/${encodeURIComponent(identidadeEmpresaId)}/catalogo/produtos/${encodeURIComponent(produtoId)}`, produtoPublicoDetalheSchema);
}

// A descoberta de empresas saiu daqui: procurar pessoa OU empresa agora é a busca única
// "Pesquisar no Jaa" (features/contatos), que já respeita contatos e privacidade.
