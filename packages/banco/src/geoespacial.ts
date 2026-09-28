import { sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { customType } from "drizzle-orm/pg-core";

/*
 * FUNDAÇÃO GEOESPACIAL (PostGIS) para as próximas etapas do Motor Profissional.
 *
 * - PONTO → guardado como `geometry(point,4326)` e MEDIDO como `geography`: raio e distância em METROS
 *   sobre a Terra (ST_DWithin/ST_Distance em `ponto::geography`), com índice GiST NA EXPRESSÃO
 *   `(ponto::geography)` — ver `expressaoGeografica`. "Até 5 km" é distância geográfica, nunca
 *   distância de rota (isso é do Mapbox).
 *   Por que não uma coluna `geography`: o drizzle-kit só reconhece `geometry` como tipo nativo e põe
 *   `geography(...)` entre aspas, gerando DDL inválido. A conversão geometry→geography em 4326 é exata;
 * - ÁREA (polígono desenhado, município) → `geometry(multipolygon,4326)`: ST_Covers, em que a BORDA
 *   conta como dentro — a mesma semântica das zonas de entrega atuais. O ponto entra direto, sem cast.
 *
 * Toda coordenada entra por PARÂMETRO (nunca texto montado nem WKT vindo do cliente) e sempre na ordem
 * do PostGIS: longitude, latitude.
 *
 * PRIVACIDADE: estes tipos servem ao SQL do servidor. Coordenada lida daqui nunca é "pública" por
 * padrão — quem monta resposta de API decide o que expor (ex.: distância arredondada, cidade).
 */

export const SRID_WGS84 = 4326;

export interface PontoGeografico {
  latitude: number;
  longitude: number;
}

function validarPonto({ latitude, longitude }: PontoGeografico): void {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) throw new RangeError("Latitude fora do intervalo -90..90.");
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new RangeError("Longitude fora do intervalo -180..180.");
}

function geometriaDoPonto(ponto: PontoGeografico): SQL {
  validarPonto(ponto);
  return sql`ST_SetSRID(ST_MakePoint(${ponto.longitude}::double precision, ${ponto.latitude}::double precision), ${sql.raw(String(SRID_WGS84))})`;
}

/** Ponto como `geography` (distâncias em metros). */
export function pontoGeografico(ponto: PontoGeografico): SQL {
  return sql`${geometriaDoPonto(ponto)}::geography`;
}

/*
 * O driver devolve geography/geometry como EWKB em hexadecimal. Para PONTO a leitura é trivial e evita
 * uma dependência: ordem de bytes, tipo (com a flag de SRID), SRID opcional, X (longitude), Y (latitude).
 */
const FLAG_SRID = 0x20000000;
const TIPO_PONTO = 1;

export function lerPontoEwkb(hexadecimal: string): PontoGeografico {
  const bytes = Buffer.from(hexadecimal, "hex");
  const littleEndian = bytes.readUInt8(0) === 1;
  const lerU32 = (posicao: number) => (littleEndian ? bytes.readUInt32LE(posicao) : bytes.readUInt32BE(posicao));
  const lerF64 = (posicao: number) => (littleEndian ? bytes.readDoubleLE(posicao) : bytes.readDoubleBE(posicao));
  const tipo = lerU32(1);
  if ((tipo & 0xff) !== TIPO_PONTO) throw new Error("EWKB não é um ponto.");
  const inicio = tipo & FLAG_SRID ? 9 : 5;
  return { longitude: lerF64(inicio), latitude: lerF64(inicio + 8) };
}

/**
 * Coluna de PONTO `geometry(point,4326)`. Escreve por parâmetro; lê de volta como {latitude, longitude}.
 * Para raio/distância, indexe com `expressaoGeografica` (GiST) e consulte com `dentroDoRaio`.
 */
export const colunaPontoGeografico = customType<{ data: PontoGeografico; driverData: string }>({
  // Minúsculas: o drizzle-kit põe entre aspas (e invalida) tipo que não reconhece como nativo.
  dataType: () => `geometry(point,${SRID_WGS84})`,
  toDriver: (ponto) => geometriaDoPonto(ponto),
  fromDriver: (valor) => lerPontoEwkb(valor),
});

/**
 * `(ponto::geography)`: a expressão do índice GiST de raio — `index(...).using("gist", expressaoGeografica(t.ponto))`.
 * `dentroDoRaio` e `distanciaEmMetros` usam exatamente esta expressão, então o planejador casa as duas.
 */
