import type { Banco } from "@jaa/banco";
import { gruposOpcoesProduto, opcoesProduto, produtos } from "@jaa/banco/schema";
import type { DisponibilidadeOpcao } from "@jaa/contratos";
import { and, asc, count, eq, exists, inArray, sql } from "drizzle-orm";

export type GrupoRegistro = typeof gruposOpcoesProduto.$inferSelect;
export type OpcaoRegistro = typeof opcoesProduto.$inferSelect;

export interface GrupoComOpcoes {
  grupo: GrupoRegistro;
  opcoes: OpcaoRegistro[];
}

/*
 * PERSONALIZAÇÃO: grupos de opções de um produto. Toda leitura/escrita é ESCOPADA pela empresa (e,
 * quando faz sentido, pelo produto): um id de grupo ou de opção de outra empresa nunca é encontrado
 * por uma rota autorizada para a empresa errada. `empresa_id` e `produto_id`/`grupo_id` são
 * estruturais e nunca entram em UPDATE.
 */

const ordemGrupos = [asc(gruposOpcoesProduto.posicao), asc(gruposOpcoesProduto.id)] as const;
const ordemOpcoes = [asc(opcoesProduto.posicao), asc(opcoesProduto.id)] as const;

/** Grupos + opções em DUAS consultas (sem N+1), já na ordem de apresentação da empresa. */
export async function listarGruposDoProduto(banco: Banco, empresaId: string, produtoId: string): Promise<GrupoComOpcoes[]> {
  const grupos = await banco
    .select()
    .from(gruposOpcoesProduto)
    .where(and(eq(gruposOpcoesProduto.empresaId, empresaId), eq(gruposOpcoesProduto.produtoId, produtoId)))
    .orderBy(...ordemGrupos);
  if (grupos.length === 0) return [];

  const opcoes = await banco
    .select()
    .from(opcoesProduto)
    .where(
      and(
        eq(opcoesProduto.empresaId, empresaId),
        inArray(
          opcoesProduto.grupoId,
          grupos.map((grupo) => grupo.id),
        ),
      ),
    )
    .orderBy(...ordemOpcoes);

  return grupos.map((grupo) => ({ grupo, opcoes: opcoes.filter((opcao) => opcao.grupoId === grupo.id) }));
}

export async function buscarGrupoDoProduto(banco: Banco, empresaId: string, produtoId: string, grupoId: string): Promise<GrupoRegistro | null> {
  const [grupo] = await banco
    .select()
    .from(gruposOpcoesProduto)
    .where(and(eq(gruposOpcoesProduto.empresaId, empresaId), eq(gruposOpcoesProduto.produtoId, produtoId), eq(gruposOpcoesProduto.id, grupoId)))
    .limit(1);
  return grupo ?? null;
}

export async function contarGruposDoProduto(banco: Banco, empresaId: string, produtoId: string): Promise<number> {
  const [linha] = await banco
    .select({ total: count() })
    .from(gruposOpcoesProduto)
    .where(and(eq(gruposOpcoesProduto.empresaId, empresaId), eq(gruposOpcoesProduto.produtoId, produtoId)));
  return linha?.total ?? 0;
}

export async function contarOpcoesDoGrupo(banco: Banco, empresaId: string, grupoId: string): Promise<number> {
  const [linha] = await banco
    .select({ total: count() })
    .from(opcoesProduto)
    .where(and(eq(opcoesProduto.empresaId, empresaId), eq(opcoesProduto.grupoId, grupoId)));
  return linha?.total ?? 0;
}

// Próxima posição livre: a empresa cadastra na ordem em que pensa, sem digitar número de posição.
const proximaPosicao = (total: number) => Math.min(total, 9999);

export async function inserirGrupo(
  banco: Banco,
  dados: {
    empresaId: string;
    produtoId: string;
    nome: string;
    instrucao: string | null;
    minimoEscolhas: number;
    maximoEscolhas: number;
    posicao?: number | undefined;
  },
): Promise<GrupoRegistro> {
  const posicao = dados.posicao ?? proximaPosicao(await contarGruposDoProduto(banco, dados.empresaId, dados.produtoId));
  const [grupo] = await banco.insert(gruposOpcoesProduto).values({ ...dados, posicao }).returning();
  if (!grupo) throw new Error("Inserção de grupo de opções não retornou registro.");
  return grupo;
}

