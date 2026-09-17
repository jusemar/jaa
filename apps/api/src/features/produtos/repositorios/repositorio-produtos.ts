import type { Banco } from "@jaa/banco";
import { categoriasProduto, produtos } from "@jaa/banco/schema";
import type { DisponibilidadeProduto } from "@jaa/contratos";
import { and, asc, count, desc, eq, ilike, inArray, isNull } from "drizzle-orm";

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
  dados: { empresaId: string; nome: string; descricao: string | null; precoCentavos: number; disponibilidade: DisponibilidadeProduto; categoriaId?: string | null },
): Promise<ProdutoRegistro> {
  const [produto] = await banco.insert(produtos).values(dados).returning();
  if (!produto) throw new Error("Inserção de produto não retornou registro.");
  return produto;
}

export async function atualizarProdutoDaEmpresa(
  banco: Banco,
  empresaId: string,
  produtoId: string,
  dados: {
    nome?: string | undefined;
    descricao?: string | null | undefined;
    precoCentavos?: number | undefined;
    disponibilidade?: DisponibilidadeProduto | undefined;
    categoriaId?: string | null | undefined;
  },
): Promise<ProdutoRegistro | null> {
  // Lista explícita de colunas editáveis: nada fora dela (como empresaId) chega ao UPDATE.
  const alteracoes = {
    ...(dados.nome !== undefined ? { nome: dados.nome } : {}),
    ...(dados.descricao !== undefined ? { descricao: dados.descricao } : {}),
    ...(dados.precoCentavos !== undefined ? { precoCentavos: dados.precoCentavos } : {}),
    ...(dados.disponibilidade !== undefined ? { disponibilidade: dados.disponibilidade } : {}),
    ...(dados.categoriaId !== undefined ? { categoriaId: dados.categoriaId } : {}),
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

/*
 * LISTAGEM PAGINADA da administração, com filtros. O catálogo de uma empresa cresce e a tela não pode
 * baixar tudo: a paginação é do SERVIDOR (o cliente só pede a página) e o total vem junto para a
 * interface saber quantas páginas existem.
 */
export interface ConsultaProdutosAdministracao {
  pagina: number;
  limite: number;
  categoriaId?: string | "sem-categoria" | undefined;
  disponibilidade?: DisponibilidadeProduto | undefined;
  busca?: string | undefined;
}

export type ProdutoComCategoria = ProdutoRegistro & { categoriaNome: string | null };

export async function listarProdutosPaginados(
  banco: Banco,
  empresaId: string,
  consulta: ConsultaProdutosAdministracao,
): Promise<{ produtos: ProdutoComCategoria[]; total: number }> {
  const filtros = [eq(produtos.empresaId, empresaId)];
  if (consulta.categoriaId === "sem-categoria") filtros.push(isNull(produtos.categoriaId));
  else if (consulta.categoriaId) filtros.push(eq(produtos.categoriaId, consulta.categoriaId));
  if (consulta.disponibilidade) filtros.push(eq(produtos.disponibilidade, consulta.disponibilidade));
  if (consulta.busca) filtros.push(ilike(produtos.nome, `%${consulta.busca}%`));

  const condicao = and(...filtros);
  const [contagem] = await banco.select({ total: count() }).from(produtos).where(condicao);

  const linhas = await banco
    .select({
      produto: produtos,
      categoriaNome: categoriasProduto.nome,
    })
    .from(produtos)
    .leftJoin(categoriasProduto, eq(categoriasProduto.id, produtos.categoriaId))
    .where(condicao)
    // Mais recentes primeiro: é o que a empresa acabou de cadastrar e quer conferir.
    .orderBy(desc(produtos.criadoEm), desc(produtos.id))
    .limit(consulta.limite)
    .offset((consulta.pagina - 1) * consulta.limite);

  return { produtos: linhas.map(({ produto, categoriaNome }) => ({ ...produto, categoriaNome })), total: contagem?.total ?? 0 };
}

export async function buscarProdutoComCategoria(banco: Banco, empresaId: string, produtoId: string): Promise<ProdutoComCategoria | null> {
  const [linha] = await banco
    .select({ produto: produtos, categoriaNome: categoriasProduto.nome })
    .from(produtos)
    .leftJoin(categoriasProduto, eq(categoriasProduto.id, produtos.categoriaId))
    .where(and(eq(produtos.empresaId, empresaId), eq(produtos.id, produtoId)))
    .limit(1);
  return linha ? { ...linha.produto, categoriaNome: linha.categoriaNome } : null;
}

/** Troca a imagem e devolve a chave ANTERIOR, para remover o arquivo velho do armazenamento. */
export async function definirImagemDoProduto(banco: Banco, empresaId: string, produtoId: string, imagemChave: string | null): Promise<string | null | undefined> {
  const [anterior] = await banco
    .select({ chave: produtos.imagemChave })
    .from(produtos)
    .where(and(eq(produtos.empresaId, empresaId), eq(produtos.id, produtoId)))
    .limit(1);
  // undefined = produto não existe nesta empresa (diferente de "existe e não tem imagem").
  if (!anterior) return undefined;

  await banco
    .update(produtos)
    .set({ imagemChave, atualizadoEm: new Date() })
    .where(and(eq(produtos.empresaId, empresaId), eq(produtos.id, produtoId)));
  return anterior.chave;
}
