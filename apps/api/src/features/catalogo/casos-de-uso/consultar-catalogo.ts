import type { Banco } from "@jaa/banco";
import { diaOperacionalDaEmpresa, type FuncionamentoPublico } from "@jaa/contratos";
import { consultarFuncionamentoPublico } from "../../empresas/casos-de-uso/funcionamento.js";
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

// A empresa acabou de ser lida: só não existe mais se foi apagada no meio da consulta.
async function funcionamentoDe(banco: Banco, empresaId: string, agora: Date): Promise<FuncionamentoPublico> {
  const funcionamento = await consultarFuncionamentoPublico(banco, empresaId, agora);
  if (!funcionamento) throw new Error("Empresa do catálogo não encontrada ao ler o funcionamento.");
  return funcionamento;
}

export async function consultarCatalogo(
  banco: Banco,
  identidadeId: string,
  // Instante da consulta (o relógio do SERVIDOR). Parâmetro só para o teste fixar o dia.
  agora: Date = new Date(),
): Promise<
  | { tipo: "catalogo"; empresa: EmpresaPublicaRegistro; categorias: CategoriaComContagem[]; produtos: ProdutoRegistro[]; personalizaveis: Set<string>; funcionamento: FuncionamentoPublico }
  | { tipo: "empresa-nao-encontrada" }
> {
  const empresa = await buscarEmpresaPublicaPorIdentidade(banco, identidadeId);
  if (!empresa) return { tipo: "empresa-nao-encontrada" };

  const produtos = await listarProdutosDisponiveisDaEmpresa(banco, empresa.empresaId);
  const [categorias, personalizaveis, funcionamento] = await Promise.all([
    listarCategorias(banco, empresa.empresaId),
    idsDeProdutosPersonalizaveis(
      banco,
      empresa.empresaId,
      produtos.map((produto) => produto.id),
      // Programação semanal: o dia é o da EMPRESA (fuso dela), nunca o de quem está olhando.
      diaOperacionalDaEmpresa(agora, empresa.fusoHorario),
    ),
    // Aberta ou fechada AGORA: a mesma regra que a criação do pedido aplica.
    funcionamentoDe(banco, empresa.empresaId, agora),
  ]);
  return { tipo: "catalogo", empresa, categorias, produtos, personalizaveis, funcionamento };
}

export async function consultarProdutoDoCatalogo(
  banco: Banco,
  identidadeId: string,
  produtoId: string,
  agora: Date = new Date(),
): Promise<
  | { tipo: "produto"; empresa: EmpresaPublicaRegistro; produto: ProdutoRegistro; grupos: GrupoComOpcoes[]; funcionamento: FuncionamentoPublico }
  | { tipo: "empresa-nao-encontrada" }
  | { tipo: "produto-nao-encontrado" }
> {
  const empresa = await buscarEmpresaPublicaPorIdentidade(banco, identidadeId);
  if (!empresa) return { tipo: "empresa-nao-encontrada" };
  // Produto de outra empresa ou indisponível: não encontrado.
  const produto = await buscarProdutoDisponivelDaEmpresa(banco, empresa.empresaId, produtoId);
  if (!produto) return { tipo: "produto-nao-encontrado" };

  // Só opções oferecidas HOJE: disponíveis e, em grupo com programação semanal, programadas para o dia.
  const grupos = await listarGruposDisponiveisDoProduto(banco, empresa.empresaId, produtoId, diaOperacionalDaEmpresa(agora, empresa.fusoHorario));
  return { tipo: "produto", empresa, produto, grupos, funcionamento: await funcionamentoDe(banco, empresa.empresaId, agora) };
}