export async function atualizarGrupo(
  banco: Banco,
  empresaId: string,
  grupoId: string,
  dados: { nome?: string | undefined; instrucao?: string | null | undefined; minimoEscolhas?: number | undefined; maximoEscolhas?: number | undefined; posicao?: number | undefined },
): Promise<GrupoRegistro | null> {
  // Lista explícita de colunas editáveis: empresa e produto do grupo nunca chegam ao UPDATE.
  const alteracoes = {
    ...(dados.nome !== undefined ? { nome: dados.nome } : {}),
    ...(dados.instrucao !== undefined ? { instrucao: dados.instrucao } : {}),
    ...(dados.minimoEscolhas !== undefined ? { minimoEscolhas: dados.minimoEscolhas } : {}),
    ...(dados.maximoEscolhas !== undefined ? { maximoEscolhas: dados.maximoEscolhas } : {}),
    ...(dados.posicao !== undefined ? { posicao: dados.posicao } : {}),
    atualizadoEm: new Date(),
  };
  const [grupo] = await banco
    .update(gruposOpcoesProduto)
    .set(alteracoes)
    .where(and(eq(gruposOpcoesProduto.empresaId, empresaId), eq(gruposOpcoesProduto.id, grupoId)))
    .returning();
  return grupo ?? null;
}

/** Apaga o grupo e, por cascata do banco, as opções dele. Pedidos antigos não são afetados: eles
 * guardam o snapshot das escolhas (nome do grupo, nome da opção e acréscimo). */
export async function removerGrupo(banco: Banco, empresaId: string, grupoId: string): Promise<boolean> {
  const removidos = await banco
    .delete(gruposOpcoesProduto)
    .where(and(eq(gruposOpcoesProduto.empresaId, empresaId), eq(gruposOpcoesProduto.id, grupoId)))
    .returning({ id: gruposOpcoesProduto.id });
  return removidos.length > 0;
}

export async function inserirOpcao(
  banco: Banco,
  dados: { empresaId: string; grupoId: string; nome: string; precoAdicionalCentavos: number; disponibilidade: DisponibilidadeOpcao; posicao?: number | undefined },
): Promise<OpcaoRegistro> {
  const posicao = dados.posicao ?? proximaPosicao(await contarOpcoesDoGrupo(banco, dados.empresaId, dados.grupoId));
  const [opcao] = await banco.insert(opcoesProduto).values({ ...dados, posicao }).returning();
  if (!opcao) throw new Error("Inserção de opção não retornou registro.");
  return opcao;
}

export async function buscarOpcaoDoGrupo(banco: Banco, empresaId: string, grupoId: string, opcaoId: string): Promise<OpcaoRegistro | null> {
  const [opcao] = await banco
    .select()
    .from(opcoesProduto)
    .where(and(eq(opcoesProduto.empresaId, empresaId), eq(opcoesProduto.grupoId, grupoId), eq(opcoesProduto.id, opcaoId)))
    .limit(1);
  return opcao ?? null;
}

export async function atualizarOpcao(
  banco: Banco,
  empresaId: string,
  grupoId: string,
  opcaoId: string,
  dados: { nome?: string | undefined; precoAdicionalCentavos?: number | undefined; disponibilidade?: DisponibilidadeOpcao | undefined; posicao?: number | undefined },
): Promise<OpcaoRegistro | null> {
  const alteracoes = {
    ...(dados.nome !== undefined ? { nome: dados.nome } : {}),
    ...(dados.precoAdicionalCentavos !== undefined ? { precoAdicionalCentavos: dados.precoAdicionalCentavos } : {}),
    ...(dados.disponibilidade !== undefined ? { disponibilidade: dados.disponibilidade } : {}),
    ...(dados.posicao !== undefined ? { posicao: dados.posicao } : {}),
    atualizadoEm: new Date(),
  };
  const [opcao] = await banco
    .update(opcoesProduto)
    .set(alteracoes)
    .where(and(eq(opcoesProduto.empresaId, empresaId), eq(opcoesProduto.grupoId, grupoId), eq(opcoesProduto.id, opcaoId)))
    .returning();
  return opcao ?? null;
}

export async function removerOpcao(banco: Banco, empresaId: string, grupoId: string, opcaoId: string): Promise<boolean> {
  const removidas = await banco
    .delete(opcoesProduto)
    .where(and(eq(opcoesProduto.empresaId, empresaId), eq(opcoesProduto.grupoId, grupoId), eq(opcoesProduto.id, opcaoId)))
    .returning({ id: opcoesProduto.id });
  return removidas.length > 0;
}

/*
 * CONSULTA DE CLIENTE: só opções DISPONÍVEIS. Um grupo sem nenhuma opção disponível é omitido; se o
 * grupo exigir mais escolhas do que as opções disponíveis permitem, quem serializa também o omite
 * (senão o produto ficaria impossível de montar).
 */
export async function listarGruposDisponiveisDoProduto(banco: Banco, empresaId: string, produtoId: string): Promise<GrupoComOpcoes[]> {
  const grupos = await listarGruposDoProduto(banco, empresaId, produtoId);
  return grupos
    .map(({ grupo, opcoes }) => ({ grupo, opcoes: opcoes.filter((opcao) => opcao.disponibilidade === "disponivel") }))
    .filter(({ opcoes }) => opcoes.length > 0);
}

