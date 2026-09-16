import type { Banco } from "@jaa/banco";
import { produtos } from "@jaa/banco/schema";
import type { DisponibilidadeProduto } from "@jaa/contratos";
import { and, asc, eq, inArray } from "drizzle-orm";

export type ProdutoRegistro = typeof produtos.$inferSelect;

/*
 * Toda leitura/escrita é ESCOPADA pela empresa: o produto só é encontrado com o par (empresa_id, id).
 * Assim um id de produto de outra empresa nunca "vaza" por uma rota autorizada para a empresa errada.
 * `empresa_id` só é definido na criação e nunca aparece em UPDATE (o banco também impede a troca).
 */

export async function listarProdutosDaEmpresa(banco: Banco, empresaId: string): Promise<ProdutoRegistro[]> {
  return banco.select().from(produtos).where(eq(produtos.empresaId, empresaId)).orderBy(asc(produtos.criadoEm), asc(produtos.id));
}

export async function buscarProdutoDaEmpresa(banco: Banco, empresaId: string, produtoId: string): Promise<ProdutoRegistro | null> {
  const [produto] = await banco
    .select()
    .from(produtos)
    .where(and(eq(produtos.empresaId, empresaId), eq(produtos.id, produtoId)))
    .limit(1);
  return produto ?? null;
}

export async function inserirProduto(
  banco: Banco,
  dados: { empresaId: string; nome: string; descricao: string | null; precoCentavos: number; disponibilidade: DisponibilidadeProduto },
): Promise<ProdutoRegistro> {
  const [produto] = await banco.insert(produtos).values(dados).returning();
  if (!produto) throw new Error("Inserção de produto não retornou registro.");
  return produto;
}

export async function atualizarProdutoDaEmpresa(
  banco: Banco,
  empresaId: string,
  produtoId: string,
  dados: { nome?: string | undefined; descricao?: string | null | undefined; precoCentavos?: number | undefined; disponibilidade?: DisponibilidadeProduto | undefined },
): Promise<ProdutoRegistro | null> {
  // Lista explícita de colunas editáveis: nada fora dela (como empresaId) chega ao UPDATE.
  const alteracoes = {
    ...(dados.nome !== undefined ? { nome: dados.nome } : {}),
    ...(dados.descricao !== undefined ? { descricao: dados.descricao } : {}),
    ...(dados.precoCentavos !== undefined ? { precoCentavos: dados.precoCentavos } : {}),
    ...(dados.disponibilidade !== undefined ? { disponibilidade: dados.disponibilidade } : {}),
    atualizadoEm: new Date(),
  };
  const [produto] = await banco
    .update(produtos)
    .set(alteracoes)
    .where(and(eq(produtos.empresaId, empresaId), eq(produtos.id, produtoId)))
    .returning();
  return produto ?? null;
}

// Consulta de CLIENTE: somente produtos disponíveis da empresa (mesmo domínio da administração).
export async function listarProdutosDisponiveisDaEmpresa(banco: Banco, empresaId: string): Promise<ProdutoRegistro[]> {
  return banco
    .select()
    .from(produtos)
    .where(and(eq(produtos.empresaId, empresaId), eq(produtos.disponibilidade, "disponivel")))
    .orderBy(asc(produtos.criadoEm), asc(produtos.id));
}

export async function buscarProdutoDisponivelDaEmpresa(banco: Banco, empresaId: string, produtoId: string): Promise<ProdutoRegistro | null> {
  const [produto] = await banco
    .select()
    .from(produtos)
    .where(and(eq(produtos.empresaId, empresaId), eq(produtos.id, produtoId), eq(produtos.disponibilidade, "disponivel")))
    .limit(1);
  return produto ?? null;
}

// Produtos DISPONÍVEIS desta empresa entre os ids pedidos (base do recálculo de preços do pedido).
export async function listarProdutosDisponiveisPorIds(banco: Banco, empresaId: string, produtoIds: string[]): Promise<ProdutoRegistro[]> {
  if (produtoIds.length === 0) return [];
  return banco
    .select()
    .from(produtos)
    .where(and(eq(produtos.empresaId, empresaId), eq(produtos.disponibilidade, "disponivel"), inArray(produtos.id, produtoIds)));
}
