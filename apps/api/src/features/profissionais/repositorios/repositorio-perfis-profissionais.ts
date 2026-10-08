import type { Banco } from "@jaa/banco";
import { multipoligonoDeVertices, verticesDeMultipoligonoGeoJson, type PontoGeografico } from "@jaa/banco/geoespacial";
import {
  areasAtuacao,
  areasAtuacaoServicos,
  atributosServico,
  basesProfissionais,
  especialidadesServico,
  especialidadesServicoPerfil,
  identidades,
  municipios,
  opcoesAtributo,
  opcoesServicoPerfil,
  perfisProfissionais,
  periodosAtendimento,
  servicosPerfil,
  servicosProfissionais,
} from "@jaa/banco/schema";
import type { PeriodoAtendimento, PoligonoZona } from "@jaa/contratos";
import { and, asc, count, eq, inArray, sql } from "drizzle-orm";

/*
 * PERSISTÊNCIA do Perfil Profissional. Tudo é escopado pelo PERFIL do dono (resolvido a partir da
 * identidade da sessão): serviço ou área de outro perfil simplesmente não existe para quem pergunta.
 * As regras (limites, compatibilidade, ativação) ficam no caso de uso.
 */

export type Transacao = Parameters<Parameters<Banco["transaction"]>[0]>[0];
export type Executor = Banco | Transacao;

export type PerfilRegistro = typeof perfisProfissionais.$inferSelect;
export type BaseRegistro = typeof basesProfissionais.$inferSelect;

export async function identidadeEhPessoal(banco: Executor, identidadeId: string): Promise<boolean> {
  const [linha] = await banco
    .select({ id: identidades.id })
    .from(identidades)
    .where(and(eq(identidades.id, identidadeId), eq(identidades.tipo, "pessoal")));
  return Boolean(linha);
}

export async function buscarPerfilPorIdentidade(banco: Executor, identidadeId: string): Promise<PerfilRegistro | null> {
  const [perfil] = await banco.select().from(perfisProfissionais).where(eq(perfisProfissionais.identidadeId, identidadeId));
  return perfil ?? null;
}

// Trava a linha do perfil: operações que contam (limite de serviços/áreas) ficam serializadas.
export async function travarPerfilPorIdentidade(transacao: Transacao, identidadeId: string): Promise<PerfilRegistro | null> {
  const [perfil] = await transacao.select().from(perfisProfissionais).where(eq(perfisProfissionais.identidadeId, identidadeId)).for("update");
  return perfil ?? null;
}

export async function inserirPerfilSeAusente(banco: Executor, identidadeId: string): Promise<void> {
  await banco.insert(perfisProfissionais).values({ identidadeId }).onConflictDoNothing();
}

export async function atualizarPerfil(
  banco: Executor,
  perfilId: string,
  dados: Partial<Pick<PerfilRegistro, "ativo" | "ativadoEm" | "recebeOportunidadesOutrasRegioes" | "fusoHorario">>,
): Promise<void> {
  await banco.update(perfisProfissionais).set(dados).where(eq(perfisProfissionais.id, perfilId));
}

/* ---------- Base ---------- */

export interface DadosBase {
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string | null;
  bairro: string;
  cidade: string;
  uf: string;
  pontoReferencia: string | null;
  codigoIbge: string | null;
}

export async function buscarBase(banco: Executor, perfilId: string): Promise<BaseRegistro | null> {
  const [base] = await banco.select().from(basesProfissionais).where(eq(basesProfissionais.perfilId, perfilId));
  return base ?? null;
}

export async function gravarBase(banco: Executor, perfilId: string, dados: DadosBase, manterPonto: boolean): Promise<void> {
  const semPonto = manterPonto ? {} : { ponto: null, localizacaoConfirmadaEm: null };
  await banco
    .insert(basesProfissionais)
    .values({ perfilId, ...dados })
    // atualizadoEm explícito: é a VERSÃO do endereço que a confirmação do ponto confere.
    .onConflictDoUpdate({ target: basesProfissionais.perfilId, set: { ...dados, ...semPonto, atualizadoEm: new Date() } });
}

/**
 * Grava o ponto confirmado. Com `versaoEndereco`, só grava se a base AINDA estiver nessa versão
 * (update condicional: sem janela entre conferir e gravar).
 */
