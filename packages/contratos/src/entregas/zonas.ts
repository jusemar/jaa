import * as z from "zod";
import { coordenadasSchema, latitudeSchema, longitudeSchema, type Coordenadas } from "../enderecos/endereco.ts";
import { pedidoDaEmpresaSchema } from "../pedidos/gestao-pedidos.ts";

/*
 * ZONAS DE ENTREGA e AUTOMAÇÃO DO DESPACHO.
 *
 * Uma zona é um POLÍGONO desenhado pela empresa no mapa — nada de bairro, CEP ou raio. O cliente
 * nunca escolhe zona: o servidor classifica o pedido pelo PONTO SNAPSHOT do destino (o que o cliente
 * confirmou no momento do pedido), então mudar o endereço salvo depois não reclassifica nada.
 *
 * Zona não é promessa de rota: nesta fase ela serve para AGRUPAR pedidos próximos numa mesma saída.
 */

export const MINIMO_VERTICES_ZONA = 3;
export const MAXIMO_VERTICES_ZONA = 60;
export const NOME_ZONA_TAMANHO_MAXIMO = 60;

export const verticeZonaSchema = z.object({ latitude: latitudeSchema, longitude: longitudeSchema });

/**
 * Polígono da zona: lista de vértices em ordem, SEM repetir o primeiro no fim (o fechamento é
 * implícito). O servidor canoniza o que o desenho mandar antes de validar e gravar.
 */
export const poligonoZonaSchema = z.array(verticeZonaSchema).min(MINIMO_VERTICES_ZONA, "Marque ao menos 3 pontos no mapa.").max(MAXIMO_VERTICES_ZONA);

export type PoligonoZona = z.infer<typeof poligonoZonaSchema>;

export const salvarZonaEntradaSchema = z.object({
  nome: z.string().trim().min(1, "Dê um nome à zona.").max(NOME_ZONA_TAMANHO_MAXIMO),
  vertices: poligonoZonaSchema,
  ativa: z.boolean().default(true),
});

export type SalvarZonaEntrada = z.input<typeof salvarZonaEntradaSchema>;

// Compatibilidade é decisão EXPLÍCITA do gestor; o servidor normaliza para valer nos dois sentidos.
export const definirCompatibilidadesEntradaSchema = z.object({ zonaIds: z.array(z.uuid()).max(50) });

export type DefinirCompatibilidadesEntrada = z.infer<typeof definirCompatibilidadesEntradaSchema>;

export const zonaEntregaSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  vertices: poligonoZonaSchema,
  ativa: z.boolean(),
  // Zonas que a EMPRESA autorizou a combinar com esta quando houver pouco volume (simétrico).
  compativeisCom: z.array(z.uuid()),
  criadoEm: z.iso.datetime(),
  atualizadoEm: z.iso.datetime(),
});

export type ZonaEntrega = z.infer<typeof zonaEntregaSchema>;

export const listaZonasSchema = z.object({ zonas: z.array(zonaEntregaSchema) });

export type ListaZonas = z.infer<typeof listaZonasSchema>;

/* CONFIGURAÇÃO DE DESPACHO (por empresa; nada de 5 e 15 hardcoded como regra universal). */

export const MAXIMO_PEDIDOS_POR_SAIDA_PADRAO = 5;
export const MAXIMO_PEDIDOS_POR_SAIDA_MINIMO = 1;
export const MAXIMO_PEDIDOS_POR_SAIDA_MAXIMO = 15;
export const TEMPO_FORMACAO_PADRAO_MINUTOS = 15;
export const TEMPO_FORMACAO_MINIMO_MINUTOS = 1;
export const TEMPO_FORMACAO_MAXIMO_MINUTOS = 180;

export const configuracaoDespachoSchema = z.object({
  maxPedidosPorSaida: z.number().int().min(MAXIMO_PEDIDOS_POR_SAIDA_MINIMO).max(MAXIMO_PEDIDOS_POR_SAIDA_MAXIMO),
  tempoFormacaoMinutos: z.number().int().min(TEMPO_FORMACAO_MINIMO_MINUTOS).max(TEMPO_FORMACAO_MAXIMO_MINUTOS),
  combinarZonas: z.boolean(),
  liberacaoAutomatica: z.boolean(),
});

export type ConfiguracaoDespacho = z.infer<typeof configuracaoDespachoSchema>;

