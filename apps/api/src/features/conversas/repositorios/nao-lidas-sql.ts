import { LIMITE_CONTAGEM_NAO_LIDAS } from "@jaa/contratos";
import { sql, type SQL } from "drizzle-orm";

/**
 * Não lidas de UMA conversa para uma identidade, derivadas do estado persistido (sem contador duplicado):
 * mensagens de OUTRAS identidades com id (UUIDv7) acima do marcador de leitura dela, excluindo as
 * excluídas para todos e as excluídas para ela. Busca por intervalo no índice (conversa_id, id) e para
 * em LIMITE_CONTAGEM_NAO_LIDAS: o custo não cresce com o tamanho do histórico.
 */
export function naoLidasSql(conversaId: SQL, lidaAteMensagemId: SQL, identidadeId: string): SQL<number> {
  return sql<number>`(
    select count(*)::int from (
      select 1
      from mensagens nao_lida
      where nao_lida.conversa_id = ${conversaId}
        and (${lidaAteMensagemId} is null or nao_lida.id > ${lidaAteMensagemId})
        and nao_lida.remetente_identidade_id <> ${identidadeId}
        and nao_lida.excluida_para_todos_em is null
        and not exists (
          select 1 from mensagens_excluidas_para_identidade oculta
          where oculta.mensagem_id = nao_lida.id and oculta.identidade_id = ${identidadeId}
        )
      limit ${sql.raw(String(LIMITE_CONTAGEM_NAO_LIDAS))}
    ) contagem
  )`;
}