export async function confirmarPontoDaBase(banco: Executor, perfilId: string, ponto: PontoGeografico, versaoEndereco?: Date): Promise<boolean> {
  const atualizadas = await banco
    .update(basesProfissionais)
    .set({ ponto, localizacaoConfirmadaEm: new Date() })
    // Comparação em MILISSEGUNDOS: o banco guarda microssegundos, o JavaScript só enxerga milissegundos.
    .where(and(eq(basesProfissionais.perfilId, perfilId), versaoEndereco ? sql`date_trunc('milliseconds', ${basesProfissionais.atualizadoEm}) = ${versaoEndereco.toISOString()}::timestamptz` : undefined))
    .returning({ perfilId: basesProfissionais.perfilId });
  return atualizadas.length > 0;
}

/* ---------- Serviços do perfil ---------- */

export function contarServicosDoPerfil(banco: Executor, perfilId: string): Promise<number> {
  return banco
    .select({ total: count() })
    .from(servicosPerfil)
    .where(eq(servicosPerfil.perfilId, perfilId))
    .then(([linha]) => linha?.total ?? 0);
}

export async function buscarServicoDoPerfil(banco: Executor, perfilId: string, servicoPerfilId: string) {
  const [linha] = await banco
    .select({ id: servicosPerfil.id, servicoId: servicosPerfil.servicoId })
    .from(servicosPerfil)
    .where(and(eq(servicosPerfil.id, servicoPerfilId), eq(servicosPerfil.perfilId, perfilId)));
  return linha ?? null;
}

export async function perfilJaTemServico(banco: Executor, perfilId: string, servicoId: string): Promise<boolean> {
  const [linha] = await banco
    .select({ id: servicosPerfil.id })
    .from(servicosPerfil)
    .where(and(eq(servicosPerfil.perfilId, perfilId), eq(servicosPerfil.servicoId, servicoId)));
  return Boolean(linha);
}

// Quantas das especialidades pedidas são ATIVAS e deste serviço (todas precisam ser).
export async function contarEspecialidadesDoServico(banco: Executor, servicoId: string, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const [linha] = await banco
    .select({ total: count() })
    .from(especialidadesServico)
    .where(and(eq(especialidadesServico.servicoId, servicoId), eq(especialidadesServico.ativa, true), inArray(especialidadesServico.id, ids)));
  return linha?.total ?? 0;
}

// Opções pedidas que são ATIVAS, deste serviço e de atributo ativo — com o tipo de seleção do atributo.
export function opcoesDoServico(banco: Executor, servicoId: string, ids: string[]) {
  if (ids.length === 0) return Promise.resolve([]);
  return banco
    .select({ id: opcoesAtributo.id, atributoId: opcoesAtributo.atributoId, tipoSelecao: atributosServico.tipoSelecao })
    .from(opcoesAtributo)
    .innerJoin(atributosServico, eq(atributosServico.id, opcoesAtributo.atributoId))
    .where(
      and(
        eq(opcoesAtributo.servicoId, servicoId),
        eq(opcoesAtributo.ativa, true),
        eq(atributosServico.ativo, true),
        inArray(opcoesAtributo.id, ids),
      ),
    );
}

/** Atributos ATIVOS do serviço que exigem ao menos uma opção (com opção ativa para escolher). */
export function atributosObrigatoriosDoServico(banco: Executor, servicoId: string) {
  return banco
    .selectDistinct({ id: atributosServico.id, nome: atributosServico.nome })
    .from(atributosServico)
    .innerJoin(opcoesAtributo, and(eq(opcoesAtributo.atributoId, atributosServico.id), eq(opcoesAtributo.ativa, true)))
    .where(and(eq(atributosServico.servicoId, servicoId), eq(atributosServico.ativo, true), eq(atributosServico.obrigatorio, true)));
}

export async function inserirServicoDoPerfil(banco: Executor, perfilId: string, servicoId: string): Promise<string> {
  const [linha] = await banco.insert(servicosPerfil).values({ perfilId, servicoId }).returning({ id: servicosPerfil.id });
  if (!linha) throw new Error("Serviço do perfil não criado.");
  return linha.id;
}

