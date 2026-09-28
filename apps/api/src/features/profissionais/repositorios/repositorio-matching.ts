import type { Banco } from "@jaa/banco";
import { pontoGeografico, type PontoGeografico } from "@jaa/banco/geoespacial";
import {
  areasAtuacao,
  areasAtuacaoServicos,
  basesProfissionais,
  especialidadesServico,
  especialidadesServicoPerfil,
  identidades,
  malhasMunicipio,
  opcoesServicoPerfil,
  perfisProfissionais,
  periodosAtendimento,
  servicosPerfil,
  servicosProfissionais,
} from "@jaa/banco/schema";
import {
  LIMITES_PERFIL_PROFISSIONAL,
  diaSemanaSchema,
  distanciaPublicaMetros,
  horaSchema,
  type DiaSemana,
  type ProfissionalEncontrado,
} from "@jaa/contratos";
import { eq, inArray, sql, type SQL } from "drizzle-orm";

/*
 * MATCHING GEOGRÁFICO DETERMINÍSTICO: "quem oferece este serviço (com estas especialidades/opções) e
 * atende este ponto?". Uma consulta só, filtrada no PostgreSQL/PostGIS — nada de carregar profissionais
 * para o Node e medir um a um.
 *
 * A cobertura é a UNIÃO de três caminhos, cada um com o SEU índice:
 * - raio: bases perto do ponto (GiST em `ponto::geography`, com o raio máximo da versão como pré-filtro
 *   constante) e então o raio exato de cada área;
 * - polígono: `ST_Covers` na GiST parcial das áreas desenhadas (borda conta como dentro);
 * - município: o município do ponto pela MALHA OFICIAL vigente (GiST, PostGIS local — nada de IBGE,
 *   ViaCEP ou Mapbox em runtime) contra o índice de `codigo_ibge` das áreas. Com malha carregada, a
 *   GEOMETRIA é a autoridade: um código informado pelo chamador só vale quando nenhuma malha cobre o
 *   ponto (UF ainda não importada) — nunca para contradizer a coordenada.
 * Só entram perfis ATIVOS, serviços de catálogo ativos e áreas ativas; área restrita só vale para os
 * serviços ligados a ela.
 *
 * HORÁRIO é regra independente da geografia: cada SERVIÇO do perfil tem a sua grade semanal. Um
 * INSTANTE é convertido para dia/hora LOCAIS pelo fuso do perfil (nunca comparado em UTC); um horário
 * SEMANAL ("terça às 15:00") já é local. Início ≤ hora < fim.
 *
 * O resultado INTERNO traz a distância exata; o PÚBLICO passa por `paraResultadosPublicos`.
 */

export interface ConsultaMatching {
  servicoId: string;
  ponto: PontoGeografico;
  // Todas exigidas (E): "eletricista QUE instala chuveiro".
  especialidadeIds?: string[] | undefined;
  opcaoIds?: string[] | undefined;
  // Horário de referência. Sem ele, horário não entra na consulta (atendeNoHorario = null).
  horario?: HorarioConsulta | undefined;
  // true = só quem atende nesse horário; ausente/false = todos, informando atendeNoHorario.
  somenteNoHorario?: boolean | undefined;
  // Distância máxima da BASE do profissional ("mototáxi em até 3 km").
  raioBuscaMetros?: number | undefined;
  // Código IBGE do ponto conhecido pelo chamador (ex.: CEP). Só é usado se NENHUMA malha cobrir o ponto.
  codigoIbgeDoPonto?: string | null | undefined;
  excluirIdentidadeId?: string | undefined;
  limite?: number | undefined;
  // Paginação da busca (ordem estável: distância e id). O chamador limita quantas páginas existem.
  deslocamento?: number | undefined;
}

// "Agora" = { instante: new Date() }; "terça às 15:00" = { diaSemana: 2, hora: "15:00" }.
export type HorarioConsulta = { instante: Date } | { diaSemana: DiaSemana; hora: string };

export interface ProfissionalCompativel {
  perfilId: string;
  identidadeId: string;
  nomeExibicao: string;
  nomeUsuario: string;
  servicoPerfilId: string;
  servicoId: string;
  servicoNome: string;
  cidade: string;
  uf: string;
  // Coberto por área de RAIO (a base é a referência): só então a distância é confiável para exibir.
  cobertoPorRaio: boolean;
  // Distância EXATA da base ao ponto — dado interno, nunca público.
  distanciaBaseMetros: number | null;
  // Dentro da grade DESTE serviço no horário consultado; null = nenhum horário consultado.
  atendeNoHorario: boolean | null;
}

