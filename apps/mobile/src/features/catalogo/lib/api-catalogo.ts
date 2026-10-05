import { catalogoPublicoSchema, funcionamentoPublicoSchema, produtoPublicoDetalheSchema, type CatalogoPublico, type FuncionamentoPublico, type ProdutoPublicoDetalhe } from "@jaa/contratos";
import { requisitarApi, type RespostaApi } from "@/lib/api";

// Consulta de CLIENTE (pública): nunca usa as rotas administrativas de produtos.
export function obterCatalogo(identidadeEmpresaId: string): Promise<RespostaApi<CatalogoPublico>> {
  return requisitarApi(`/publico/empresas/${encodeURIComponent(identidadeEmpresaId)}/catalogo`, catalogoPublicoSchema);
}

export function obterProdutoDoCatalogo(identidadeEmpresaId: string, produtoId: string): Promise<RespostaApi<ProdutoPublicoDetalhe>> {
  return requisitarApi(`/publico/empresas/${encodeURIComponent(identidadeEmpresaId)}/catalogo/produtos/${encodeURIComponent(produtoId)}`, produtoPublicoDetalheSchema);
}

// Aberta ou fechada AGORA (decidido no servidor, no fuso da empresa): a mesma informação que vem com o cardápio.
export function obterFuncionamento(identidadeEmpresaId: string): Promise<RespostaApi<FuncionamentoPublico>> {
  return requisitarApi(`/publico/empresas/${encodeURIComponent(identidadeEmpresaId)}/funcionamento`, funcionamentoPublicoSchema);
}

// A descoberta de empresas saiu daqui: procurar pessoa OU empresa agora é a busca única
// "Pesquisar no Jaa" (features/contatos), que já respeita contatos e privacidade.
