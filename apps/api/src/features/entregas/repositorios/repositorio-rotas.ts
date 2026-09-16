import type { Banco } from "@jaa/banco";
import { basesEmpresa, consumosRoteamento, saidasEntrega } from "@jaa/banco/schema";
import { coordenadasSchema, type Coordenadas, type RotaDaSaida } from "@jaa/contratos";
import { and, eq, gte, sql } from "drizzle-orm";
import type { RegistroConsumoRota, RotaCalculada } from "../lib/motor-rotas.js";

/*
 * Persistência da ROTA da saída e do CONSUMO de roteamento.
 *
 * A rota é gravada com a versão da sequência para a qual ela vale: reordenar envelhece o percurso, e
 * a tela mostra isso em vez de desenhar um traçado que não corresponde mais à ordem.
 */

export type SaidaRegistro = typeof saidasEntrega.$inferSelect;

// A geometria é gravada como jsonb; validamos na leitura em vez de confiar no que está no banco.
const geometriaSchema = coordenadasSchema.array().min(2);

export function lerRotaDaSaida(saida: SaidaRegistro): RotaDaSaida | null {
  if (!saida.rotaEstado || saida.rotaVersaoSequencia === null) return null;
  const geometria = saida.rotaGeometria === null ? null : geometriaSchema.safeParse(saida.rotaGeometria);

  return {
    estado: saida.rotaEstado,
    motivoFallback: (saida.rotaMotivoFallback as RotaDaSaida["motivoFallback"]) ?? null,
    provedor: saida.rotaProvedor,
    origem: saida.origemLatitude !== null && saida.origemLongitude !== null ? { latitude: saida.origemLatitude, longitude: saida.origemLongitude } : null,
    sequenciaDoProvedor: saida.rotaSequenciaDoProvedor,
    geometria: geometria?.success ? geometria.data : null,
    distanciaMetros: saida.rotaDistanciaMetros,
    duracaoSegundos: saida.rotaDuracaoSegundos,
    calculadaEm: saida.rotaCalculadaEm?.toISOString() ?? null,
    versaoSequencia: saida.rotaVersaoSequencia,
  };
}

/**
 * ORIGEM da saída: o ponto da base congelado na própria saída. Só é lido da empresa na PRIMEIRA vez;
 * depois disso, mudar a base não reescreve a origem de uma saída já planejada ou já percorrida.
 */
export async function resolverOrigemDaSaida(banco: Banco, saida: SaidaRegistro): Promise<Coordenadas | null> {
  if (saida.origemLatitude !== null && saida.origemLongitude !== null) {
    return { latitude: saida.origemLatitude, longitude: saida.origemLongitude };
  }
  const [base] = await banco
    .select({ latitude: basesEmpresa.latitude, longitude: basesEmpresa.longitude, confirmadaEm: basesEmpresa.localizacaoConfirmadaEm })
    .from(basesEmpresa)
    .where(eq(basesEmpresa.empresaId, saida.empresaId))
    .limit(1);
  // Sem ponto CONFIRMADO não há origem: o motor devolve fallback com o motivo "sem_base_confirmada".
  if (!base || base.latitude === null || base.longitude === null || base.confirmadaEm === null) return null;
  return { latitude: base.latitude, longitude: base.longitude };
}

export async function gravarRota(banco: Banco, saidaId: string, rota: RotaCalculada, versaoSequencia: number, agora: Date): Promise<void> {
  await banco
    .update(saidasEntrega)
    .set({
      // Snapshot da origem: gravado junto do primeiro cálculo e mantido daí em diante.
      ...(rota.origem ? { origemLatitude: rota.origem.latitude, origemLongitude: rota.origem.longitude } : {}),
      rotaEstado: rota.estado,
      rotaMotivoFallback: rota.motivoFallback,
      rotaProvedor: rota.provedor,
      rotaSequenciaDoProvedor: rota.sequenciaDoProvedor,
      // Em fallback tudo isto é null: o Jaa não desenha nem estima nada que não recebeu do provedor.
      rotaGeometria: rota.percurso ? rota.percurso.geometria : null,
      rotaDistanciaMetros: rota.percurso ? rota.percurso.distanciaMetros : null,
      rotaDuracaoSegundos: rota.percurso ? rota.percurso.duracaoSegundos : null,
      rotaCalculadaEm: agora,
      rotaVersaoSequencia: versaoSequencia,
    })
    .where(eq(saidasEntrega.id, saidaId));
}

export async function registrarConsumos(
  banco: Banco,
  dados: { empresaId: string; saidaId: string; consumos: RegistroConsumoRota[] },
): Promise<void> {
  if (dados.consumos.length === 0) return;
  await banco.insert(consumosRoteamento).values(
    dados.consumos.map((consumo) => ({
      empresaId: dados.empresaId,
      saidaId: dados.saidaId,
      provedor: consumo.provedor,
      operacao: consumo.operacao,
      resultado: consumo.resultado,
      paradas: consumo.paradas,
      motivo: consumo.motivo,
      duracaoMs: consumo.duracaoMs,
    })),
  );
}

/** "Quantas operações de roteamento a Empresa X gerou neste período?" — a pergunta que a tabela serve. */
export async function resumirConsumoRoteamento(
  banco: Banco,
  empresaId: string,
  desde: Date,
): Promise<Array<{ provedor: string; operacao: string; resultado: string; total: number }>> {
  return banco
    .select({
      provedor: consumosRoteamento.provedor,
      operacao: sql<string>`${consumosRoteamento.operacao}::text`,
      resultado: sql<string>`${consumosRoteamento.resultado}::text`,
      total: sql<number>`count(*)::int`,
    })
    .from(consumosRoteamento)
    .where(and(eq(consumosRoteamento.empresaId, empresaId), gte(consumosRoteamento.criadoEm, desde)))
    .groupBy(consumosRoteamento.provedor, consumosRoteamento.operacao, consumosRoteamento.resultado);
}
