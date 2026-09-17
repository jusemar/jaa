import type { Banco } from "@jaa/banco";
import type { DisponibilidadeProduto } from "@jaa/contratos";
import { autorizarEmpresa, type PermissaoEmpresa } from "../../empresas/lib/autorizacao-empresas.js";
import { buscarCategoria } from "../repositorios/repositorio-categorias.js";
import {
  atualizarProdutoDaEmpresa,
  buscarProdutoComCategoria,
  definirImagemDoProduto,
  inserirProduto,
  listarProdutosPaginados,
  type ConsultaProdutosAdministracao,
  type ProdutoComCategoria,
  type ProdutoRegistro,
} from "../repositorios/repositorio-produtos.js";

/*
 * Administração do PRODUTO DA EMPRESA, independente de interface (Web hoje; outros canais no futuro).
 * Sequência obrigatória em toda operação: conta da sessão → permissão na empresa (camada central) →
 * produto escopado por essa empresa. Empresa sem permissão ou inexistente e produto de outra empresa
 * resultam em "não encontrado", sem revelar o que existe.
 */

type SemAcesso = { tipo: "empresa-nao-encontrada" };
type ProdutoAusente = { tipo: "produto-nao-encontrado" };
type CategoriaAusente = { tipo: "categoria-nao-encontrada" };

/**
 * A categoria precisa ser DA MESMA EMPRESA. O banco também garante isso (FK composta), mas conferir
 * aqui devolve um erro compreensível em vez de uma violação de constraint.
 */
async function categoriaInvalida(banco: Banco, empresaId: string, categoriaId: string | null | undefined): Promise<boolean> {
  if (!categoriaId) return false;
  return (await buscarCategoria(banco, empresaId, categoriaId)) === null;
}

async function temPermissao(banco: Banco, usuarioId: string, empresaId: string, permissao: PermissaoEmpresa) {
  return (await autorizarEmpresa(banco, usuarioId, empresaId, permissao)) !== null;
}

export async function listarProdutosAdministrados(
  banco: Banco,
  usuarioId: string,
  empresaId: string,
  consulta: ConsultaProdutosAdministracao,
): Promise<{ tipo: "lista"; produtos: ProdutoComCategoria[]; total: number } | SemAcesso> {
  if (!(await temPermissao(banco, usuarioId, empresaId, "ver-produtos"))) return { tipo: "empresa-nao-encontrada" };
  const { produtos, total } = await listarProdutosPaginados(banco, empresaId, consulta);
  return { tipo: "lista", produtos, total };
}

export async function obterProdutoAdministrado(
  banco: Banco,
  usuarioId: string,
  empresaId: string,
  produtoId: string,
): Promise<{ tipo: "produto"; produto: ProdutoComCategoria } | SemAcesso | ProdutoAusente> {
  if (!(await temPermissao(banco, usuarioId, empresaId, "ver-produtos"))) return { tipo: "empresa-nao-encontrada" };
  const produto = await buscarProdutoComCategoria(banco, empresaId, produtoId);
  return produto ? { tipo: "produto", produto } : { tipo: "produto-nao-encontrado" };
}

// A empresa vem da ROTA autorizada; nunca do corpo.
export async function criarProduto(
  banco: Banco,
  usuarioId: string,
  empresaId: string,
  entrada: { nome: string; descricao?: string | null | undefined; precoCentavos: number; disponibilidade: DisponibilidadeProduto; categoriaId?: string | null | undefined },
): Promise<{ tipo: "criado"; produto: ProdutoRegistro } | SemAcesso | CategoriaAusente> {
  if (!(await temPermissao(banco, usuarioId, empresaId, "gerenciar-produtos"))) return { tipo: "empresa-nao-encontrada" };
  if (await categoriaInvalida(banco, empresaId, entrada.categoriaId)) return { tipo: "categoria-nao-encontrada" };
  const produto = await inserirProduto(banco, { empresaId, ...entrada, descricao: entrada.descricao ?? null, categoriaId: entrada.categoriaId ?? null });
  return { tipo: "criado", produto };
}

export async function atualizarProduto(
  banco: Banco,
  usuarioId: string,
  empresaId: string,
  produtoId: string,
  entrada: {
    nome?: string | undefined;
    descricao?: string | null | undefined;
    precoCentavos?: number | undefined;
    disponibilidade?: DisponibilidadeProduto | undefined;
    categoriaId?: string | null | undefined;
  },
): Promise<{ tipo: "atualizado"; produto: ProdutoRegistro } | SemAcesso | ProdutoAusente | CategoriaAusente> {
  if (!(await temPermissao(banco, usuarioId, empresaId, "gerenciar-produtos"))) return { tipo: "empresa-nao-encontrada" };
  if (await categoriaInvalida(banco, empresaId, entrada.categoriaId)) return { tipo: "categoria-nao-encontrada" };
  const produto = await atualizarProdutoDaEmpresa(banco, empresaId, produtoId, entrada);
  return produto ? { tipo: "atualizado", produto } : { tipo: "produto-nao-encontrado" };
}

export async function alterarDisponibilidadeProduto(
  banco: Banco,
  usuarioId: string,
  empresaId: string,
  produtoId: string,
  disponibilidade: DisponibilidadeProduto,
): Promise<{ tipo: "atualizado"; produto: ProdutoRegistro } | SemAcesso | ProdutoAusente> {
  if (!(await temPermissao(banco, usuarioId, empresaId, "alterar-disponibilidade-produto"))) return { tipo: "empresa-nao-encontrada" };
  const produto = await atualizarProdutoDaEmpresa(banco, empresaId, produtoId, { disponibilidade });
  return produto ? { tipo: "atualizado", produto } : { tipo: "produto-nao-encontrado" };
}

/**
 * IMAGEM DO PRODUTO. O caso de uso só grava/apaga a CHAVE: quem fala com o armazenamento é a rota,
 * porque o domínio não conhece provedor de arquivos.
 */
export async function definirImagemProduto(
  banco: Banco,
  usuarioId: string,
  empresaId: string,
  produtoId: string,
  imagemChave: string | null,
): Promise<{ tipo: "atualizado"; chaveAnterior: string | null } | SemAcesso | ProdutoAusente> {
  if (!(await temPermissao(banco, usuarioId, empresaId, "gerenciar-produtos"))) return { tipo: "empresa-nao-encontrada" };
  const anterior = await definirImagemDoProduto(banco, empresaId, produtoId, imagemChave);
  if (anterior === undefined) return { tipo: "produto-nao-encontrado" };
  return { tipo: "atualizado", chaveAnterior: anterior };
}
