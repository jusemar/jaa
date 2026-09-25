import type { Banco } from "@jaa/banco";
import { listarCategorias, type CategoriaComContagem } from "../../produtos/repositorios/repositorio-categorias.js";
import { idsDeProdutosPersonalizaveis, listarGruposDisponiveisDoProduto, type GrupoComOpcoes } from "../../produtos/repositorios/repositorio-personalizacao.js";
import { buscarProdutoDisponivelDaEmpresa, listarProdutosDisponiveisDaEmpresa, type ProdutoRegistro } from "../../produtos/repositorios/repositorio-produtos.js";
import { buscarEmpresaPublicaPorIdentidade, type EmpresaPublicaRegistro } from "../repositorios/repositorio-empresas-publicas.js";

/*
 * Catálogo para CLIENTE (chat, app e futura /loja/<slug>), sem nenhuma autorização administrativa:
 * resolve a empresa PÚBLICA (identidade empresarial de empresa ativa) e devolve só produtos disponíveis.
 * Não há parâmetro que troque para a visão administrativa. Resolver por slug no futuro = outra função
 * que também chegue a EmpresaPublicaRegistro, reutilizando o restante.
 *
 * Categorias e personalização vêm do MESMO domínio da administração — nada é copiado para um
 * "catálogo do chat". A lista traz apenas o SINAL de que o produto tem montagem (`personalizaveis`),
 * em uma consulta só para a página inteira; os grupos completos vêm no detalhe do produto.
 */

export async function consultarCatalogo(
  banco: Banco,
  identidadeId: string,
): Promise<
  | { tipo: "catalogo"; empresa: EmpresaPublicaRegistro; categorias: CategoriaComContagem[]; produtos: ProdutoRegistro[]; personalizaveis: Set<string> }
  | { tipo: "empresa-nao-encontrada" }
> {
  const empresa = await buscarEmpresaPublicaPorIdentidade(banco, identidadeId);
  if (!empresa) return { tipo: "empresa-nao-encontrada" };

  const produtos = await listarProdutosDisponiveisDaEmpresa(banco, empresa.empresaId);
  const [categorias, personalizaveis] = await Promise.all([
    listarCategorias(banco, empresa.empresaId),
    idsDeProdutosPersonalizaveis(
      banco,
      empresa.empresaId,
      produtos.map((produto) => produto.id),
    ),
  ]);
  return { tipo: "catalogo", empresa, categorias, produtos, personalizaveis };
}

export async function consultarProdutoDoCatalogo(
  banco: Banco,
  identidadeId: string,
  produtoId: string,
): Promise<
  | { tipo: "produto"; empresa: EmpresaPublicaRegistro; produto: ProdutoRegistro; grupos: GrupoComOpcoes[] }
  | { tipo: "empresa-nao-encontrada" }
  | { tipo: "produto-nao-encontrado" }
> {
  const empresa = await buscarEmpresaPublicaPorIdentidade(banco, identidadeId);
  if (!empresa) return { tipo: "empresa-nao-encontrada" };
  // Produto de outra empresa ou indisponível: não encontrado.
  const produto = await buscarProdutoDisponivelDaEmpresa(banco, empresa.empresaId, produtoId);
  if (!produto) return { tipo: "produto-nao-encontrado" };

  // Só opções disponíveis: quem monta o prato não pode escolher o que a empresa desligou.
  const grupos = await listarGruposDisponiveisDoProduto(banco, empresa.empresaId, produtoId);
  return { tipo: "produto", empresa, produto, grupos };
}
