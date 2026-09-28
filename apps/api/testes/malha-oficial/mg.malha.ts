import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { categoriasProfissionais, perfisProfissionais, servicosProfissionais, termosBuscaServico } from "@jaa/banco/schema";
import { importarMalhaOficial } from "@jaa/banco/territorio";
import type { Coordenadas } from "@jaa/contratos";
import { eq, inArray, like, sql } from "drizzle-orm";
import { criarAmbienteIntegracao, type Pessoa } from "../apoio/integracao.js";
import {
  adicionarAreaAtuacao,
  adicionarServicoAoPerfil,
  ativarPerfilProfissional,
  confirmarPontoBaseProfissional,
  obterOuCriarPerfilProfissional,
  salvarBaseProfissional,
} from "../../src/features/profissionais/casos-de-uso/gerir-perfil-profissional.js";
import { buscarProfissionaisCompativeis } from "../../src/features/profissionais/repositorios/repositorio-matching.js";
import { criarCategoriaProfissional, criarServicoProfissional } from "../../src/features/profissionais/repositorios/repositorio-taxonomia.js";

/*
 * MALHA MUNICIPAL OFICIAL DO IBGE — MG 2025, dados REAIS, no banco DESCARTÁVEL.
 *
 * Fora do `npm test` normal (precisa do ZIP oficial em cache — ou de rede para baixá-lo — e do Docker
 * para a conversão com GDAL). Rodar com `npm run test:malha-oficial -w @jaa/api`.
 */

const BELO_HORIZONTE = "3106200";
const CONTAGEM = "3118601";
const BETIM = "3106705";

// Referências conhecidas; o próprio teste confirma cada uma contra a malha oficial.
const PRACA_SETE: Coordenadas = { latitude: -19.9191, longitude: -43.9386 };
const CENTRO_CONTAGEM: Coordenadas = { latitude: -19.9317, longitude: -44.0539 };
const CENTRO_BETIM: Coordenadas = { latitude: -19.9678, longitude: -44.1983 };
const SAO_PAULO: Coordenadas = { latitude: -23.5505, longitude: -46.6333 };

const ctx = criarAmbienteIntegracao({ telefones: ["+5531987691001", "+5531987691002"], prefixoIp: "198.18.91." });
const banco = ctx.banco;
let atendeBh: Pessoa;
let atendeContagem: Pessoa;
let atividadeId = "";

const ponto = (coordenadas: Coordenadas) => sql`ST_SetSRID(ST_MakePoint(${coordenadas.longitude}::double precision, ${coordenadas.latitude}::double precision), 4326)`;

async function municipioDoPonto(coordenadas: Coordenadas): Promise<string[]> {
  const resultado = await banco.execute<{ codigo: string }>(
    sql`select codigo_ibge as codigo from malhas_municipio where vigente and ST_Covers(geometria, ${ponto(coordenadas)}) order by 1`,
  );
  return resultado.rows.map((linha) => linha.codigo);
}

async function prepararProfissional(pessoa: Pessoa, base: Coordenadas, codigoIbge: string) {
  assert.equal((await obterOuCriarPerfilProfissional(banco, pessoa.identidadeId)).tipo, "ok");
  assert.equal((await salvarBaseProfissional(banco, pessoa.identidadeId, { cep: "30000-000", logradouro: "Rua Teste", numero: "1", bairro: "Centro", cidade: "Teste", uf: "MG" })).tipo, "salva");
  assert.equal((await confirmarPontoBaseProfissional(banco, pessoa.identidadeId, base)).tipo, "confirmado");
  assert.equal((await adicionarServicoAoPerfil(banco, pessoa.identidadeId, { servicoId: atividadeId })).tipo, "adicionado");
  assert.equal((await adicionarAreaAtuacao(banco, pessoa.identidadeId, { modalidade: "municipio", codigoIbge })).tipo, "adicionada");
  assert.equal((await ativarPerfilProfissional(banco, pessoa.identidadeId)).tipo, "ativado");
}

before(async () => {
  await ctx.iniciar();
  const importacao = await importarMalhaOficial(banco, "MG", "2025");
  assert.equal(importacao.municipios, 853);

  // Atividade de TESTE (o catálogo real é do próximo bloco).
  const categoria = await criarCategoriaProfissional(banco, { slug: "teste-malha-categoria", nome: "Categoria de teste (malha)" });
  atividadeId = (await criarServicoProfissional(banco, { categoriaId: categoria.id, slug: "teste-malha-atividade", nome: "Atividade de teste malha" })).id;
  atendeBh = await ctx.criarPessoa(0, "malha_bh", "Atende BH");
  atendeContagem = await ctx.criarPessoa(1, "malha_contagem", "Atende Contagem");
  await prepararProfissional(atendeBh, PRACA_SETE, BELO_HORIZONTE);
  await prepararProfissional(atendeContagem, CENTRO_CONTAGEM, CONTAGEM);
});