const LIMITE_PADRAO = 20;
const LIMITE_MAXIMO = 50;

const lista = (ids: string[]) => sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `);

// Expressão booleana "o serviço sp atende no horário", avaliada no fuso do perfil p.
function atendeNoHorarioSql(horario: HorarioConsulta): SQL {
  if ("instante" in horario) {
    if (Number.isNaN(horario.instante.getTime())) throw new RangeError("Instante inválido.");
    const local = sql`(${horario.instante.toISOString()}::timestamptz at time zone p.fuso_horario)`;
    return sql`exists (select 1 from ${periodosAtendimento} pa
      where pa.servico_perfil_id = sp.id
        and pa.dia_semana = extract(isodow from ${local})::int
        and pa.inicio <= ${local}::time and ${local}::time < pa.fim)`;
  }
  const diaSemana = diaSemanaSchema.parse(horario.diaSemana);
  const hora = horaSchema.parse(horario.hora);
  return sql`exists (select 1 from ${periodosAtendimento} pa
    where pa.servico_perfil_id = sp.id
      and pa.dia_semana = ${diaSemana}
      and pa.inicio <= ${hora}::time and ${hora}::time < pa.fim)`;
}

export async function buscarProfissionaisCompativeis(banco: Banco, consulta: ConsultaMatching): Promise<ProfissionalCompativel[]> {
  const ponto = pontoGeografico(consulta.ponto);
  const geometriaPonto = sql`(${ponto})::geometry`;
  const especialidades = consulta.especialidadeIds ?? [];
  const opcoes = consulta.opcaoIds ?? [];
  const limite = Math.min(Math.max(consulta.limite ?? LIMITE_PADRAO, 1), LIMITE_MAXIMO);
  const deslocamento = Math.max(Math.trunc(consulta.deslocamento ?? 0), 0);
  const codigoInformado = consulta.codigoIbgeDoPonto ?? null;

  const filtros: SQL[] = [];
  if (especialidades.length > 0) {
    filtros.push(
      sql`(select count(*) from ${especialidadesServicoPerfil} e where e.servico_perfil_id = sp.id and e.especialidade_id in (${lista(especialidades)})) = ${especialidades.length}`,
    );
  }
  if (opcoes.length > 0) {
    filtros.push(sql`(select count(*) from ${opcoesServicoPerfil} o where o.servico_perfil_id = sp.id and o.opcao_id in (${lista(opcoes)})) = ${opcoes.length}`);
  }
  const atende = consulta.horario ? atendeNoHorarioSql(consulta.horario) : null;
  if (atende && consulta.somenteNoHorario) filtros.push(atende);
  if (consulta.raioBuscaMetros !== undefined) {
    filtros.push(sql`ST_DWithin((b.ponto)::geography, ${ponto}, ${consulta.raioBuscaMetros}::double precision)`);
  }
  if (consulta.excluirIdentidadeId) filtros.push(sql`p.identidade_id <> ${consulta.excluirIdentidadeId}::uuid`);
  const filtrosExtras = filtros.length > 0 ? sql` and ${sql.join(filtros, sql` and `)}` : sql``;

  const resultado = await banco.execute<{
    perfil_id: string;
    identidade_id: string;
    nome_exibicao: string;
    nome_usuario: string;
    servico_perfil_id: string;
    servico_id: string;
    servico_nome: string;
    cidade: string;
    uf: string;
    coberto_por_raio: boolean;
    distancia_base_metros: number | null;
    atende_no_horario: boolean | null;
  }>(sql`
    with municipio_pela_malha as (
      select m.codigo_ibge from ${malhasMunicipio} m
       where m.vigente and ST_Covers(m.geometria, ${geometriaPonto})
    ),
    municipio_do_ponto as (
      select codigo_ibge from municipio_pela_malha
      union all
      select ${codigoInformado}::text
       where ${codigoInformado}::text is not null and not exists (select 1 from municipio_pela_malha)
    ),
    cobertura as (
      select a.id as area_id, a.perfil_id, a.todos_os_servicos, true as por_raio
        from ${basesProfissionais} bp
        join ${areasAtuacao} a on a.perfil_id = bp.perfil_id and a.modalidade = 'raio' and a.ativa
       where bp.ponto is not null
         and ST_DWithin((bp.ponto)::geography, ${ponto}, ${LIMITES_PERFIL_PROFISSIONAL.raioMaximoMetros}::double precision)
         and ST_DWithin((bp.ponto)::geography, ${ponto}, a.raio_metros::double precision)
      union all
      select a.id, a.perfil_id, a.todos_os_servicos, false
        from ${areasAtuacao} a
       where a.modalidade = 'poligono' and a.ativa and ST_Covers(a.cobertura, ${geometriaPonto})
      union all
      select a.id, a.perfil_id, a.todos_os_servicos, false
        from ${areasAtuacao} a
       where a.modalidade = 'municipio' and a.ativa and a.codigo_ibge in (select codigo_ibge from municipio_do_ponto)
    )
    select p.id as perfil_id, p.identidade_id, i.nome_exibicao, i.nome_usuario,
           sp.id as servico_perfil_id, s.id as servico_id, s.nome as servico_nome,
           b.cidade, b.uf,
           bool_or(c.por_raio) as coberto_por_raio,
           ST_Distance((b.ponto)::geography, ${ponto}) as distancia_base_metros,
           ${atende ?? sql`null::boolean`} as atende_no_horario
      from cobertura c
      join ${perfisProfissionais} p on p.id = c.perfil_id and p.ativo
      join ${identidades} i on i.id = p.identidade_id
      join ${servicosPerfil} sp on sp.perfil_id = p.id and sp.servico_id = ${consulta.servicoId}::uuid
      join ${servicosProfissionais} s on s.id = sp.servico_id and s.ativo
      join ${basesProfissionais} b on b.perfil_id = p.id
     where (c.todos_os_servicos or exists (
             select 1 from ${areasAtuacaoServicos} l where l.area_id = c.area_id and l.servico_perfil_id = sp.id))
           ${filtrosExtras}
     group by p.id, i.id, sp.id, s.id, b.perfil_id
     order by distancia_base_metros asc nulls last, p.id
     limit ${limite} offset ${deslocamento}`);

  return resultado.rows.map((linha) => ({
    perfilId: linha.perfil_id,
    identidadeId: linha.identidade_id,
    nomeExibicao: linha.nome_exibicao,
    nomeUsuario: linha.nome_usuario,
    servicoPerfilId: linha.servico_perfil_id,
    servicoId: linha.servico_id,
    servicoNome: linha.servico_nome,
    cidade: linha.cidade,
    uf: linha.uf,
    cobertoPorRaio: linha.coberto_por_raio,
    distanciaBaseMetros: linha.distancia_base_metros === null ? null : Number(linha.distancia_base_metros),
    atendeNoHorario: linha.atende_no_horario,
  }));
}

/**
 * Converte o resultado interno no que TERCEIROS podem ver: sem base, endereço, coordenada nem
 * geometria; distância só quando a cobertura veio de raio (referência confiável) e sempre
 * arredondada. Sem distância confiável → null ("Atende sua região").
 */
export async function paraResultadosPublicos(banco: Banco, compativeis: ProfissionalCompativel[]): Promise<ProfissionalEncontrado[]> {
  const ids = compativeis.map((item) => item.servicoPerfilId);
  const especialidades =
    ids.length === 0
      ? []
      : await banco
          .select({ servicoPerfilId: especialidadesServicoPerfil.servicoPerfilId, id: especialidadesServico.id, nome: especialidadesServico.nome })
          .from(especialidadesServicoPerfil)
          .innerJoin(especialidadesServico, eq(especialidadesServico.id, especialidadesServicoPerfil.especialidadeId))
          .where(inArray(especialidadesServicoPerfil.servicoPerfilId, ids));

  return compativeis.map((item) => ({
    identidadeId: item.identidadeId,
    nomeExibicao: item.nomeExibicao,
    nomeUsuario: item.nomeUsuario,
    servico: { id: item.servicoId, nome: item.servicoNome },
    especialidades: especialidades.filter((linha) => linha.servicoPerfilId === item.servicoPerfilId).map(({ id, nome }) => ({ id, nome })),
    regiao: { cidade: item.cidade, uf: item.uf },
    distanciaAproximadaMetros: item.cobertoPorRaio && item.distanciaBaseMetros !== null ? distanciaPublicaMetros(item.distanciaBaseMetros) : null,
    atendeNoHorario: item.atendeNoHorario,
  }));
}
