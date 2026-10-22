import type { Banco } from "@jaa/banco";
import {
  accounts,
  bloqueiosIdentidade,
  contatos,
  excecoesPrivacidade,
  identidades,
  identidadesVisitantes,
  mensagens,
  participantesConversa,
  preferenciasIdentidade,
  sessions,
  users,
} from "@jaa/banco/schema";
import { VISITANTE_INATIVIDADE_MAXIMA_MS } from "@jaa/contratos";
import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { apagarContaTemporaria, apagarConversa } from "./vincular-visitante.js";

const prazo = sql`now() - make_interval(secs => ${VISITANTE_INATIVIDADE_MAXIMA_MS / 1000})`;

export interface ResultadoExpiracao {
  // Identidades visitantes apagadas por inteiro (não tinham histórico com ninguém).
  apagadas: number;
  // Encerradas: sem sessão e sem como entrar, mantidas só como autoras do histórico dos outros.
  encerradas: number;
  sessoesEncerradas: string[];
}

/**
 * EXPIRAÇÃO DOS VISITANTES: 24 h sem atividade, pelo relógio do banco.
 *
 * O que é EXCLUSIVAMENTE da sessão temporária some: sessões e credenciais da conta anônima, conversas
 * em que ninguém escreveu nada, a agenda/bloqueios/exceções/preferências que o visitante criou.
 *
 * O que já é HISTÓRICO DE OUTRA PESSOA fica: uma conversa com mensagens pertence também a quem as
 * recebeu (e respondeu). Ela, as mensagens e a identidade visitante como AUTORA continuam existindo — a
 * marca vira "encerrada" e a conta anônima fica só como dona técnica dessa identidade, sem sessão nem
 * credencial, sem como ser usada. Nada some da conversa de quem tem conta.
 *
 * Cada visitante numa transação própria, travado (SKIP LOCKED): duas instâncias da API nunca expiram o
 * mesmo, e uma entrada simultânea (conversão) espera ou é esperada — nunca as duas pela metade.
 */
export async function expirarVisitantes(banco: Banco, { lote = 100 }: { lote?: number } = {}): Promise<ResultadoExpiracao> {
  const resultado: ResultadoExpiracao = { apagadas: 0, encerradas: 0, sessoesEncerradas: [] };
  const candidatos = await banco
    .select({ identidadeId: identidadesVisitantes.identidadeId })
    .from(identidadesVisitantes)
    .where(and(isNull(identidadesVisitantes.convertidaEm), isNull(identidadesVisitantes.encerradaEm), lt(identidadesVisitantes.ultimaAtividadeEm, prazo)))
    .orderBy(identidadesVisitantes.ultimaAtividadeEm)
    .limit(lote);

  for (const { identidadeId } of candidatos) {
    const desfecho = await expirarUm(banco, identidadeId);
    if (!desfecho) continue;
    resultado[desfecho.tipo === "apagada" ? "apagadas" : "encerradas"] += 1;
    resultado.sessoesEncerradas.push(...desfecho.sessoesEncerradas);
  }

  resultado.sessoesEncerradas.push(...(await apagarContasAnonimasSemIdentidade(banco)));
  return resultado;
}

async function expirarUm(banco: Banco, identidadeId: string) {
  return banco.transaction(async (transacao) => {
    // Confere DE NOVO com a linha travada: pode ter tido atividade ou conversão desde a seleção.
    const [marca] = await transacao
      .select({ usuarioId: identidades.usuarioId })
      .from(identidadesVisitantes)
      .innerJoin(identidades, eq(identidades.id, identidadesVisitantes.identidadeId))
      .where(
        and(
          eq(identidadesVisitantes.identidadeId, identidadeId),
          isNull(identidadesVisitantes.convertidaEm),
          isNull(identidadesVisitantes.encerradaEm),
          lt(identidadesVisitantes.ultimaAtividadeEm, prazo),
        ),
      )
      .for("update", { of: identidadesVisitantes, skipLocked: true })
      .limit(1);
    if (!marca?.usuarioId) return null;
    const usuarioId = marca.usuarioId;

    // A sessão expirada nunca mais vale: sessões e credenciais da conta anônima saem já.
    const sessoes = await transacao.delete(sessions).where(eq(sessions.userId, usuarioId)).returning({ id: sessions.id });
    await transacao.delete(accounts).where(eq(accounts.userId, usuarioId));

    // Conversas em que ninguém escreveu: não são histórico de ninguém.
    const vazias = await transacao
      .select({ conversaId: participantesConversa.conversaId })
      .from(participantesConversa)
      .where(
        and(
          eq(participantesConversa.identidadeId, identidadeId),
          sql`not exists (select 1 from ${mensagens} where ${mensagens.conversaId} = ${participantesConversa.conversaId})`,
        ),
      );
    for (const { conversaId } of vazias) await apagarConversa(transacao, conversaId);

    const [restante] = await transacao
      .select({ conversaId: participantesConversa.conversaId })
      .from(participantesConversa)
      .where(eq(participantesConversa.identidadeId, identidadeId))
      .limit(1);

    if (!restante) {
      // Sem histórico com ninguém: a identidade (e o que pendia dela, em cascata) e a conta anônima somem.
      await transacao.delete(identidades).where(eq(identidades.id, identidadeId));
      const sessoesConta = await apagarContaTemporaria(transacao, usuarioId);
      return { tipo: "apagada" as const, sessoesEncerradas: [...sessoes.map((s) => s.id), ...sessoesConta] };
    }

    // Com histórico: sai só o que o visitante criou para si; a identidade fica como autora.
    await transacao.delete(contatos).where(eq(contatos.identidadeId, identidadeId));
    await transacao.delete(bloqueiosIdentidade).where(eq(bloqueiosIdentidade.bloqueadorIdentidadeId, identidadeId));
    await transacao.delete(excecoesPrivacidade).where(eq(excecoesPrivacidade.identidadeId, identidadeId));
    await transacao.delete(preferenciasIdentidade).where(eq(preferenciasIdentidade.identidadeId, identidadeId));
    await transacao.update(identidadesVisitantes).set({ encerradaEm: sql`now()` }).where(eq(identidadesVisitantes.identidadeId, identidadeId));
    return { tipo: "encerrada" as const, sessoesEncerradas: sessoes.map((s) => s.id) };
  });
}

/*
 * Conta anônima que nunca chegou a ter identidade (a criação da identidade falhou depois da sessão):
 * não há nada a preservar. Mesmo prazo, pela data de criação.
 */
async function apagarContasAnonimasSemIdentidade(banco: Banco): Promise<string[]> {
  return banco.transaction(async (transacao) => {
    const ehOrfa = and(
      eq(users.isAnonymous, true),
      lt(users.createdAt, prazo),
      sql`not exists (select 1 from ${identidades} where ${identidades.usuarioId} = ${users.id})`,
    );
    const sessoes = await transacao
      .delete(sessions)
      .where(inArray(sessions.userId, transacao.select({ id: users.id }).from(users).where(ehOrfa)))
      .returning({ id: sessions.id });
    await transacao.delete(users).where(ehOrfa);
    return sessoes.map((sessao) => sessao.id);
  });
}