export const salvarConfiguracaoDespachoEntradaSchema = configuracaoDespachoSchema.partial();

export type SalvarConfiguracaoDespachoEntrada = z.infer<typeof salvarConfiguracaoDespachoEntradaSchema>;

export const CONFIGURACAO_DESPACHO_PADRAO: ConfiguracaoDespacho = {
  maxPedidosPorSaida: MAXIMO_PEDIDOS_POR_SAIDA_PADRAO,
  tempoFormacaoMinutos: TEMPO_FORMACAO_PADRAO_MINUTOS,
  combinarZonas: true,
  liberacaoAutomatica: true,
};

/**
 * Painel de logística da empresa: a configuração, as zonas e os pedidos que a automação NÃO pode
 * tratar — pedidos prontos cujo ponto não está em nenhuma zona ativa. Eles nunca entram numa zona em
 * silêncio: ficam visíveis como pendência para o gestor resolver à mão.
 */
export const painelDespachoSchema = z.object({
  configuracao: configuracaoDespachoSchema,
  zonas: z.array(zonaEntregaSchema),
  pedidosForaDeZona: z.array(pedidoDaEmpresaSchema),
  // false quando a empresa ainda não tem zona ativa: a automação fica inteira desligada.
  automacaoAtiva: z.boolean(),
});

export type PainelDespacho = z.infer<typeof painelDespachoSchema>;

/* ---------- Geometria pura (mesma regra no servidor e na interface) ---------- */

type Ponto = Coordenadas;

// Trabalhamos em graus mesmo: as zonas são urbanas e a decisão é "dentro ou fora", não distância.
const x = (ponto: Ponto) => ponto.longitude;
const y = (ponto: Ponto) => ponto.latitude;

function orientacao(a: Ponto, b: Ponto, c: Ponto): number {
  return (x(b) - x(a)) * (y(c) - y(a)) - (y(b) - y(a)) * (x(c) - x(a));
}

function noSegmento(a: Ponto, b: Ponto, ponto: Ponto): boolean {
  if (Math.abs(orientacao(a, b, ponto)) > 1e-12) return false;
  return (
    x(ponto) >= Math.min(x(a), x(b)) - 1e-12 &&
    x(ponto) <= Math.max(x(a), x(b)) + 1e-12 &&
    y(ponto) >= Math.min(y(a), y(b)) - 1e-12 &&
    y(ponto) <= Math.max(y(a), y(b)) + 1e-12
  );
}

function arestas(vertices: PoligonoZona): Array<[Ponto, Ponto]> {
  return vertices.map((vertice, indice) => [vertice, vertices[(indice + 1) % vertices.length] as Ponto] as [Ponto, Ponto]);
}

/**
 * Ponto dentro do polígono (ray casting). BORDA CONTA COMO DENTRO e é verificada primeiro: assim a
 * classificação é determinística e não depende de arredondamento — um ponto exatamente na divisa
 * pertence à zona, sempre do mesmo jeito.
 */
export function pontoDentroDaZona(vertices: PoligonoZona, ponto: Ponto): boolean {
  if (vertices.length < MINIMO_VERTICES_ZONA) return false;
  for (const [a, b] of arestas(vertices)) if (noSegmento(a, b, ponto)) return true;

  let dentro = false;
  for (const [a, b] of arestas(vertices)) {
    // Regra semiaberta em y: cada aresta conta uma vez só, mesmo quando o raio passa num vértice.
    const cruza = y(a) > y(ponto) !== y(b) > y(ponto);
    if (!cruza) continue;
    const limite = ((x(b) - x(a)) * (y(ponto) - y(a))) / (y(b) - y(a)) + x(a);
    if (x(ponto) < limite) dentro = !dentro;
  }
  return dentro;
}

