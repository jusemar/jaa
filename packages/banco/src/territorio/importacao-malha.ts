import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, mkdtemp, open, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { promisify } from "node:util";
import { sql } from "drizzle-orm";
import type { Banco } from "../conexao.js";

/*
 * IMPORTAÇÃO DA MALHA MUNICIPAL OFICIAL DO IBGE (ferramenta ADMINISTRATIVA — a API não usa isto).
 *
 * 1. baixa o ZIP oficial da Malha Municipal Digital (geoftp.ibge.gov.br) para um CACHE fora do repositório;
 * 2. converte com GDAL (imagem oficial OSGeo, container descartável): shapefile SIRGAS 2000 → GeoJSON
 *    por linha em EPSG:4326, sempre MultiPolygon, só com código, nome e UF;
 * 3. grava em `municipios` + `malhas_municipio` numa transação única e IDEMPOTENTE: rodar de novo
 *    atualiza as mesmas linhas; outra edição vira nova versão vigente e a anterior fica como histórico.
 *
 * Depois disso "este ponto está em qual município?" é PostGIS local — nenhum serviço externo em runtime.
 */

export const IMAGEM_GDAL = "ghcr.io/osgeo/gdal:ubuntu-small-3.12.0";
const RAIZ_IBGE = "https://geoftp.ibge.gov.br/organizacao_do_territorio/malhas_territoriais/malhas_municipais";
const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];
// Campos do dataset oficial (conferidos no arquivo 2025): geocódigo, nome e sigla da UF.
const CAMPOS = ["CD_MUN", "NM_MUN", "SIGLA_UF"] as const;

export interface FonteMalhaMunicipal {
  uf: string;
  edicao: string;
  url: string;
  arquivo: string;
  camada: string;
}

export function fonteOficialMalhaMunicipal(uf: string, edicao: string): FonteMalhaMunicipal {
  const sigla = uf.trim().toUpperCase();
  if (!UFS.includes(sigla)) throw new RangeError(`UF inválida: ${uf}`);
  if (!/^\d{4}$/.test(edicao)) throw new RangeError(`Edição inválida: ${edicao}`);
  const camada = `${sigla}_Municipios_${edicao}`;
  return { uf: sigla, edicao, camada, arquivo: `${camada}.zip`, url: `${RAIZ_IBGE}/municipio_${edicao}/UFs/${sigla}/${camada}.zip` };
}

// Cache fora do repositório (nada grande entra no Git): JAA_CACHE_DIR > XDG_CACHE_HOME/jaa > ~/.cache/jaa.
export function diretorioCache(): string {
  return process.env.JAA_CACHE_DIR ?? join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "jaa");
}

async function sha256(caminho: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const pedaco of createReadStream(caminho)) hash.update(pedaco as Buffer);
  return hash.digest("hex");
}

export interface ArquivoOficial {
  caminho: string;
  sha256: string;
  bytes: number;
  baixadoAgora: boolean;
}

/** ZIP oficial no cache; baixa só se ainda não existir (download atômico: .parcial → nome final). */
export async function garantirArquivoOficial(fonte: FonteMalhaMunicipal): Promise<ArquivoOficial> {
  const pasta = join(diretorioCache(), "ibge", `municipio_${fonte.edicao}`, fonte.uf);
  const caminho = join(pasta, fonte.arquivo);
  let baixadoAgora = false;
  if (!existsSync(caminho)) {
    await mkdir(pasta, { recursive: true });
    const resposta = await fetch(fonte.url);
    if (!resposta.ok) throw new Error(`IBGE respondeu ${resposta.status} para ${fonte.url}`);
    const parcial = `${caminho}.parcial`;
    await writeFile(parcial, Buffer.from(await resposta.arrayBuffer()));
    await rename(parcial, caminho);
    baixadoAgora = true;
  }
  // Um ZIP começa com "PK": página de erro HTML salva por engano não passa daqui.
  const arquivo = await open(caminho, "r");
  const cabecalho = Buffer.alloc(2);
  await arquivo.read(cabecalho, 0, 2, 0);
  await arquivo.close();
  if (cabecalho.toString("latin1") !== "PK") throw new Error(`${caminho} não é um ZIP válido; apague-o e rode de novo.`);
  return { caminho, sha256: await sha256(caminho), bytes: (await stat(caminho)).size, baixadoAgora };
}

