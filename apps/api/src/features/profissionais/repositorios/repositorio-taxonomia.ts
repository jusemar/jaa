import type { Banco } from "@jaa/banco";
import {
  atributosServico,
  categoriasProfissionais,
  especialidadesServico,
  opcoesAtributo,
  servicosProfissionais,
  termosBuscaServico,
} from "@jaa/banco/schema";
import type { CatalogoServicos, ServicoEncontradoPorTermo } from "@jaa/contratos";
import { and, asc, eq, sql } from "drizzle-orm";

/*
 * TAXONOMIA do Motor Profissional. As funções de CRIAÇÃO são a base do futuro Gestor da Plataforma
 * (hoje só testes as usam — não há painel nem rota administrativa). Nenhum serviço/opção é fixo em
 * código: tudo é linha no banco.
 *
 * O nome do serviço e de cada especialidade viram automaticamente termos de busca; sinônimos e
 * apelidos populares ("motoboy" → Entrega + Moto) entram por `termos` ou `adicionarTermoBusca`.
 */

type Transacao = Parameters<Parameters<Banco["transaction"]>[0]>[0];
type Executor = Banco | Transacao;

export async function criarCategoriaProfissional(banco: Executor, dados: { slug: string; nome: string; ordem?: number }) {
  const [categoria] = await banco.insert(categoriasProfissionais).values(dados).returning();
  if (!categoria) throw new Error("Categoria não criada.");
  return categoria;
}

export async function adicionarTermoBusca(
  banco: Executor,
  dados: { servicoId: string; termo: string; especialidadeId?: string | null; opcaoId?: string | null },
): Promise<void> {
  await banco
    .insert(termosBuscaServico)
    .values({ servicoId: dados.servicoId, termo: dados.termo.trim(), especialidadeId: dados.especialidadeId ?? null, opcaoId: dados.opcaoId ?? null })
    .onConflictDoNothing();
}

export function criarServicoProfissional(
  banco: Banco,
  dados: { categoriaId: string; slug: string; nome: string; ordem?: number; termos?: string[] },
) {
  return banco.transaction(async (transacao) => {
    const { termos = [], ...campos } = dados;
    const [servico] = await transacao.insert(servicosProfissionais).values(campos).returning();
    if (!servico) throw new Error("Serviço não criado.");
    for (const termo of [servico.nome, ...termos]) await adicionarTermoBusca(transacao, { servicoId: servico.id, termo });
    return servico;
  });
}

export function criarEspecialidadeServico(banco: Banco, dados: { servicoId: string; slug: string; nome: string; ordem?: number; termos?: string[] }) {
  return banco.transaction(async (transacao) => {
    const { termos = [], ...campos } = dados;
    const [especialidade] = await transacao.insert(especialidadesServico).values(campos).returning();
    if (!especialidade) throw new Error("Especialidade não criada.");
    for (const termo of [especialidade.nome, ...termos]) {
      await adicionarTermoBusca(transacao, { servicoId: especialidade.servicoId, especialidadeId: especialidade.id, termo });
    }
    return especialidade;
  });
}

export async function criarAtributoServico(
  banco: Executor,
  dados: { servicoId: string; slug: string; nome: string; tipoSelecao?: "unica" | "multipla"; ordem?: number },
) {
  const [atributo] = await banco.insert(atributosServico).values(dados).returning();
  if (!atributo) throw new Error("Atributo não criado.");
  return atributo;
}

/** O nome da opção NÃO vira termo sozinho ("Residencial" é detalhe, não busca); use `termos`. */
export function criarOpcaoAtributo(banco: Banco, dados: { atributoId: string; slug: string; nome: string; ordem?: number; termos?: string[] }) {
  return banco.transaction(async (transacao) => {
    const { termos = [], ...campos } = dados;
    const [atributo] = await transacao
      .select({ servicoId: atributosServico.servicoId })
      .from(atributosServico)
      .where(eq(atributosServico.id, campos.atributoId));
    if (!atributo) throw new Error("Atributo inexistente.");
    const [opcao] = await transacao
      .insert(opcoesAtributo)
      .values({ ...campos, servicoId: atributo.servicoId })
      .returning();
    if (!opcao) throw new Error("Opção não criada.");
    for (const termo of termos) await adicionarTermoBusca(transacao, { servicoId: opcao.servicoId, opcaoId: opcao.id, termo });
    return opcao;
  });
}