after(async () => {
  await banco.delete(perfisProfissionais).where(inArray(perfisProfissionais.identidadeId, [atendeBh?.identidadeId, atendeContagem?.identidadeId].filter(Boolean) as string[]));
  await banco.delete(termosBuscaServico).where(eq(termosBuscaServico.servicoId, atividadeId));
  await banco.delete(servicosProfissionais).where(like(servicosProfissionais.slug, "teste-malha-%"));
  await banco.delete(categoriasProfissionais).where(like(categoriasProfissionais.slug, "teste-malha-%"));
  await ctx.encerrar();
});

describe("malha oficial de MG no PostGIS local", () => {
  it("853 municípios de MG; BH, Contagem e Betim com geometria vigente, válida, MultiPolygon e SRID 4326", async () => {
    const [total] = (await banco.execute<{ n: number }>(sql`select count(*)::int as n from municipios m join malhas_municipio g on g.codigo_ibge = m.codigo_ibge and g.vigente where m.uf = 'MG'`)).rows;
    assert.equal(total?.n, 853);
    const linhas = (
      await banco.execute<{ codigo: string; nome: string; versao: string; valida: boolean; tipo: string; srid: number }>(sql`
        select m.codigo_ibge as codigo, m.nome, g.versao, ST_IsValid(g.geometria) as valida, GeometryType(g.geometria) as tipo, ST_SRID(g.geometria) as srid
          from municipios m join malhas_municipio g on g.codigo_ibge = m.codigo_ibge and g.vigente
         where m.codigo_ibge in (${BELO_HORIZONTE}, ${CONTAGEM}, ${BETIM}) order by m.codigo_ibge`)
    ).rows;
    assert.deepEqual(linhas, [
      { codigo: BELO_HORIZONTE, nome: "Belo Horizonte", versao: "2025", valida: true, tipo: "MULTIPOLYGON", srid: 4326 },
      { codigo: BETIM, nome: "Betim", versao: "2025", valida: true, tipo: "MULTIPOLYGON", srid: 4326 },
      { codigo: CONTAGEM, nome: "Contagem", versao: "2025", valida: true, tipo: "MULTIPOLYGON", srid: 4326 },
    ]);
  });

  it("pontos de referência caem no município certo — e em nenhum outro", async () => {
    assert.deepEqual(await municipioDoPonto(PRACA_SETE), [BELO_HORIZONTE]);
    assert.deepEqual(await municipioDoPonto(CENTRO_CONTAGEM), [CONTAGEM]);
    assert.deepEqual(await municipioDoPonto(CENTRO_BETIM), [BETIM]);
    assert.deepEqual(await municipioDoPonto(SAO_PAULO), []);
  });

  it("ponto interno derivado da própria geometria (ST_PointOnSurface) de cada um só é coberto pelo seu município", async () => {
    for (const codigo of [BELO_HORIZONTE, CONTAGEM, BETIM]) {
      const [interno] = (
        await banco.execute<{ latitude: number; longitude: number }>(sql`
          select ST_Y(p) as latitude, ST_X(p) as longitude from (select ST_PointOnSurface(geometria) as p from malhas_municipio where codigo_ibge = ${codigo} and vigente) as t`)
      ).rows;
      assert.ok(interno);
      assert.deepEqual(await municipioDoPonto(interno), [codigo]);
    }
  });

  it("DIVISA BH × Contagem: dois pontos a ~16 m, um de cada lado, que o retângulo envolvente não separaria", async () => {
    const [divisa] = (
      await banco.execute<{ comprimento: number }>(sql`
        select ST_Length(ST_LineMerge(ST_CollectionExtract(ST_Intersection(ST_Boundary(bh.geometria), ST_Boundary(ct.geometria)), 2))::geography) as comprimento
          from malhas_municipio bh, malhas_municipio ct
         where bh.codigo_ibge = ${BELO_HORIZONTE} and bh.vigente and ct.codigo_ibge = ${CONTAGEM} and ct.vigente`)
    ).rows;
    assert.ok((divisa?.comprimento ?? 0) > 1000, "BH e Contagem compartilham divisa na malha oficial");

    let separados: { ladoA: Coordenadas; ladoB: Coordenadas } | null = null;
    for (const fracao of [0.5, 0.3, 0.7, 0.4, 0.6]) {
      const [trecho] = (
        await banco.execute<{ px: number; py: number; ax: number; ay: number; bx: number; by: number }>(sql`
          with linha as (
            select (ST_Dump(ST_LineMerge(ST_CollectionExtract(ST_Intersection(ST_Boundary(bh.geometria), ST_Boundary(ct.geometria)), 2)))).geom as l
              from malhas_municipio bh, malhas_municipio ct
             where bh.codigo_ibge = ${BELO_HORIZONTE} and bh.vigente and ct.codigo_ibge = ${CONTAGEM} and ct.vigente
          ), maior as (select l from linha order by ST_Length(l) desc limit 1)
          select ST_X(ST_LineInterpolatePoint(l, ${fracao}::float8)) as px, ST_Y(ST_LineInterpolatePoint(l, ${fracao}::float8)) as py,
                 ST_X(ST_LineInterpolatePoint(l, ${fracao - 0.0005}::float8)) as ax, ST_Y(ST_LineInterpolatePoint(l, ${fracao - 0.0005}::float8)) as ay,
                 ST_X(ST_LineInterpolatePoint(l, ${fracao + 0.0005}::float8)) as bx, ST_Y(ST_LineInterpolatePoint(l, ${fracao + 0.0005}::float8)) as by
            from maior`)
      ).rows;
      if (!trecho) continue;
      // Perpendicular à divisa naquele trecho, deslocando ~16 m (0,00015°) para cada lado.
      const tx = trecho.bx - trecho.ax;
      const ty = trecho.by - trecho.ay;
      const norma = Math.hypot(tx, ty) || 1;
      const deslocamento = 0.00015;
      const ladoA = { longitude: trecho.px - (ty / norma) * deslocamento, latitude: trecho.py + (tx / norma) * deslocamento };
      const ladoB = { longitude: trecho.px + (ty / norma) * deslocamento, latitude: trecho.py - (tx / norma) * deslocamento };
      const [a, b] = [await municipioDoPonto(ladoA), await municipioDoPonto(ladoB)];
      if (a.length === 1 && b.length === 1 && a[0] !== b[0] && [a[0], b[0]].sort().join() === [BELO_HORIZONTE, CONTAGEM].sort().join()) {
        separados = { ladoA, ladoB };
        break;
      }
    }
    assert.ok(separados, "a malha separa os dois lados da divisa");

    // Os dois pontos estão DENTRO dos retângulos envolventes de BH e de Contagem: bounding box não decidiria.
    for (const lado of [separados.ladoA, separados.ladoB]) {
      const [envelopes] = (
        await banco.execute<{ bh: boolean; ct: boolean }>(sql`
          select bool_or(codigo_ibge = ${BELO_HORIZONTE} and ST_Envelope(geometria) && ${ponto(lado)}) as bh,
                 bool_or(codigo_ibge = ${CONTAGEM} and ST_Envelope(geometria) && ${ponto(lado)}) as ct
            from malhas_municipio where vigente and codigo_ibge in (${BELO_HORIZONTE}, ${CONTAGEM})`)
      ).rows;
      assert.deepEqual(envelopes, { bh: true, ct: true });
    }
  });
});