const executar = promisify(execFile);

/**
 * Converte com GDAL num container descartável (--rm). Resultado em cache, chaveado pelo SHA-256 do ZIP:
 * mesma fonte → mesma conversão, sem refazer. Coordenadas com 8 casas (~1 mm), sem simplificação.
 */
export async function converterParaGeoJsonSeq(fonte: FonteMalhaMunicipal, arquivo: ArquivoOficial): Promise<string> {
  const pastaCache = join(diretorioCache(), "ibge", `municipio_${fonte.edicao}`, fonte.uf);
  const destino = join(pastaCache, `${fonte.camada}.${arquivo.sha256.slice(0, 12)}.4326.geojsonl`);
  if (existsSync(destino)) return destino;

  const temporaria = await mkdtemp(join(tmpdir(), "jaa-malha-"));
  try {
    const usuario = typeof process.getuid === "function" && typeof process.getgid === "function" ? ["--user", `${process.getuid()}:${process.getgid()}`] : [];
    await executar(
      "docker",
      [
        "run", "--rm", ...usuario,
        "-v", `${arquivo.caminho}:/entrada/${fonte.arquivo}:ro`,
        "-v", `${temporaria}:/saida`,
        IMAGEM_GDAL,
        "ogr2ogr", "-f", "GeoJSONSeq", `/saida/${fonte.camada}.geojsonl`,
        `/vsizip//entrada/${fonte.arquivo}`, fonte.camada,
        "-t_srs", "EPSG:4326",
        "-nlt", "PROMOTE_TO_MULTI",
        "-select", CAMPOS.join(","),
        "-lco", "COORDINATE_PRECISION=8",
      ],
      { maxBuffer: 16 * 1024 * 1024 },
    );
    await rename(join(temporaria, `${fonte.camada}.geojsonl`), destino);
    return destino;
  } finally {
    await rm(temporaria, { recursive: true, force: true });
  }
}

export interface ResultadoImportacao {
  municipios: number;
  geometriasCorrigidas: number;
  versoesAnterioresDesativadas: number;
}

interface LinhaMunicipio {
  codigo: string;
  nome: string;
  uf: string;
  geometria: string;
}

function lerFeicao(linha: string): LinhaMunicipio {
  const feicao = JSON.parse(linha) as { properties?: Record<string, unknown>; geometry?: unknown };
  const propriedades = feicao.properties ?? {};
  const codigo = String(propriedades.CD_MUN ?? "");
  const nome = String(propriedades.NM_MUN ?? "").trim();
  const uf = String(propriedades.SIGLA_UF ?? "");
  if (!/^\d{7}$/.test(codigo) || !nome || !feicao.geometry) throw new Error(`Feição inválida no arquivo: ${linha.slice(0, 120)}`);
  return { codigo, nome, uf, geometria: JSON.stringify(feicao.geometry) };
}

const TAMANHO_LOTE = 25;

/**
 * Grava a malha de UMA UF/edição numa transação única (tudo ou nada). Idempotente:
 * - `municipios`: upsert por código (nome/UF atualizados, reativado);
 * - `malhas_municipio`: upsert por (código, edição) e esta edição passa a ser a vigente — as demais
 *   edições do mesmo município ficam guardadas, não vigentes.
 * Geometria inválida é corrigida com ST_MakeValid, preservando só as partes de área (nunca bounding box).
 */
