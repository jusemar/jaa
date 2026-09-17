import type { Banco } from "@jaa/banco";
import { categoriasProduto, produtos } from "@jaa/banco/schema";
import { and, asc, count, eq } from "drizzle-orm";

/*
 * CATEGORIAS — sempre escopadas pela empresa, como os produtos: a categoria só é encontrada pelo par
 * (empresa_id, id). Id de categoria de outra empresa nunca funciona numa rota autorizada.
 */

export type CategoriaRegistro = typeof categoriasProduto.$inferSelect;
export type CategoriaComContagem = CategoriaRegistro & { produtos: number };

export async function listarCategorias(banco: Banco, empresaId: string): Promise<CategoriaComContagem[]> {
  // LEFT JOIN + agregação numa consulta só: a empresa precisa saber quantos produtos perde de vista
  // antes de apagar a categoria, e são poucas categorias por empresa (nada de N+1).
  const linhas = await banco
    .select({ categoria: categoriasProduto, produtos: count(produtos.id) })
    .from(categoriasProduto)
    .leftJoin(produtos, eq(produtos.categoriaId, categoriasProduto.id))
    .where(eq(categoriasProduto.empresaId, empresaId))
    .groupBy(categoriasProduto.id)
    .orderBy(asc(categoriasProduto.posicao), asc(categoriasProduto.nome));

  return linhas.map(({ categoria, produtos: total }) => ({ ...categoria, produtos: total }));
}

export async function buscarCategoria(banco: Banco, empresaId: string, categoriaId: string): Promise<CategoriaRegistro | null> {
  const [categoria] = await banco
    .select()
    .from(categoriasProduto)
    .where(and(eq(categoriasProduto.empresaId, empresaId), eq(categoriasProduto.id, categoriaId)))
    .limit(1);
  return categoria ?? null;
}

export async function inserirCategoria(banco: Banco, empresaId: string, dados: { nome: string; posicao?: number | undefined }): Promise<CategoriaRegistro> {
  const [categoria] = await banco
    .insert(categoriasProduto)
    .values({ empresaId, nome: dados.nome, ...(dados.posicao !== undefined ? { posicao: dados.posicao } : {}) })
    .returning();
  if (!categoria) throw new Error("Inserção de categoria não retornou registro.");
  return categoria;
}

export async function atualizarCategoria(
  banco: Banco,
  empresaId: string,
  categoriaId: string,
  dados: { nome?: string | undefined; posicao?: number | undefined },
): Promise<CategoriaRegistro | null> {
  const [categoria] = await banco
    .update(categoriasProduto)
    .set({
      ...(dados.nome !== undefined ? { nome: dados.nome } : {}),
      ...(dados.posicao !== undefined ? { posicao: dados.posicao } : {}),
      atualizadoEm: new Date(),
    })
    .where(and(eq(categoriasProduto.empresaId, empresaId), eq(categoriasProduto.id, categoriaId)))
    .returning();
  return categoria ?? null;
}

/**
 * Apagar a categoria NÃO apaga produto: organização não pode destruir catálogo.
 *
 * Os produtos voltam para "Sem categoria" na MESMA transação em que a categoria some — nunca existe
 * um instante com produto apontando para categoria inexistente. É feito aqui, e não por
 * `ON DELETE SET NULL`, porque a FK é composta e o SET NULL do PostgreSQL anularia também
 * `empresa_id` (NOT NULL e estrutural).
 */
export async function removerCategoria(banco: Banco, empresaId: string, categoriaId: string): Promise<boolean> {
  return banco.transaction(async (transacao) => {
    await transacao
      .update(produtos)
      .set({ categoriaId: null })
      .where(and(eq(produtos.empresaId, empresaId), eq(produtos.categoriaId, categoriaId)));

    const removidas = await transacao
      .delete(categoriasProduto)
      .where(and(eq(categoriasProduto.empresaId, empresaId), eq(categoriasProduto.id, categoriaId)))
      .returning({ id: categoriasProduto.id });
    return removidas.length > 0;
  });
}

export async function contarCategorias(banco: Banco, empresaId: string): Promise<number> {
  const [linha] = await banco.select({ total: count() }).from(categoriasProduto).where(eq(categoriasProduto.empresaId, empresaId));
  return linha?.total ?? 0;
}
