import { foreignKey, pgTable, primaryKey, timestamp, uuid } from "drizzle-orm/pg-core";
import { participantesConversa } from "../conversas/participantes-conversa.js";
import { mensagens } from "./mensagens.js";

/**
 * Confirmação REAL de recebimento: um cliente autenticado da identidade destinatária recebeu e
 * processou a mensagem e avisou o servidor. Persistir ou emitir no socket NÃO cria linha aqui.
 * Uma linha por (mensagem, destinatário), vale para 1:1 e grupos; várias abas/dispositivos da
 * mesma identidade confirmam a mesma linha (idempotente). Leitura não fica aqui: é o cursor
 * `lida_ate_mensagem_id` do participante.
 */
export const recebimentosMensagem = pgTable(
  "recebimentos_mensagem",
  {
    mensagemId: uuid().notNull(),
    conversaId: uuid().notNull(),
    destinatarioIdentidadeId: uuid().notNull(),
    recebidoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (tabela) => [
    primaryKey({ name: "recebimentos_mensagem_pk", columns: [tabela.mensagemId, tabela.destinatarioIdentidadeId] }),
    // A mensagem pertence à conversa informada…
    foreignKey({
      name: "recebimentos_mensagem_mensagem_fk",
      columns: [tabela.conversaId, tabela.mensagemId],
      foreignColumns: [mensagens.conversaId, mensagens.id],
    }).onDelete("cascade"),
    // …e o destinatário participa dessa mesma conversa: garantido pelo banco.
    foreignKey({
      name: "recebimentos_mensagem_destinatario_participante_fk",
      columns: [tabela.conversaId, tabela.destinatarioIdentidadeId],
      foreignColumns: [participantesConversa.conversaId, participantesConversa.identidadeId],
    }).onDelete("cascade"),
  ],
);
