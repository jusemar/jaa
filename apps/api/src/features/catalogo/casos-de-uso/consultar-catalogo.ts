import type { Banco } from "@jaa/banco";
import { buscarProdutoDisponivelDaEmpresa, listarProdutosDisponiveisDaEmpresa, type ProdutoRegistro } from "../../produtos/repositorios/repositorio-produtos.js";
import { buscarEmpresaPublicaPorIdentidade, type EmpresaPublicaRegistro } from "../repositorios/repositorio-empresas-publicas.js";

/*
 * Catálogo para CLIENTE (chat, app e futura /loja/<slug>), sem nenhuma autorização administrativa:
 * resolve a empresa PÚBLICA (identidade empresarial de empresa ativa) e devolve só produtos disponíveis.
 * Não há parâmetro que troque para a visão administrativa. Resolver por slug no futuro = outra função
 * que também chegue a EmpresaPublicaRegistro, reutilizando o restante.
 */

export async function consultarCatalogo(
  banco: Banco,
  identidadeId: string,
): Promise<{ tipo: "catalogo"; empresa: EmpresaPublicaRegistro; produtos: ProdutoRegistro[] } | { tipo: "empresa-nao-encontrada" }> {
  const empresa = await buscarEmpresaPublicaPorIdentidade(banco, identidadeId);
  if (!empresa) return { tipo: "empresa-nao-encontrada" };
  return { tipo: "catalogo", empresa, produtos: await listarProdutosDisponiveisDaEmpresa(banco, empresa.empresaId) };
}

export async function consultarProdutoDoCatalogo(
  banco: Banco,
  identidadeId: string,
  produtoId: string,
): Promise<{ tipo: "produto"; empresa: EmpresaPublicaRegistro; produto: ProdutoRegistro } | { tipo: "empresa-nao-encontrada" } | { tipo: "produto-nao-encontrado" }> {
  const empresa = await buscarEmpresaPublicaPorIdentidade(banco, identidadeId);
  if (!empresa) return { tipo: "empresa-nao-encontrada" };
  // Produto de outra empresa ou indisponível: não encontrado.
  const produto = await buscarProdutoDisponivelDaEmpresa(banco, empresa.empresaId, produtoId);
  return produto ? { tipo: "produto", empresa, produto } : { tipo: "produto-nao-encontrado" };
}