// Cruzamento PRÓPRIO: encostar na ponta ou compartilhar divisa não conta (zonas vizinhas são normais).
function segmentosSeCruzam(a1: Ponto, a2: Ponto, b1: Ponto, b2: Ponto): boolean {
  const d1 = orientacao(b1, b2, a1);
  const d2 = orientacao(b1, b2, a2);
  const d3 = orientacao(a1, a2, b1);
  const d4 = orientacao(a1, a2, b2);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/**
 * Polígono minimamente válido: sem vértices repetidos em sequência, sem área nula e sem arestas que
 * se cruzam (um "laço" tornaria "dentro da zona" ambíguo).
 */
export function zonaTemGeometriaValida(vertices: PoligonoZona): boolean {
  if (vertices.length < MINIMO_VERTICES_ZONA) return false;
  const lados = arestas(vertices);
  for (const [a, b] of lados) if (x(a) === x(b) && y(a) === y(b)) return false;
  if (Math.abs(areaAssinada(vertices)) < 1e-14) return false;

  for (const [indiceA, ladoA] of lados.entries()) {
    for (const [indiceB, ladoB] of lados.entries()) {
      // Arestas vizinhas (e a mesma) sempre se tocam pelas pontas: só cruzamento próprio invalida.
      if (indiceB <= indiceA) continue;
      const vizinhas = indiceB === indiceA + 1 || (indiceA === 0 && indiceB === lados.length - 1);
      if (vizinhas) continue;
      if (segmentosSeCruzam(ladoA[0], ladoA[1], ladoB[0], ladoB[1])) return false;
    }
  }
  return true;
}

function areaAssinada(vertices: PoligonoZona): number {
  let soma = 0;
  for (const [a, b] of arestas(vertices)) soma += x(a) * y(b) - x(b) * y(a);
  return soma / 2;
}

// Centro de massa do polígono: um ponto do INTERIOR usado para detectar área comum.
function centroide(vertices: PoligonoZona): Ponto {
  const area = areaAssinada(vertices);
  if (Math.abs(area) < 1e-14) {
    return {
      latitude: vertices.reduce((soma, vertice) => soma + y(vertice), 0) / vertices.length,
      longitude: vertices.reduce((soma, vertice) => soma + x(vertice), 0) / vertices.length,
    };
  }
  let somaX = 0;
  let somaY = 0;
  for (const [a, b] of arestas(vertices)) {
    const cruzado = x(a) * y(b) - x(b) * y(a);
    somaX += (x(a) + x(b)) * cruzado;
    somaY += (y(a) + y(b)) * cruzado;
  }
  return { latitude: somaY / (6 * area), longitude: somaX / (6 * area) };
}

/**
 * Sobreposição RELEVANTE entre duas zonas ativas: arestas que se cruzam de fato ou vértice de uma
 * estritamente dentro da outra. Zonas que só compartilham divisa continuam permitidas — o que não
 * pode existir é área comum, que tornaria a classificação do pedido ambígua.
 */
export function zonasSobrepoem(umaZona: PoligonoZona, outraZona: PoligonoZona): boolean {
  for (const [a1, a2] of arestas(umaZona)) {
    for (const [b1, b2] of arestas(outraZona)) if (segmentosSeCruzam(a1, a2, b1, b2)) return true;
  }
  const estritamenteDentro = (ponto: Ponto, poligono: PoligonoZona) =>
    pontoDentroDaZona(poligono, ponto) && !arestas(poligono).some(([a, b]) => noSegmento(a, b, ponto));
  if (umaZona.some((ponto) => estritamenteDentro(ponto, outraZona)) || outraZona.some((ponto) => estritamenteDentro(ponto, umaZona))) return true;
  /*
   * Zonas IGUAIS (ou uma contendo a outra com a mesma fronteira) não têm cruzamento nem vértice
   * "solto" dentro da outra: quem denuncia a área comum é o interior. Vizinhas que só dividem a
   * divisa continuam passando, porque o centro de uma nunca cai dentro da outra.
   */
  return pontoDentroDaZona(outraZona, centroide(umaZona)) || pontoDentroDaZona(umaZona, centroide(outraZona));
}

/**
 * Zona do PONTO do pedido: a primeira zona ATIVA que o contém, em ordem estável (nome, id) — com a
 * regra de não-sobreposição, "a primeira" é também "a única". `null` = fora das zonas configuradas.
 */
export function classificarPonto(zonas: Array<Pick<ZonaEntrega, "id" | "nome" | "vertices" | "ativa">>, ponto: Ponto): string | null {
  const candidatas = zonas
    .filter((zona) => zona.ativa)
    .slice()
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR") || a.id.localeCompare(b.id));
  return candidatas.find((zona) => pontoDentroDaZona(zona.vertices, ponto))?.id ?? null;
}

export { coordenadasSchema };
