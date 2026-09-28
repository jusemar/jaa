import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { asc, sql, type SQL } from "drizzle-orm";
import { index, pgTable, serial, text } from "drizzle-orm/pg-core";
import { exigirBancoDeTeste } from "../src/banco-de-teste.js";
import { criarConexaoBanco } from "../src/conexao.js";
import {
  areaCobrePonto,
  colunaMultipoligono,
  colunaPontoGeografico,
  dentroDoRaio,
  distanciaEmMetros,
  expressaoGeografica,
  multipoligonoDeVertices,
  type PontoGeografico,
  verticesDeMultipoligonoGeoJson,
} from "../src/geoespacial.js";

/*
 * Prova da FUNDAÇÃO (Bloco 1): PostGIS, pg_trgm, unaccent, jaa_normalizar e a integração com o Drizzle.
 * Tabelas `infra_teste_*` existem só aqui — nada de Perfil Profissional. Roda EXCLUSIVAMENTE no banco
 * descartável criado por scripts/com-banco-teste.ts (`npm test -w @jaa/banco`).
 */
const { banco, encerrar } = criarConexaoBanco(exigirBancoDeTeste());

const locais = pgTable(
  "infra_teste_locais",
  { id: serial().primaryKey(), nome: text().notNull(), ponto: colunaPontoGeografico().notNull() },
  (tabela) => [index("infra_teste_locais_ponto_gist").using("gist", expressaoGeografica(tabela.ponto))],
);

const areas = pgTable(
  "infra_teste_areas",
  { id: serial().primaryKey(), nome: text().notNull(), cobertura: colunaMultipoligono().notNull() },
  (tabela) => [index("infra_teste_areas_cobertura_gist").using("gist", tabela.cobertura)],
);

// Praça Sete (BH) e dois pontos ao norte: ~3 km (dentro de 5 km) e ~8 km (fora).
const PRACA_SETE: PontoGeografico = { latitude: -19.9191, longitude: -43.9386 };
const TRES_KM: PontoGeografico = { latitude: -19.8921, longitude: -43.9386 };
const OITO_KM: PontoGeografico = { latitude: -19.8471, longitude: -43.9386 };

// Quadrado de ±0,01° em volta da Praça Sete.
const QUADRADO: PontoGeografico[] = [
  { latitude: -19.9291, longitude: -43.9486 },
  { latitude: -19.9291, longitude: -43.9286 },
  { latitude: -19.9091, longitude: -43.9286 },
  { latitude: -19.9091, longitude: -43.9486 },
];

async function linhas<T>(consulta: SQL): Promise<T[]> {
  return (await banco.execute(consulta)).rows as T[];
}

async function planoUsaIndice(consulta: SQL, indice: string): Promise<boolean> {
  // Em tabela pequena o planejador prefere varredura sequencial; desligá-la prova que o índice SERVE.
  return banco.transaction(async (transacao) => {
    await transacao.execute(sql`set local enable_seqscan = off`);
    const plano = await transacao.execute(sql`explain (format json) ${consulta}`);
    return JSON.stringify(plano.rows).includes(indice);
  });
}

before(async () => {
  const vazio = generateDrizzleJson({}, undefined, undefined, "snake_case");
  const atual = generateDrizzleJson({ locais, areas }, vazio.id, undefined, "snake_case");
  const ddl = await generateMigration(vazio, atual);
  const tudo = ddl.join("\n");
  assert.match(tudo, /"ponto" geometry\(point,4326\)/);
  assert.match(tudo, /::geography/);
  assert.match(tudo, /"cobertura" geometry\(multipolygon,4326\)/);
  assert.match(tudo, /USING gist/);
  for (const instrucao of ddl) await banco.execute(sql.raw(instrucao));
});

after(async () => {
  await banco.execute(sql`drop table if exists infra_teste_locais, infra_teste_areas, infra_teste_termos`);
  await encerrar();
});

describe("ambiente", () => {
  test("PostgreSQL 18 + PostGIS 3.6 e SOMENTE as extensões declaradas em migration", async () => {
    const [versao] = await linhas<{ numero: string }>(sql`select current_setting('server_version_num') as numero`);
    assert.ok(Number(versao?.numero) >= 180000);

    const [postgis] = await linhas<{ versao: string }>(sql`select postgis_lib_version() as versao`);
    assert.match(postgis?.versao ?? "", /^3\.6\./);

    // Paridade com produção: nada instalado "de brinde" pela imagem (topology, tiger, fuzzystrmatch).
    const extensoes = await linhas<{ extname: string }>(sql`select extname from pg_extension order by extname`);
    assert.deepEqual(
      extensoes.map((linha) => linha.extname),
      ["pg_trgm", "plpgsql", "postgis", "unaccent"],
    );
  });
});