export async function importarMalhaMunicipal(
  banco: Banco,
  arquivoGeoJsonSeq: string,
  { uf, edicao, fonte }: { uf: string; edicao: string; fonte: string },
): Promise<ResultadoImportacao> {
  const linhas: LinhaMunicipio[] = [];
  const leitor = createInterface({ input: createReadStream(arquivoGeoJsonSeq, "utf8"), crlfDelay: Infinity });
  // GeoJSONSeq pode iniciar cada linha com o separador RS (0x1E).
  for await (const bruta of leitor) {
    const linha = bruta.replace(/^\u001e/, "").trim();
    if (linha) linhas.push(lerFeicao(linha));
  }
  if (linhas.length === 0) throw new Error("Arquivo sem municípios.");
  const outraUf = linhas.find((linha) => linha.uf !== uf);
  if (outraUf) throw new Error(`Município ${outraUf.codigo} é de ${outraUf.uf}, não de ${uf}.`);
  if (new Set(linhas.map((linha) => linha.codigo)).size !== linhas.length) throw new Error("Código IBGE repetido no arquivo.");

  return banco.transaction(async (transacao) => {
    await transacao.execute(sql`create temp table malha_importacao (codigo text primary key, nome text not null, uf text not null, geometria_bruta geometry not null) on commit drop`);
    for (let inicio = 0; inicio < linhas.length; inicio += TAMANHO_LOTE) {
      const lote = linhas.slice(inicio, inicio + TAMANHO_LOTE);
      await transacao.execute(
        sql`insert into malha_importacao (codigo, nome, uf, geometria_bruta) values ${sql.join(
          lote.map((linha) => sql`(${linha.codigo}, ${linha.nome}, ${linha.uf}, ST_SetSRID(ST_GeomFromGeoJSON(${linha.geometria}::text), 4326))`),
          sql`, `,
        )}`,
      );
    }

    const [{ corrigidas = 0 } = {}] = (
      await transacao.execute<{ corrigidas: number }>(sql`select count(*)::int as corrigidas from malha_importacao where not ST_IsValid(geometria_bruta)`)
    ).rows;

    await transacao.execute(sql`
      insert into municipios (codigo_ibge, nome, uf, ativo)
      select codigo, nome, uf, true from malha_importacao
      on conflict (codigo_ibge) do update set nome = excluded.nome, uf = excluded.uf, ativo = true, atualizado_em = now()`);

    // Libera o posto de "vigente" das outras edições ANTES de gravar esta (índice único parcial).
    const desativadas = await transacao.execute(sql`
      update malhas_municipio set vigente = false
       where vigente and versao <> ${edicao} and codigo_ibge in (select codigo from malha_importacao)`);

    await transacao.execute(sql`
      insert into malhas_municipio (codigo_ibge, versao, geometria, fonte, vigente, importado_em)
      select codigo, ${edicao},
             ST_Multi(case when ST_IsValid(geometria_bruta) then geometria_bruta
                           else ST_CollectionExtract(ST_MakeValid(geometria_bruta), 3) end),
             ${fonte}, true, now()
        from malha_importacao
      on conflict (codigo_ibge, versao) do update
        set geometria = excluded.geometria, fonte = excluded.fonte, vigente = true, importado_em = now()`);

    return { municipios: linhas.length, geometriasCorrigidas: corrigidas, versoesAnterioresDesativadas: desativadas.rowCount ?? 0 };
  });
}

/** Fluxo completo usado pelo comando e pelo teste real: arquivo oficial → conversão → importação. */
export async function importarMalhaOficial(banco: Banco, uf: string, edicao: string) {
  const fonte = fonteOficialMalhaMunicipal(uf, edicao);
  const arquivo = await garantirArquivoOficial(fonte);
  const convertido = await converterParaGeoJsonSeq(fonte, arquivo);
  const resultado = await importarMalhaMunicipal(banco, convertido, {
    uf: fonte.uf,
    edicao: fonte.edicao,
    fonte: `IBGE Malha Municipal Digital ${fonte.edicao} — ${fonte.url} (sha256 ${arquivo.sha256})`,
  });
  return { fonte, arquivo, ...resultado };
}
