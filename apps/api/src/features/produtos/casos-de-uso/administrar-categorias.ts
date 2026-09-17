import type { Banco } from "@jaa/banco";
import { autorizarEmpresa } from "../../empresas/lib/autorizacao-empresas.js";
import {
  atualizarCategoria,
  inserirCategoria,
  listarCategorias,
  removerCategoria,
  type CategoriaComContagem,
  type CategoriaRegistro,
} from "../repositorios/repositorio-categorias.js";

/*
 * CATEGORIAS da empresa. Mesma sequência dos produtos: conta da sessão → permissão na empresa →
 * categoria escopada por essa empresa. Sem acesso e inexistente são indistinguíveis (404).
 *
 * Reusa as permissões de produto de propósito: categoria é organização do catálogo, não um domínio
 * administrativo novo. Quem pode mexer no catálogo pode organizá-lo.
 */

type SemAcesso = { tipo: "empresa-nao-encontrada" };
type CategoriaAusente = { tipo: "categoria-nao-encontrada" };
type NomeEmUso = { tipo: "nome-em-uso" };

/**
 * O índice único é por (empresa, lower(nome)): a violação vira mensagem, não erro 500.
 * O driver embrulha o erro do PostgreSQL, então o código pode estar na causa — checamos a cadeia.
 */
function ehNomeDuplicado(erro: unknown): boolean {
  for (let atual: unknown = erro; atual != null; atual = (atual as { cause?: unknown }).cause) {
    if (typeof atual === "object" && "code" in atual && (atual as { code?: unknown }).code === "23505") return true;
  }
  return false;
}

export async function listarCategoriasDaEmpresa(
  banco: Banco,
  usuarioId: string,
  empresaId: string,
): Promise<{ tipo: "lista"; categorias: CategoriaComContagem[] } | SemAcesso> {
  if (!(await autorizarEmpresa(banco, usuarioId, empresaId, "ver-produtos"))) return { tipo: "empresa-nao-encontrada" };
  return { tipo: "lista", categorias: await listarCategorias(banco, empresaId) };
}

export async function criarCategoria(
  banco: Banco,
  usuarioId: string,
  empresaId: string,
  entrada: { nome: string; posicao?: number | undefined },
): Promise<{ tipo: "criada"; categoria: CategoriaRegistro } | SemAcesso | NomeEmUso> {
  if (!(await autorizarEmpresa(banco, usuarioId, empresaId, "gerenciar-produtos"))) return { tipo: "empresa-nao-encontrada" };
  try {
    return { tipo: "criada", categoria: await inserirCategoria(banco, empresaId, entrada) };
  } catch (erro) {
    if (ehNomeDuplicado(erro)) return { tipo: "nome-em-uso" };
    throw erro;
  }
}

export async function editarCategoria(
  banco: Banco,
  usuarioId: string,
  empresaId: string,
  categoriaId: string,
  entrada: { nome?: string | undefined; posicao?: number | undefined },
): Promise<{ tipo: "atualizada"; categoria: CategoriaRegistro } | SemAcesso | CategoriaAusente | NomeEmUso> {
  if (!(await autorizarEmpresa(banco, usuarioId, empresaId, "gerenciar-produtos"))) return { tipo: "empresa-nao-encontrada" };
  try {
    const categoria = await atualizarCategoria(banco, empresaId, categoriaId, entrada);
    return categoria ? { tipo: "atualizada", categoria } : { tipo: "categoria-nao-encontrada" };
  } catch (erro) {
    if (ehNomeDuplicado(erro)) return { tipo: "nome-em-uso" };
    throw erro;
  }
}

/** Apagar a categoria devolve os produtos dela para "Sem categoria"; nenhum produto é perdido. */
export async function excluirCategoria(
  banco: Banco,
  usuarioId: string,
  empresaId: string,
  categoriaId: string,
): Promise<{ tipo: "removida" } | SemAcesso | CategoriaAusente> {
  if (!(await autorizarEmpresa(banco, usuarioId, empresaId, "gerenciar-produtos"))) return { tipo: "empresa-nao-encontrada" };
  return (await removerCategoria(banco, empresaId, categoriaId)) ? { tipo: "removida" } : { tipo: "categoria-nao-encontrada" };
}