export function expressaoGeografica(coluna: SQLWrapper): SQL {
  return sql`(${coluna}::geography)`;
}

/**
 * Coluna de ÁREA `geometry(multipolygon,4326)`. O valor lido é OPACO (EWKB em hexadecimal): áreas são
 * consultadas por funções espaciais no banco, e escritas com `multipoligonoDeVertices`.
 */
export const colunaMultipoligono = customType<{ data: string; driverData: string }>({
  dataType: () => `geometry(multipolygon,${SRID_WGS84})`,
});

/**
 * MultiPolygon a partir de polígonos em vértices {latitude, longitude}, SEM repetir o primeiro no fim
 * (fechamento implícito, mesmo formato das zonas de entrega). Vai como GeoJSON parametrizado.
 * A validade da geometria (ST_IsValid) é responsabilidade de quem grava — tipicamente um CHECK.
 */
export function multipoligonoDeVertices(poligonos: PontoGeografico[][]): SQL {
  if (poligonos.length === 0) throw new RangeError("Informe ao menos um polígono.");
  const coordenadas = poligonos.map((vertices) => {
    if (vertices.length < 3) throw new RangeError("Polígono precisa de ao menos 3 vértices.");
    vertices.forEach(validarPonto);
    const anel = vertices.map(({ latitude, longitude }) => [longitude, latitude]);
    return [[...anel, anel[0]]];
  });
  const geojson = JSON.stringify({ type: "MultiPolygon", coordinates: coordenadas });
  return sql`ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(${geojson}::text), ${sql.raw(String(SRID_WGS84))}))`;
}

/**
 * Caminho inverso de `multipoligonoDeVertices`: o GeoJSON de um MultiPolygon (`ST_AsGeoJSON`) de volta
 * para polígonos em vértices {latitude, longitude}, sem o ponto repetido do fechamento. Só o anel
 * externo — as áreas desenhadas no Jaa não têm furos. Entrada fora desse formato é erro (dado do
 * próprio banco, não do cliente).
 */
export function verticesDeMultipoligonoGeoJson(texto: string): PontoGeografico[][] {
  const geometria: unknown = JSON.parse(texto);
  if (typeof geometria !== "object" || geometria === null || !("type" in geometria) || !("coordinates" in geometria)) {
    throw new TypeError("GeoJSON inválido.");
  }
  if (geometria.type !== "MultiPolygon" || !Array.isArray(geometria.coordinates)) throw new TypeError("Esperado um MultiPolygon.");
  return geometria.coordinates.map((poligono: unknown) => {
    const anel: unknown = Array.isArray(poligono) ? poligono[0] : undefined;
    if (!Array.isArray(anel) || anel.length < 4) throw new TypeError("Anel inválido.");
    const vertices = anel.map((posicao: unknown) => {
      if (!Array.isArray(posicao) || typeof posicao[0] !== "number" || typeof posicao[1] !== "number") throw new TypeError("Posição inválida.");
      return { latitude: posicao[1], longitude: posicao[0] };
    });
    // O GeoJSON fecha o anel repetindo o primeiro ponto; o formato do Jaa não repete.
    return vertices.slice(0, -1);
  });
}

/**
 * Filtro de RAIO em metros sobre uma coluna de ponto. Usa o índice de `expressaoGeografica` quando
 * `metros` é o mesmo para todas as linhas (raio por linha exige um teto constante como pré-filtro).
 */
export function dentroDoRaio(coluna: SQLWrapper, ponto: PontoGeografico, metros: number): SQL {
  if (!Number.isFinite(metros) || metros < 0) throw new RangeError("Raio inválido.");
  return sql`ST_DWithin(${expressaoGeografica(coluna)}, ${pontoGeografico(ponto)}, ${metros}::double precision)`;
}

/** Distância geográfica em metros (não é distância de rota). */
export function distanciaEmMetros(coluna: SQLWrapper, ponto: PontoGeografico): SQL<number> {
  return sql<number>`ST_Distance(${expressaoGeografica(coluna)}, ${pontoGeografico(ponto)})`.mapWith(Number);
}

/** A área cobre o ponto? A BORDA conta como dentro (ST_Covers), como nas zonas de entrega. */
export function areaCobrePonto(coluna: SQLWrapper, ponto: PontoGeografico): SQL<boolean> {
  return sql<boolean>`ST_Covers(${coluna}, ${geometriaDoPonto(ponto)})`;
}