/** Catálogo ATIVO completo (poucas linhas): cinco consultas e montagem em memória, sem N+1. */
export async function listarCatalogoServicos(banco: Banco): Promise<CatalogoServicos> {
  const [categorias, servicos, especialidades, atributos, opcoes] = await Promise.all([
    banco
      .select()
      .from(categoriasProfissionais)
      .where(eq(categoriasProfissionais.ativa, true))
      .orderBy(asc(categoriasProfissionais.ordem), asc(categoriasProfissionais.nome)),
    banco
      .select()
      .from(servicosProfissionais)
      .where(eq(servicosProfissionais.ativo, true))
      .orderBy(asc(servicosProfissionais.ordem), asc(servicosProfissionais.nome)),
    banco
      .select()
      .from(especialidadesServico)
      .where(eq(especialidadesServico.ativa, true))
      .orderBy(asc(especialidadesServico.ordem), asc(especialidadesServico.nome)),
    banco
      .select()
      .from(atributosServico)
      .where(eq(atributosServico.ativo, true))
      .orderBy(asc(atributosServico.ordem), asc(atributosServico.nome)),
    banco
      .select()
      .from(opcoesAtributo)
      .where(eq(opcoesAtributo.ativa, true))
      .orderBy(asc(opcoesAtributo.ordem), asc(opcoesAtributo.nome)),
  ]);
  const item = ({ id, slug, nome }: { id: string; slug: string; nome: string }) => ({ id, slug, nome });

  return {
    categorias: categorias.map((categoria) => ({
      ...item(categoria),
      servicos: servicos
        .filter((servico) => servico.categoriaId === categoria.id)
        .map((servico) => ({
          ...item(servico),
          categoriaId: servico.categoriaId,
          especialidades: especialidades.filter((especialidade) => especialidade.servicoId === servico.id).map(item),
          atributos: atributos
            .filter((atributo) => atributo.servicoId === servico.id)
            .map((atributo) => ({
              ...item(atributo),
              tipoSelecao: atributo.tipoSelecao,
              opcoes: opcoes.filter((opcao) => opcao.atributoId === atributo.id).map(item),
            })),
        })),
    })),
  };
}

export const TERMO_BUSCA_TAMANHO_MINIMO = 2;
const LIMITE_RESULTADOS_TERMO = 20;

/**
 * BUSCA TEXTUAL DE SERVIÇOS, determinística e sem IA, sobre o dicionário de termos (tabela pequena,
 * com GIN de trigramas em `termo_normalizado`). Ordem: termo EXATO → mesma GRAFIA COMPACTA ("moto
 * boy", "moto-boy" = "motoboy") → PREFIXO → SEMELHANTE (trigramas: erro de digitação). Acento e caixa
 * não importam: termo e consulta passam pelo mesmo `jaa_normalizar` do banco.
 *
 * A grafia compacta só compara o termo INTEIRO — nunca prefixo nem pedaço —, então "moto" não vira
 * "motoboy": continua ambíguo e devolve todas as intenções compatíveis, sem escolher por ninguém.
 */
export async function buscarServicosPorTermo(banco: Banco, termo: string, limite = LIMITE_RESULTADOS_TERMO): Promise<ServicoEncontradoPorTermo[]> {
  if (termo.trim().length < TERMO_BUSCA_TAMANHO_MINIMO) return [];
  const resultado = await banco.execute<{
    servico_id: string;
    servico_nome: string;
    especialidade_id: string | null;
    opcao_id: string | null;
    termo: string;
    prioridade: number;
  }>(sql`
    with consulta as (select jaa_normalizar(${termo}) as n, regexp_replace(jaa_normalizar(${termo}), '[^a-z0-9]', '', 'g') as compacto)
    select t.servico_id, s.nome as servico_nome, t.especialidade_id, t.opcao_id, t.termo,
           case when t.termo_normalizado = c.n then 0
                when c.compacto <> '' and t.termo_compacto = c.compacto then 1
                when t.termo_normalizado like replace(replace(replace(c.n, '\\', '\\\\'), '%', '\\%'), '_', '\\_') || '%' then 2
                else 3 end as prioridade
      from ${termosBuscaServico} t
      join ${servicosProfissionais} s on s.id = t.servico_id and s.ativo
      cross join consulta c
     where t.termo_normalizado = c.n
        or (c.compacto <> '' and t.termo_compacto = c.compacto)
        or t.termo_normalizado like replace(replace(replace(c.n, '\\', '\\\\'), '%', '\\%'), '_', '\\_') || '%'
        or t.termo_normalizado % c.n
     order by prioridade, similarity(t.termo_normalizado, c.n) desc, t.termo
     limit ${Math.min(Math.max(limite, 1), 50)}`);

  return resultado.rows.map((linha) => ({
    servicoId: linha.servico_id,
    servicoNome: linha.servico_nome,
    especialidadeId: linha.especialidade_id,
    opcaoId: linha.opcao_id,
    termo: linha.termo,
    // Público: mesma grafia compacta também é correspondência EXATA (0); prefixo 1; semelhante 2.
    prioridade: linha.prioridade <= 1 ? 0 : linha.prioridade === 2 ? 1 : 2,
  }));
}

export function servicoAtivo(banco: Executor, servicoId: string) {
  return banco
    .select({ id: servicosProfissionais.id })
    .from(servicosProfissionais)
    .where(and(eq(servicosProfissionais.id, servicoId), eq(servicosProfissionais.ativo, true)))
    .then((linhas) => linhas[0] ?? null);
}
