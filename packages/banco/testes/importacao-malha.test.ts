import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { inArray, sql } from "drizzle-orm";
import { exigirBancoDeTeste } from "../src/banco-de-teste.js";
import { criarConexaoBanco } from "../src/conexao.js";
import { municipios } from "../src/schema.js";
import { fonteOficialMalhaMunicipal, importarMalhaMunicipal } from "../src/territorio/importacao-malha.js";

/*
 * Lógica do importador da malha, SEM rede e SEM GDAL: um arquivo GeoJSONSeq sintético (municípios
 * FICTÍCIOS 00000xx, geometrias de teste) no mesmo formato que a conversão produz.
 */
const { banco, encerrar } = criarConexaoBanco(exigirBancoDeTeste());
const CODIGOS = ["0000011", "0000012", "0000013"];
let pasta: string;

const quadrado = (x: number, y: number, lado: number) => [
  [x, y],
  [x + lado, y],
  [x + lado, y + lado],
  [x, y + lado],
  [x, y],
];

function feicao(codigo: string, nome: string, uf: string, geometry: unknown) {
  return `\u001e${JSON.stringify({ type: "Feature", properties: { CD_MUN: codigo, NM_MUN: nome, SIGLA_UF: uf }, geometry })}`;
}

async function arquivo(nome: string, linhas: string[]) {
  const caminho = join(pasta, nome);
  await writeFile(caminho, `${linhas.join("\n")}\n`);
  return caminho;
}

const linhasBase = (sufixo = "") => [
  // Polygon simples: vira MultiPolygon.
  feicao("0000011", `Fictício Um${sufixo}`, "MG", { type: "Polygon", coordinates: [quadrado(-44, -20, 0.1)] }),
  // MultiPolygon com duas partes (ilha): nenhuma parte pode se perder.
  feicao("0000012", `Fictício Dois${sufixo}`, "MG", {
    type: "MultiPolygon",
    coordinates: [[quadrado(-43, -20, 0.1)], [quadrado(-42.5, -20, 0.05)]],
  }),
  // Laço (inválido): corrigido com ST_MakeValid, sem virar bounding box.
  feicao("0000013", `Fictício Três${sufixo}`, "MG", {
    type: "Polygon",
    coordinates: [[[-41, -20], [-40.9, -19.9], [-40.9, -20], [-41, -19.9], [-41, -20]]],
  }),
];

before(async () => {
  pasta = await mkdtemp(join(tmpdir(), "jaa-malha-teste-"));
});

after(async () => {
  await banco.delete(municipios).where(inArray(municipios.codigoIbge, CODIGOS));
  await rm(pasta, { recursive: true, force: true });
  await encerrar();
});

async function estado() {
  return (
    await banco.execute<{ codigo: string; nome: string; versao: string; vigente: boolean; tipo: string; srid: number; valida: boolean; partes: number }>(sql`
      select m.codigo_ibge as codigo, m.nome, g.versao, g.vigente, GeometryType(g.geometria) as tipo, ST_SRID(g.geometria) as srid,
             ST_IsValid(g.geometria) as valida, ST_NumGeometries(g.geometria) as partes
        from municipios m join malhas_municipio g on g.codigo_ibge = m.codigo_ibge
       where m.codigo_ibge in (${sql.join(CODIGOS.map((codigo) => sql`${codigo}`), sql`, `)})
       order by m.codigo_ibge, g.versao`)
  ).rows;
}

describe("fonte oficial", () => {
  it("monta a URL oficial do IBGE por UF e edição", () => {
    const fonte = fonteOficialMalhaMunicipal("mg", "2025");
    assert.equal(
      fonte.url,
      "https://geoftp.ibge.gov.br/organizacao_do_territorio/malhas_territoriais/malhas_municipais/municipio_2025/UFs/MG/MG_Municipios_2025.zip",
    );
    assert.equal(fonte.camada, "MG_Municipios_2025");
    assert.throws(() => fonteOficialMalhaMunicipal("XX", "2025"), RangeError);
    assert.throws(() => fonteOficialMalhaMunicipal("MG", "25"), RangeError);
  });
});

describe("importação", () => {
  it("normaliza para MultiPolygon 4326 válido sem perder partes e corrige geometria inválida", async () => {
    const resultado = await importarMalhaMunicipal(banco, await arquivo("a.geojsonl", linhasBase()), { uf: "MG", edicao: "2025", fonte: "teste" });
    assert.deepEqual(resultado, { municipios: 3, geometriasCorrigidas: 1, versoesAnterioresDesativadas: 0 });
    const linhas = await estado();
    assert.equal(linhas.length, 3);
    for (const linha of linhas) assert.deepEqual([linha.tipo, linha.srid, linha.valida, linha.vigente], ["MULTIPOLYGON", 4326, true, true]);
    assert.equal(linhas.find((linha) => linha.codigo === "0000012")?.partes, 2);
    // O laço corrigido tem duas partes triangulares — não é o retângulo envolvente.
    const [area] = (await banco.execute<{ razao: number }>(sql`select ST_Area(geometria) / ST_Area(ST_Envelope(geometria)) as razao from malhas_municipio where codigo_ibge = '0000013'`)).rows;
    assert.ok((area?.razao ?? 1) < 0.75);
  });

  it("é idempotente: importar de novo não duplica nada", async () => {
    await importarMalhaMunicipal(banco, await arquivo("b.geojsonl", linhasBase()), { uf: "MG", edicao: "2025", fonte: "teste" });
    const linhas = await estado();
    assert.equal(linhas.length, 3);
    assert.equal((await banco.select().from(municipios).where(inArray(municipios.codigoIbge, CODIGOS))).length, 3);
  });

  it("nova edição vira a vigente; a anterior fica guardada; nomes são atualizados", async () => {
    const resultado = await importarMalhaMunicipal(banco, await arquivo("c.geojsonl", linhasBase(" (2026)")), { uf: "MG", edicao: "2026", fonte: "teste" });
    assert.equal(resultado.versoesAnterioresDesativadas, 3);
    const linhas = await estado();
    assert.equal(linhas.length, 6);
    assert.deepEqual(
      linhas.filter((linha) => linha.vigente).map((linha) => linha.versao),
      ["2026", "2026", "2026"],
    );
    assert.equal(linhas[0]?.nome, "Fictício Um (2026)");
  });

  it("arquivo com município de outra UF é recusado sem gravar nada", async () => {
    const errado = [...linhasBase(" X"), feicao("0000014", "De Outra UF", "SP", { type: "Polygon", coordinates: [quadrado(-46, -23, 0.1)] })];
    await assert.rejects(importarMalhaMunicipal(banco, await arquivo("d.geojsonl", errado), { uf: "MG", edicao: "2027", fonte: "teste" }), /SP/);
    assert.equal((await estado()).length, 6);
  });
});
