import type { Banco } from "@jaa/banco";
import type { DisponibilidadeProduto } from "@jaa/contratos";
import { autorizarEmpresa, type PermissaoEmpresa } from "../../empresas/lib/autorizacao-empresas.js";
import {
  atualizarProdutoDaEmpresa,
  buscarProdutoDaEmpresa,
  inserirProduto,
  listarProdutosDaEmpresa,
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

async function temPermissao(banco: Banco, usuarioId: string, empresaId: string, permissao: PermissaoEmpresa) {
  return (await autorizarEmpresa(banco, usuarioId, empresaId, permissao)) !== null;
}

export async function listarProdutosAdministrados(
  banco: Banco,
  usuarioId: string,
  empresaId: string,
): Promise<{ tipo: "lista"; produtos: ProdutoRegistro[] } | SemAcesso> {
  if (!(await temPermissao(banco, usuarioId, empresaId, "ver-produtos"))) return { tipo: "empresa-nao-encontrada" };
  return { tipo: "lista", produtos: await listarProdutosDaEmpresa(banco, empresaId) };
}

export async function obterProdutoAdministrado(
  banco: Banco,
  usuarioId: string,
  empresaId: string,
  produtoId: string,
): Promise<{ tipo: "produto"; produto: ProdutoRegistro } | SemAcesso | ProdutoAusente> {
  if (!(await temPermissao(banco, usuarioId, empresaId, "ver-produtos"))) return { tipo: "empresa-nao-encontrada" };
  const produto = await buscarProdutoDaEmpresa(banco, empresaId, produtoId);
  return produto ? { tipo: "produto", produto } : { tipo: "produto-nao-encontrado" };
}

// A empresa vem da ROTA autorizada; nunca do corpo.
export async function criarProduto(
  banco: Banco,
  usuarioId: string,
  empresaId: string,
  entrada: { nome: string; descricao?: string | null | undefined; precoCentavos: number; disponibilidade: DisponibilidadeProduto },
): Promise<{ tipo: "criado"; produto: ProdutoRegistro } | SemAcesso> {
  if (!(await temPermissao(banco, usuarioId, empresaId, "gerenciar-produtos"))) return { tipo: "empresa-nao-encontrada" };
  const produto = await inserirProduto(banco, { empresaId, ...entrada, descricao: entrada.descricao ?? null });
  return { tipo: "criado", produto };
}

export async function atualizarProduto(
  banco: Banco,
  usuarioId: string,
  empresaId: string,
  produtoId: string,
  entrada: { nome?: string | undefined; descricao?: string | null | undefined; precoCentavos?: number | undefined; disponibilidade?: DisponibilidadeProduto | undefined },
): Promise<{ tipo: "atualizado"; produto: ProdutoRegistro } | SemAcesso | ProdutoAusente> {
  if (!(await temPermissao(banco, usuarioId, empresaId, "gerenciar-produtos"))) return { tipo: "empresa-nao-encontrada" };
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
