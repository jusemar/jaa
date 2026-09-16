import type { EstadoMensagem } from "@jaa/contratos";
import { sql, type SQL } from "drizzle-orm";

/**
 * Estado DERIVADO de fatos persistidos que só crescem (nada é gravado na própria mensagem):
 * - lida:     todo destinatário tem marcador de leitura >= id da mensagem;
 * - entregue: todo destinatário leu ou confirmou o recebimento dela;
 * - enviada:  caso contrário (a mensagem existe, logo foi persistida).
 * Destinatários = participantes exceto o remetente (1 na conversa direta; N em grupos futuros).
 * Como marcadores só avançam e confirmações nunca são apagadas, o estado nunca regride.
 * Custo: busca pela PK de participantes e de recebimentos para cada mensagem retornada.
 *
 * SQL escrito com nomes qualificados: o Drizzle omite o nome da tabela das colunas em selects
 * de tabela única, o que tornaria as referências da subconsulta ambíguas.
 * `tabelaMensagens` = nome (ou alias) da tabela `mensagens` na consulta externa.
 */
export function estadoMensagemSql(tabelaMensagens = "mensagens"): SQL<EstadoMensagem> {
  const mensagem = sql.identifier(tabelaMensagens);

  return sql<EstadoMensagem>`(
    select case
      when bool_and(coalesce(destinatario.lida_ate_mensagem_id >= ${mensagem}.id, false)) then 'lida'
      when bool_and(coalesce(destinatario.lida_ate_mensagem_id >= ${mensagem}.id, false) or recebimento.mensagem_id is not null) then 'entregue'
      else 'enviada'
    end
    from participantes_conversa destinatario
    left join recebimentos_mensagem recebimento
      on recebimento.mensagem_id = ${mensagem}.id
      and recebimento.destinatario_identidade_id = destinatario.identidade_id
    where destinatario.conversa_id = ${mensagem}.conversa_id
      and destinatario.identidade_id <> ${mensagem}.remetente_identidade_id
  )`;
}