// Substitui as escolhas (especialidades e opções) de um serviço do perfil.
export async function definirEscolhasDoServico(
  banco: Executor,
  servicoPerfil: { id: string; servicoId: string },
  especialidadeIds: string[],
  opcaoIds: string[],
): Promise<void> {
  await banco.delete(especialidadesServicoPerfil).where(eq(especialidadesServicoPerfil.servicoPerfilId, servicoPerfil.id));
  await banco.delete(opcoesServicoPerfil).where(eq(opcoesServicoPerfil.servicoPerfilId, servicoPerfil.id));
  if (especialidadeIds.length > 0) {
    await banco
      .insert(especialidadesServicoPerfil)
      .values(especialidadeIds.map((especialidadeId) => ({ servicoPerfilId: servicoPerfil.id, servicoId: servicoPerfil.servicoId, especialidadeId })));
  }
  if (opcaoIds.length > 0) {
    await banco
      .insert(opcoesServicoPerfil)
      .values(opcaoIds.map((opcaoId) => ({ servicoPerfilId: servicoPerfil.id, servicoId: servicoPerfil.servicoId, opcaoId })));
  }
}

export async function removerServicoDoPerfil(banco: Executor, perfilId: string, servicoPerfilId: string): Promise<boolean> {
  const removidos = await banco
    .delete(servicosPerfil)
    .where(and(eq(servicosPerfil.id, servicoPerfilId), eq(servicosPerfil.perfilId, perfilId)))
    .returning({ id: servicosPerfil.id });
  return removidos.length > 0;
}

export async function definirPermiteAgendamentoDoServico(banco: Executor, servicoPerfilId: string, permiteAgendamento: boolean): Promise<void> {
  await banco.update(servicosPerfil).set({ permiteAgendamento }).where(eq(servicosPerfil.id, servicoPerfilId));
}

/* ---------- Horários de atendimento ---------- */

// Substitui a grade INTEIRA do serviço. O trigger do banco recusa sobreposição mesmo que algo escape.
export async function substituirPeriodosDoServico(banco: Executor, servicoPerfilId: string, periodos: readonly PeriodoAtendimento[]): Promise<void> {
  await banco.delete(periodosAtendimento).where(eq(periodosAtendimento.servicoPerfilId, servicoPerfilId));
  if (periodos.length === 0) return;
  await banco
    .insert(periodosAtendimento)
    .values(periodos.map(({ diaSemana, inicio, fim }) => ({ servicoPerfilId, diaSemana, inicio, fim })));
}

// O banco devolve "08:00:00"; o contrato fala "08:00".
const horaCurta = (hora: string) => hora.slice(0, 5);

export async function listarPeriodosDosServicos(banco: Executor, servicoPerfilIds: string[]) {
  if (servicoPerfilIds.length === 0) return [];
  const linhas = await banco
    .select({
      servicoPerfilId: periodosAtendimento.servicoPerfilId,
      diaSemana: periodosAtendimento.diaSemana,
      inicio: periodosAtendimento.inicio,
      fim: periodosAtendimento.fim,
    })
    .from(periodosAtendimento)
    .where(inArray(periodosAtendimento.servicoPerfilId, servicoPerfilIds))
    .orderBy(asc(periodosAtendimento.diaSemana), asc(periodosAtendimento.inicio));
  return linhas.map((linha) => ({ ...linha, inicio: horaCurta(linha.inicio), fim: horaCurta(linha.fim) }));
}

export async function contarServicosDoPerfilEntre(banco: Executor, perfilId: string, servicoPerfilIds: string[]): Promise<number> {
  if (servicoPerfilIds.length === 0) return 0;
  const [linha] = await banco
    .select({ total: count() })
    .from(servicosPerfil)
    .where(and(eq(servicosPerfil.perfilId, perfilId), inArray(servicosPerfil.id, servicoPerfilIds)));
  return linha?.total ?? 0;
}

