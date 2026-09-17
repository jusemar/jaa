import type { Banco } from "@jaa/banco";
import { posicoesSaida, saidasEntrega } from "@jaa/banco/schema";
import type { PosicaoEntregador } from "@jaa/contratos";
import { and, eq, sql } from "drizzle-orm";

/*
 * Persistência da POSIÇÃO ATUAL de cada saída em andamento. Uma linha por saída: o Jaa guarda onde a
 * operação está, não a trilha de onde passou.
 */

export type PosicaoRegistro = typeof posicoesSaida.$inferSelect;

export function serializarPosicao(registro: PosicaoRegistro): PosicaoEntregador {
  return {
    saidaId: registro.saidaId,
    latitude: registro.latitude,
    longitude: registro.longitude,
    precisaoMetros: registro.precisaoMetros,
    velocidadeMetrosPorSegundo: registro.velocidadeMetrosPorSegundo,
    direcaoGraus: registro.direcaoGraus,
    capturadaEm: registro.capturadaEm.toISOString(),
    recebidaEm: registro.recebidaEm.toISOString(),
  };
}

export interface DadosPosicao {
  saidaId: string;
  empresaId: string;
  entregadorId: string;
  latitude: number;
  longitude: number;
  precisaoMetros: number | null;
  velocidadeMetrosPorSegundo: number | null;
  direcaoGraus: number | null;
  capturadaEm: Date;
  recebidaEm: Date;
}

/**
 * Grava a posição SOMENTE se ela for mais nova que a gravada. Pacote atrasado, fora de ordem ou de um
 * segundo aparelho do mesmo entregador nunca faz a operação "andar para trás" — devolve `null` e o
 * chamador simplesmente não publica nada.
 */
export async function registrarPosicao(banco: Banco, dados: DadosPosicao): Promise<PosicaoRegistro | null> {
  const [registro] = await banco
    .insert(posicoesSaida)
    .values(dados)
    .onConflictDoUpdate({
      target: posicoesSaida.saidaId,
      set: {
        entregadorId: dados.entregadorId,
        latitude: dados.latitude,
        longitude: dados.longitude,
        precisaoMetros: dados.precisaoMetros,
        velocidadeMetrosPorSegundo: dados.velocidadeMetrosPorSegundo,
        direcaoGraus: dados.direcaoGraus,
        capturadaEm: dados.capturadaEm,
        recebidaEm: dados.recebidaEm,
      },
      // A captura precisa ser estritamente mais recente que a que já está lá.
      setWhere: sql`${posicoesSaida.capturadaEm} < ${dados.capturadaEm}`,
    })
    .returning();
  return registro ?? null;
}

export async function buscarPosicaoDaSaida(banco: Banco, saidaId: string): Promise<PosicaoRegistro | null> {
  const [registro] = await banco.select().from(posicoesSaida).where(eq(posicoesSaida.saidaId, saidaId)).limit(1);
  return registro ?? null;
}

/** Posições das saídas EM ANDAMENTO da empresa — fora da operação não existe rastreamento. */
export function listarPosicoesAtivasDaEmpresa(banco: Banco, empresaId: string): Promise<PosicaoRegistro[]> {
  return banco
    .select({
      saidaId: posicoesSaida.saidaId,
      empresaId: posicoesSaida.empresaId,
      entregadorId: posicoesSaida.entregadorId,
      latitude: posicoesSaida.latitude,
      longitude: posicoesSaida.longitude,
      precisaoMetros: posicoesSaida.precisaoMetros,
      velocidadeMetrosPorSegundo: posicoesSaida.velocidadeMetrosPorSegundo,
      direcaoGraus: posicoesSaida.direcaoGraus,
      capturadaEm: posicoesSaida.capturadaEm,
      recebidaEm: posicoesSaida.recebidaEm,
    })
    .from(posicoesSaida)
    .innerJoin(saidasEntrega, eq(saidasEntrega.id, posicoesSaida.saidaId))
    .where(and(eq(posicoesSaida.empresaId, empresaId), eq(saidasEntrega.status, "em_andamento")));
}

/**
 * Saída terminou: a posição é APAGADA. Nada de continuar guardando onde a pessoa estava depois que a
 * operação acabou — se ela foi para casa, isso não é assunto do Jaa.
 */
export async function esquecerPosicaoDaSaida(banco: Banco, saidaId: string): Promise<void> {
  await banco.delete(posicoesSaida).where(eq(posicoesSaida.saidaId, saidaId));
}