describe("raio (ponto geometry medido como geography)", () => {
  before(async () => {
    await banco.insert(locais).values([
      { nome: "praca-sete", ponto: PRACA_SETE },
      { nome: "tres-km", ponto: TRES_KM },
      { nome: "oito-km", ponto: OITO_KM },
    ]);
  });

  test("ST_DWithin de 5 km devolve quem está dentro e deixa de fora quem está a 8 km", async () => {
    const dentro = await banco
      .select({ nome: locais.nome })
      .from(locais)
      .where(dentroDoRaio(locais.ponto, PRACA_SETE, 5000))
      .orderBy(asc(locais.nome));
    assert.deepEqual(dentro.map((linha) => linha.nome), ["praca-sete", "tres-km"]);
  });

  test("ST_Distance devolve metros geográficos", async () => {
    const distancias = await banco
      .select({ nome: locais.nome, metros: distanciaEmMetros(locais.ponto, PRACA_SETE) })
      .from(locais)
      .orderBy(asc(locais.nome));
    const porNome = new Map(distancias.map((linha) => [linha.nome, linha.metros]));
    assert.equal(porNome.get("praca-sete"), 0);
    const tresKm = porNome.get("tres-km") ?? 0;
    assert.ok(tresKm > 2950 && tresKm < 3050, `esperado ~3 km, veio ${tresKm}`);
    assert.ok((porNome.get("oito-km") ?? 0) > 7900);
  });

  test("o ponto gravado volta igual pelo Drizzle", async () => {
    const [linha] = await banco.select({ ponto: locais.ponto }).from(locais).where(sql`${locais.nome} = 'tres-km'`);
    assert.ok(linha);
    assert.ok(Math.abs(linha.ponto.latitude - TRES_KM.latitude) < 1e-9);
    assert.ok(Math.abs(linha.ponto.longitude - TRES_KM.longitude) < 1e-9);
  });

  test("coordenada inválida é recusada antes de chegar ao banco", () => {
    assert.throws(() => dentroDoRaio(locais.ponto, { latitude: 91, longitude: 0 }, 10), RangeError);
    assert.throws(() => dentroDoRaio(locais.ponto, PRACA_SETE, -1), RangeError);
  });

  test("índice GiST atende a consulta por raio", async () => {
    await banco.execute(sql`
      insert into infra_teste_locais (nome, ponto)
      select 'massa-' || i, ST_SetSRID(ST_MakePoint(-44 + random() * 0.5, -20 + random() * 0.5), 4326)
      from generate_series(1, 2000) as i`);
    await banco.execute(sql`analyze infra_teste_locais`);
    const consulta = sql`select id from ${locais} where ${dentroDoRaio(locais.ponto, PRACA_SETE, 5000)}`;
    assert.ok(await planoUsaIndice(consulta, "infra_teste_locais_ponto_gist"));
  });
});