/** Leitura PRIVADA do dono: serviços com as escolhas de cada um (sem N+1). */
export async function listarServicosDoPerfilComEscolhas(banco: Executor, perfilId: string) {
  const servicos = await banco
    .select({
      id: servicosPerfil.id,
      servicoId: servicosPerfil.servicoId,
      servicoNome: servicosProfissionais.nome,
      permiteAgendamento: servicosPerfil.permiteAgendamento,
    })
    .from(servicosPerfil)
    .innerJoin(servicosProfissionais, eq(servicosProfissionais.id, servicosPerfil.servicoId))
    .where(eq(servicosPerfil.perfilId, perfilId))
    .orderBy(asc(servicosPerfil.id));
  const ids = servicos.map((servico) => servico.id);
  if (ids.length === 0) return [];
  const [especialidades, opcoes, periodos] = await Promise.all([
    banco
      .select({ servicoPerfilId: especialidadesServicoPerfil.servicoPerfilId, id: especialidadesServico.id, slug: especialidadesServico.slug })
      .from(especialidadesServicoPerfil)
      .innerJoin(especialidadesServico, eq(especialidadesServico.id, especialidadesServicoPerfil.especialidadeId))
      .where(inArray(especialidadesServicoPerfil.servicoPerfilId, ids)),
    banco
      .select({ servicoPerfilId: opcoesServicoPerfil.servicoPerfilId, id: opcoesAtributo.id, slug: opcoesAtributo.slug })
      .from(opcoesServicoPerfil)
      .innerJoin(opcoesAtributo, eq(opcoesAtributo.id, opcoesServicoPerfil.opcaoId))
      .where(inArray(opcoesServicoPerfil.servicoPerfilId, ids)),
    listarPeriodosDosServicos(banco, ids),
  ]);
  return servicos.map((servico) => ({
    ...servico,
    especialidades: especialidades.filter((linha) => linha.servicoPerfilId === servico.id).map(({ id, slug }) => ({ id, slug })),
    opcoes: opcoes.filter((linha) => linha.servicoPerfilId === servico.id).map(({ id, slug }) => ({ id, slug })),
    periodos: periodos.filter((linha) => linha.servicoPerfilId === servico.id).map(({ diaSemana, inicio, fim }) => ({ diaSemana, inicio, fim })),
  }));
}

/* ---------- Áreas ---------- */

export async function municipioAtivoExiste(banco: Executor, codigoIbge: string): Promise<boolean> {
  const [linha] = await banco
    .select({ codigo: municipios.codigoIbge })
    .from(municipios)
    .where(and(eq(municipios.codigoIbge, codigoIbge), eq(municipios.ativo, true)));
  return Boolean(linha);
}

// Validade da geometria decidida pelo PostGIS (mesmo critério do CHECK), antes de gravar.
export async function poligonosFormamAreaValida(banco: Executor, poligonos: PoligonoZona[]): Promise<boolean> {
  const resultado = await banco.execute<{ valida: boolean }>(
    sql`select ST_IsValid(g) and not ST_IsEmpty(g) as valida from (select ${multipoligonoDeVertices(poligonos)} as g) as area`,
  );
  return resultado.rows[0]?.valida === true;
}

export type DadosArea =
  | { modalidade: "raio"; raioMetros: number }
  | { modalidade: "poligono"; poligonos: PoligonoZona[] }
  | { modalidade: "municipio"; codigoIbge: string };

export async function inserirArea(
  banco: Executor,
  perfilId: string,
  dados: DadosArea & { nome: string | null; servicoPerfilIds: string[] },
): Promise<string> {
  const especificos = {
    raioMetros: dados.modalidade === "raio" ? dados.raioMetros : null,
    cobertura: dados.modalidade === "poligono" ? multipoligonoDeVertices(dados.poligonos) : null,
    codigoIbge: dados.modalidade === "municipio" ? dados.codigoIbge : null,
  };
  const [area] = await banco
    .insert(areasAtuacao)
    .values({
      perfilId,
      modalidade: dados.modalidade,
      nome: dados.nome,
      todosOsServicos: dados.servicoPerfilIds.length === 0,
      ...especificos,
    })
    .returning({ id: areasAtuacao.id });
  if (!area) throw new Error("Área não criada.");
  if (dados.servicoPerfilIds.length > 0) {
    await banco
      .insert(areasAtuacaoServicos)
      .values(dados.servicoPerfilIds.map((servicoPerfilId) => ({ areaId: area.id, perfilId, servicoPerfilId })));
  }
  return area.id;
}

export async function buscarAreaDoPerfil(banco: Executor, perfilId: string, areaId: string) {
  const [area] = await banco
    .select({ id: areasAtuacao.id, ativa: areasAtuacao.ativa, modalidade: areasAtuacao.modalidade })
    .from(areasAtuacao)
    .where(and(eq(areasAtuacao.id, areaId), eq(areasAtuacao.perfilId, perfilId)));
  return area ?? null;
}

export async function definirAtivaArea(banco: Executor, areaId: string, ativa: boolean): Promise<void> {
  await banco.update(areasAtuacao).set({ ativa }).where(eq(areasAtuacao.id, areaId));
}

export async function removerArea(banco: Executor, perfilId: string, areaId: string): Promise<boolean> {
  const removidas = await banco
    .delete(areasAtuacao)
    .where(and(eq(areasAtuacao.id, areaId), eq(areasAtuacao.perfilId, perfilId)))
    .returning({ id: areasAtuacao.id });
  return removidas.length > 0;
}

