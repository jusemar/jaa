import { foreignKey, pgTable, primaryKey, timestamp, uuid } from "drizzle-orm/pg-core";
import { participantesConversa } from "../conversas/participantes-conversa.js";
import { mensagens } from "./mensagens.js";

/**
 * "Excluir para mim": a mensagem deixa de existir SÓ para esta identidade (pessoal hoje; empresarial
 * ou membro de grupo no futuro). A mensagem global não muda e os demais continuam vendo.
 * Uma linha por (mensagem, identidade); repetir a ação é idempotente.
 */
export const mensagensExcluidasParaIdentidade = pgTable(
  "mensagens_excluidas_para_identidade",
  {
    mensagemId: uuid().notNull(),
    conversaId: uuid().notNull(),
    identidadeId: uuid().notNull(),
    excluidaEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (tabela) => [
    // A PK também atende as consultas: "esta mensagem está oculta para esta identidade?".
    primaryKey({ name: "mensagens_excluidas_para_identidade_pk", columns: [tabela.mensagemId, tabela.identidadeId] }),
    foreignKey({
      name: "mensagens_excluidas_para_identidade_mensagem_fk",
      columns: [tabela.conversaId, tabela.mensagemId],
      foreignColumns: [mensagens.conversaId, mensagens.id],
    }).onDelete("cascade"),
    // Só quem participa da conversa pode ocultar mensagens dela: garantido pelo banco.
    foreignKey({
      name: "mensagens_excluidas_para_identidade_participante_fk",
      columns: [tabela.conversaId, tabela.identidadeId],
      foreignColumns: [participantesConversa.conversaId, participantesConversa.identidadeId],
    }).onDelete("cascade"),
  ],
);
