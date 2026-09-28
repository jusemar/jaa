import type { Banco } from "@jaa/banco";
import { bloqueiosIdentidade, identidades } from "@jaa/banco/schema";
import { and, eq, inArray, or, sql } from "drizzle-orm";

export type Transacao = Parameters<Parameters<Banco["transaction"]>[0]>[0];
export type Executor = Banco | Transacao;

/**
 * Serializa tudo o que envolve o PAR (A, B), na ordem canônica: criar bloqueio e enviar mensagem
 * pegam a mesma trava transacional. Assim uma mensagem nunca "passa" no instante em que o bloqueio
 * está sendo gravado — ou ela entra antes, ou o bloqueio já vale para ela.
 */
export async function travarPar(transacao: Transacao, a: string, b: string): Promise<void> {
  const [menor, maior] = a < b ? [a, b] : [b, a];
  await transacao.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`bloqueio:${menor}:${maior}`}, 0))`);
}

// Situação de "eu" em relação a "outra": quem bloqueou quem (duas linhas possíveis, uma por sentido).
export async function situacaoEntre(banco: Executor, eu: string, outra: string): Promise<{ euBloqueei: boolean; fuiBloqueado: boolean }> {
  const linhas = await banco
    .select({ bloqueador: bloqueiosIdentidade.bloqueadorIdentidadeId })
    .from(bloqueiosIdentidade)
    .where(
      or(
        and(eq(bloqueiosIdentidade.bloqueadorIdentidadeId, eu), eq(bloqueiosIdentidade.bloqueadoIdentidadeId, outra)),
        and(eq(bloqueiosIdentidade.bloqueadorIdentidadeId, outra), eq(bloqueiosIdentidade.bloqueadoIdentidadeId, eu)),
      ),
    );
  return { euBloqueei: linhas.some((linha) => linha.bloqueador === eu), fuiBloqueado: linhas.some((linha) => linha.bloqueador === outra) };
}

/** Há bloqueio, em QUALQUER sentido, entre `remetente` e alguma das `outras` identidades? */
export async function existeBloqueioCom(banco: Executor, remetente: string, outras: string[]): Promise<boolean> {
  if (outras.length === 0) return false;
  const [linha] = await banco
    .select({ um: sql<number>`1` })
    .from(bloqueiosIdentidade)
    .where(
      or(
        and(eq(bloqueiosIdentidade.bloqueadorIdentidadeId, remetente), inArray(bloqueiosIdentidade.bloqueadoIdentidadeId, outras)),
        and(eq(bloqueiosIdentidade.bloqueadoIdentidadeId, remetente), inArray(bloqueiosIdentidade.bloqueadorIdentidadeId, outras)),
      ),
    )
    .limit(1);
  return linha !== undefined;
}

export async function gravarBloqueio(banco: Executor, bloqueador: string, bloqueado: string): Promise<void> {
  await banco.insert(bloqueiosIdentidade).values({ bloqueadorIdentidadeId: bloqueador, bloqueadoIdentidadeId: bloqueado }).onConflictDoNothing();
}

// Só o PRÓPRIO bloqueio: o do outro sentido não é tocado.
export async function apagarBloqueio(banco: Executor, bloqueador: string, bloqueado: string): Promise<boolean> {
  const apagadas = await banco
    .delete(bloqueiosIdentidade)
    .where(and(eq(bloqueiosIdentidade.bloqueadorIdentidadeId, bloqueador), eq(bloqueiosIdentidade.bloqueadoIdentidadeId, bloqueado)))
    .returning({ id: bloqueiosIdentidade.bloqueadoIdentidadeId });
  return apagadas.length > 0;
}

// Tipo da identidade (pessoal/empresarial) ou null se não existe.
export async function tipoDaIdentidade(banco: Executor, identidadeId: string): Promise<"pessoal" | "empresarial" | null> {
  const [linha] = await banco.select({ tipo: identidades.tipo }).from(identidades).where(eq(identidades.id, identidadeId)).limit(1);
  return linha?.tipo ?? null;
}