export function contarAreasAtivas(banco: Executor, perfilId: string): Promise<number> {
  return banco
    .select({ total: count() })
    .from(areasAtuacao)
    .where(and(eq(areasAtuacao.perfilId, perfilId), eq(areasAtuacao.ativa, true)))
    .then(([linha]) => linha?.total ?? 0);
}

export async function definirRaioArea(banco: Executor, areaId: string, raioMetros: number): Promise<void> {
  await banco.update(areasAtuacao).set({ raioMetros }).where(eq(areasAtuacao.id, areaId));
}

// Vazio = a área vale para todas as atividades do perfil; com ids = só para essas.
export async function substituirAtividadesDaArea(banco: Executor, perfilId: string, areaId: string, servicoPerfilIds: string[]): Promise<void> {
  await banco.delete(areasAtuacaoServicos).where(eq(areasAtuacaoServicos.areaId, areaId));
  await banco.update(areasAtuacao).set({ todosOsServicos: servicoPerfilIds.length === 0 }).where(eq(areasAtuacao.id, areaId));
  if (servicoPerfilIds.length > 0) {
    await banco.insert(areasAtuacaoServicos).values(servicoPerfilIds.map((servicoPerfilId) => ({ areaId, perfilId, servicoPerfilId })));
  }
}

/** Troca o desenho de uma área (a validade já foi conferida por `poligonosFormamAreaValida`). */
export async function definirPoligonosArea(banco: Executor, areaId: string, poligonos: PoligonoZona[]): Promise<void> {
  await banco.update(areasAtuacao).set({ cobertura: multipoligonoDeVertices(poligonos) }).where(eq(areasAtuacao.id, areaId));
}

/**
 * Leitura PRIVADA do dono: áreas com município (nome/UF), atividades vinculadas e, na área desenhada,
 * o desenho em vértices (para reabrir e editar no mapa). Nunca usar numa resposta pública.
 */
export async function listarAreasDoPerfil(banco: Executor, perfilId: string) {
  const areas = await banco
    .select({
      id: areasAtuacao.id,
      modalidade: areasAtuacao.modalidade,
      nome: areasAtuacao.nome,
      ativa: areasAtuacao.ativa,
      raioMetros: areasAtuacao.raioMetros,
      todosOsServicos: areasAtuacao.todosOsServicos,
      codigoIbge: municipios.codigoIbge,
      municipioNome: municipios.nome,
      municipioUf: municipios.uf,
      coberturaGeoJson: sql<string | null>`case when ${areasAtuacao.modalidade} = 'poligono' then ST_AsGeoJSON(${areasAtuacao.cobertura}) end`,
    })
    .from(areasAtuacao)
    .leftJoin(municipios, eq(municipios.codigoIbge, areasAtuacao.codigoIbge))
    .where(eq(areasAtuacao.perfilId, perfilId))
    .orderBy(asc(areasAtuacao.id));
  const vinculos =
    areas.length === 0
      ? []
      : await banco
          .select({ areaId: areasAtuacaoServicos.areaId, servicoPerfilId: areasAtuacaoServicos.servicoPerfilId })
          .from(areasAtuacaoServicos)
          .where(eq(areasAtuacaoServicos.perfilId, perfilId));
  return areas.map(({ coberturaGeoJson, ...area }) => ({
    ...area,
    poligonos: coberturaGeoJson ? verticesDeMultipoligonoGeoJson(coberturaGeoJson) : null,
    servicoPerfilIds: vinculos.filter((vinculo) => vinculo.areaId === area.id).map((vinculo) => vinculo.servicoPerfilId),
  }));
}

/**
 * CATÁLOGO LOCAL de municípios (nunca IBGE em runtime): quem começa com o termo primeiro, depois quem
 * o contém; sem acento e sem diferenciar maiúsculas.
 */
export async function buscarMunicipiosPorNome(banco: Executor, termo: string, limite = 10) {
  const resultado = await banco.execute<{ codigo_ibge: string; nome: string; uf: string }>(sql`
    with consulta as (select jaa_normalizar(${termo}) as n)
    select m.codigo_ibge, m.nome, m.uf
      from ${municipios} m cross join consulta c
     where m.ativo and strpos(jaa_normalizar(m.nome), c.n) > 0
     order by (strpos(jaa_normalizar(m.nome), c.n) = 1) desc, m.nome, m.uf
     limit ${Math.min(Math.max(limite, 1), 20)}`);
  return resultado.rows.map((linha) => ({ codigoIbge: linha.codigo_ibge, nome: linha.nome, uf: linha.uf }));
}