describe("matching do Motor Profissional por município (malha real)", () => {
  const encontrados = async (coordenadas: Coordenadas, codigoIbgeDoPonto?: string) =>
    (await buscarProfissionaisCompativeis(banco, { servicoId: atividadeId, ponto: coordenadas, codigoIbgeDoPonto })).map((item) => item.identidadeId);

  it("área = Belo Horizonte: ponto em BH é compatível; ponto em Contagem não", async () => {
    assert.deepEqual(await encontrados(PRACA_SETE), [atendeBh.identidadeId]);
    assert.equal((await encontrados(CENTRO_CONTAGEM)).includes(atendeBh.identidadeId), false);
  });

  it("área = Contagem: ponto em Contagem é compatível; Betim não entra em nenhuma", async () => {
    assert.deepEqual(await encontrados(CENTRO_CONTAGEM), [atendeContagem.identidadeId]);
    assert.deepEqual(await encontrados(CENTRO_BETIM), []);
  });

  it("com malha carregada, código IBGE informado NÃO contradiz a coordenada; sem malha (SP), vale como alternativa", async () => {
    assert.deepEqual(await encontrados(CENTRO_CONTAGEM, BELO_HORIZONTE), [atendeContagem.identidadeId]);
    assert.deepEqual(await encontrados(SAO_PAULO, BELO_HORIZONTE), [atendeBh.identidadeId]);
  });
});