describe("área (geometry MultiPolygon)", () => {
  before(async () => {
    await banco.insert(areas).values({ nome: "quadrado", cobertura: multipoligonoDeVertices([QUADRADO]) });
  });

  async function cobre(ponto: PontoGeografico): Promise<boolean> {
    const [linha] = await banco.select({ cobre: areaCobrePonto(areas.cobertura, ponto) }).from(areas).where(sql`${areas.nome} = 'quadrado'`);
    return linha?.cobre === true;
  }

  test("geometria válida, MultiPolygon e SRID 4326", async () => {
    const [linha] = await linhas<{ valida: boolean; tipo: string; srid: number }>(
      sql`select ST_IsValid(cobertura) as valida, GeometryType(cobertura) as tipo, ST_SRID(cobertura) as srid from infra_teste_areas where nome = 'quadrado'`,
    );
    assert.deepEqual(linha, { valida: true, tipo: "MULTIPOLYGON", srid: 4326 });
  });

  test("ida e volta: vértices → MultiPolygon → ST_AsGeoJSON → os MESMOS vértices (sem o ponto de fechamento)", async () => {
    const [linha] = await linhas<{ geojson: string }>(sql`select ST_AsGeoJSON(cobertura) as geojson from infra_teste_areas where nome = 'quadrado'`);
    assert.deepEqual(verticesDeMultipoligonoGeoJson(linha?.geojson ?? ""), [QUADRADO]);
    assert.throws(() => verticesDeMultipoligonoGeoJson(JSON.stringify({ type: "Polygon", coordinates: [] })));
  });

  test("ST_Covers: dentro cobre, fora não cobre", async () => {
    assert.equal(await cobre(PRACA_SETE), true);
    assert.equal(await cobre(TRES_KM), false);
  });

  test("BORDA e vértice contam como dentro (mesma semântica das zonas de entrega)", async () => {
    const naBorda: PontoGeografico = { latitude: -19.9091, longitude: -43.9386 };
    assert.equal(await cobre(naBorda), true);
    assert.equal(await cobre({ latitude: -19.9291, longitude: -43.9486 }), true);

    // Registro da escolha: ST_Contains trataria a borda como fora.
    const [contem] = await linhas<{ contem: boolean }>(
      sql`select ST_Contains(cobertura, ST_SetSRID(ST_MakePoint(-43.9386, -19.9091), 4326)) as contem from infra_teste_areas where nome = 'quadrado'`,
    );
    assert.equal(contem?.contem, false);
  });

  test("polígono que se cruza (laço) é detectado como inválido", async () => {
    const laco: PontoGeografico[] = [
      { latitude: 0, longitude: 0 },
      { latitude: 1, longitude: 1 },
      { latitude: 0, longitude: 1 },
      { latitude: 1, longitude: 0 },
    ];
    const [linha] = await linhas<{ valida: boolean; motivo: string }>(
      sql`select ST_IsValid(g) as valida, ST_IsValidReason(g) as motivo from (select ${multipoligonoDeVertices([laco])} as g) as t`,
    );
    assert.equal(linha?.valida, false);
    assert.match(linha?.motivo ?? "", /Self-intersection/i);
  });

  test("índice GiST atende a consulta de cobertura", async () => {
    await banco.execute(sql`
      insert into infra_teste_areas (nome, cobertura)
      select 'massa-' || i, ST_Multi(ST_Expand(ST_SetSRID(ST_MakePoint(-44 + random() * 0.5, -20 + random() * 0.5), 4326), 0.005))
      from generate_series(1, 2000) as i`);
    await banco.execute(sql`analyze infra_teste_areas`);
    const consulta = sql`select id from ${areas} where ${areaCobrePonto(areas.cobertura, PRACA_SETE)}`;
    assert.ok(await planoUsaIndice(consulta, "infra_teste_areas_cobertura_gist"));
  });
});

describe("busca textual (unaccent + pg_trgm + jaa_normalizar)", () => {
  test("unaccent remove acentos e cedilha", async () => {
    const [linha] = await linhas<{ texto: string }>(sql`select unaccent('Mototáxi Açaí Pôr ÉRRE') as texto`);
    assert.equal(linha?.texto, "Mototaxi Acai Por ERRE");
  });

  test("jaa_normalizar: minúsculas, sem acento, espaços colapsados, IMMUTABLE e STRICT", async () => {
    const [linha] = await linhas<{ a: string; b: string; c: string; nulo: string | null; volatilidade: string }>(sql`
      select jaa_normalizar('Mototáxi') as a,
             jaa_normalizar('  MOTO   Táxi  ') as b,
             jaa_normalizar('Instalação de Chuveiro') as c,
             jaa_normalizar(null) as nulo,
             (select provolatile from pg_proc where proname = 'jaa_normalizar') as volatilidade`);
    assert.deepEqual(linha, { a: "mototaxi", b: "moto taxi", c: "instalacao de chuveiro", nulo: null, volatilidade: "i" });
  });

  test("índice GIN de trigramas sobre o texto normalizado acha variações e usa o índice", async () => {
    await banco.execute(sql`create table infra_teste_termos (id serial primary key, termo text not null)`);
    // Só é possível criar este índice porque jaa_normalizar é IMMUTABLE.
    await banco.execute(sql`create index infra_teste_termos_trgm on infra_teste_termos using gin (jaa_normalizar(termo) gin_trgm_ops)`);
    await banco.execute(sql`
      insert into infra_teste_termos (termo)
      values ('Mototáxi'), ('Mototaxista'), ('Moto táxi'), ('Eletricista'), ('Cabeleireiro'), ('Manicure')`);

    const achados = await linhas<{ termo: string }>(sql`
      select termo from infra_teste_termos
      where jaa_normalizar(termo) % jaa_normalizar('mototaxi')
      order by similarity(jaa_normalizar(termo), jaa_normalizar('mototaxi')) desc, termo`);
    const termos = achados.map((linha) => linha.termo);
    assert.equal(termos[0], "Mototáxi");
    assert.ok(termos.includes("Mototaxista"));
    assert.ok(!termos.includes("Eletricista"));

    const [semAcento] = await linhas<{ termo: string }>(sql`select termo from infra_teste_termos where jaa_normalizar(termo) = jaa_normalizar('ELETRICISTA')`);
    assert.equal(semAcento?.termo, "Eletricista");

    const consulta = sql`select id from infra_teste_termos where jaa_normalizar(termo) like '%taxi%'`;
    assert.ok(await planoUsaIndice(consulta, "infra_teste_termos_trgm"));
  });
});