/**
 * Quais destes produtos têm montagem a oferecer (≥ 1 grupo com ≥ 1 opção disponível). UMA consulta
 * para a página inteira do cardápio: o cliente precisa saber, na LISTA, se abre a montagem ou
 * adiciona direto — sem carregar os grupos de todos os produtos.
 */
export async function idsDeProdutosPersonalizaveis(banco: Banco, empresaId: string, produtoIds: string[]): Promise<Set<string>> {
  if (produtoIds.length === 0) return new Set();
  const linhas = await banco
    .selectDistinct({ produtoId: gruposOpcoesProduto.produtoId })
    .from(gruposOpcoesProduto)
    .where(
      and(
        eq(gruposOpcoesProduto.empresaId, empresaId),
        inArray(gruposOpcoesProduto.produtoId, produtoIds),
        exists(
          banco
            .select({ existe: sql`1` })
            .from(opcoesProduto)
            .where(and(eq(opcoesProduto.grupoId, gruposOpcoesProduto.id), eq(opcoesProduto.disponibilidade, "disponivel"))),
        ),
      ),
    );
  return new Set(linhas.map((linha) => linha.produtoId));
}

/**
 * Opções escolhidas em um pedido, lidas do BANCO com o grupo e o produto de cada uma. É a base do
 * recálculo do preço e da validação de mínimo/máximo: o navegador nunca diz a que grupo uma opção
 * pertence nem quanto ela custa.
 */
export interface OpcaoEscolhidaRegistro {
  opcaoId: string;
  opcaoNome: string;
  precoAdicionalCentavos: number;
  grupoId: string;
  grupoNome: string;
  grupoPosicao: number;
  produtoId: string;
}

export async function listarOpcoesDisponiveisPorIds(banco: Banco, empresaId: string, opcaoIds: string[]): Promise<OpcaoEscolhidaRegistro[]> {
  if (opcaoIds.length === 0) return [];
  return banco
    .select({
      opcaoId: opcoesProduto.id,
      opcaoNome: opcoesProduto.nome,
      precoAdicionalCentavos: opcoesProduto.precoAdicionalCentavos,
      grupoId: gruposOpcoesProduto.id,
      grupoNome: gruposOpcoesProduto.nome,
      grupoPosicao: gruposOpcoesProduto.posicao,
      produtoId: gruposOpcoesProduto.produtoId,
    })
    .from(opcoesProduto)
    .innerJoin(gruposOpcoesProduto, eq(gruposOpcoesProduto.id, opcoesProduto.grupoId))
    .innerJoin(produtos, eq(produtos.id, gruposOpcoesProduto.produtoId))
    .where(
      and(
        eq(opcoesProduto.empresaId, empresaId),
        eq(opcoesProduto.disponibilidade, "disponivel"),
        // Produto indisponível não entra em pedido novo — nem por uma opção dele.
        eq(produtos.disponibilidade, "disponivel"),
        inArray(opcoesProduto.id, opcaoIds),
      ),
    )
    .orderBy(...ordemGrupos, ...ordemOpcoes);
}

/**
 * Grupos DISPONÍVEIS de vários produtos de uma vez (duas consultas, sem N+1). É o que o pedido
 * precisa: para validar mínimo/máximo é necessário conhecer TODOS os grupos do produto, inclusive
 * aqueles para os quais o cliente não enviou nenhuma opção (um obrigatório esquecido é recusa).
 */
export async function listarGruposDisponiveisPorProdutos(banco: Banco, empresaId: string, produtoIds: string[]): Promise<Map<string, GrupoComOpcoes[]>> {
  const porProduto = new Map<string, GrupoComOpcoes[]>();
  if (produtoIds.length === 0) return porProduto;

  const grupos = await banco
    .select()
    .from(gruposOpcoesProduto)
    .where(and(eq(gruposOpcoesProduto.empresaId, empresaId), inArray(gruposOpcoesProduto.produtoId, produtoIds)))
    .orderBy(...ordemGrupos);
  if (grupos.length === 0) return porProduto;

  const opcoes = await banco
    .select()
    .from(opcoesProduto)
    .where(
      and(
        eq(opcoesProduto.empresaId, empresaId),
        eq(opcoesProduto.disponibilidade, "disponivel"),
        inArray(
          opcoesProduto.grupoId,
          grupos.map((grupo) => grupo.id),
        ),
      ),
    )
    .orderBy(...ordemOpcoes);

  for (const grupo of grupos) {
    const lista = porProduto.get(grupo.produtoId) ?? [];
    lista.push({ grupo, opcoes: opcoes.filter((opcao) => opcao.grupoId === grupo.id) });
    porProduto.set(grupo.produtoId, lista);
  }
  return porProduto;
}
