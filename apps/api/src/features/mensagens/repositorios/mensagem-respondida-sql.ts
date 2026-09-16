import { PREVIA_MENSAGEM_RESPONDIDA_TAMANHO_MAXIMO, type MensagemRespondida } from "@jaa/contratos";
import { sql, type SQL } from "drizzle-orm";

const TAMANHO_PREVIA = sql.raw(String(PREVIA_MENSAGEM_RESPONDIDA_TAMANHO_MAXIMO));

// Objeto JSON da referência a partir de `original` (mensagens) e `autor` (identidades).
// Só dados públicos da identidade autora; o conteúdo vem limitado à prévia (a original não muda).
// Original excluída para todos: nunca devolve conteúdo (que também já foi apagado no banco).
const objetoReferencia = sql`json_build_object(
  'id', original.id,
  'remetente', json_build_object('identidadeId', autor.id, 'nomeExibicao', autor.nome_exibicao),
  'tipo', original.tipo,
  'previaConteudo', case when original.excluida_para_todos_em is null then left(original.conteudo, ${TAMANHO_PREVIA}) else '' end,
  'conteudoTruncado', original.excluida_para_todos_em is null and char_length(original.conteudo) > ${TAMANHO_PREVIA},
  'excluida', original.excluida_para_todos_em is not null
)`;

/**
 * Referência da mensagem respondida para cada mensagem retornada: busca pela PK da original e da
 * identidade autora, sem N+1 e sem depender de a original estar na mesma página do histórico.
 * Restrita à mesma conversa (também garantido pela FK). Null quando não é resposta.
 * `tabelaMensagens` = nome (ou alias) da tabela `mensagens` na consulta externa.
 */
export function mensagemRespondidaSql(tabelaMensagens = "mensagens"): SQL<MensagemRespondida | null> {
  const mensagem = sql.identifier(tabelaMensagens);

  return sql<MensagemRespondida | null>`(
    select ${objetoReferencia}
    from mensagens original
    join identidades autor on autor.id = original.remetente_identidade_id
    where original.id = ${mensagem}.mensagem_respondida_id
      and original.conversa_id = ${mensagem}.conversa_id
  )`;
}

// Referência de uma mensagem que se pretende responder: só se for desta conversa, não estiver
// excluída para todos e não tiver sido excluída para quem responde.
export function referenciaNaConversaSql(conversaId: string, mensagemId: string, identidadeId: string): SQL {
  return sql`
    select ${objetoReferencia} as referencia
    from mensagens original
    join identidades autor on autor.id = original.remetente_identidade_id
    where original.id = ${mensagemId}
      and original.conversa_id = ${conversaId}
      and original.excluida_para_todos_em is null
      and not exists (
        select 1 from mensagens_excluidas_para_identidade oculta
        where oculta.mensagem_id = original.id and oculta.identidade_id = ${identidadeId}
      )
    limit 1
  `;
}
