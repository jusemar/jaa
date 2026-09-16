import { index, pgTable, primaryKey, timestamp, uuid } from "drizzle-orm/pg-core";
import { identidades } from "../identidades/identidades.js";
import { conversas } from "./conversas.js";

// Quem participa de uma conversa é uma IDENTIDADE (pessoal hoje; empresarial no futuro), nunca a conta.
export const participantesConversa = pgTable(
  "participantes_conversa",
  {
    conversaId: uuid()
      .notNull()
      .references(() => conversas.id, { onDelete: "cascade" }),
    identidadeId: uuid()
      .notNull()
      .references(() => identidades.id, { onDelete: "restrict" }),
    // Cursor de LEITURA desta identidade na conversa: leu todas as mensagens dos OUTROS participantes
    // com id (UUIDv7) <= este valor. Só avança (UPDATE condicional), nunca regride. Null = nada lido.
    // Sem FK para mensagens de propósito: evitaria ciclo participantes ↔ mensagens; o servidor valida,
    // na mesma instrução do UPDATE, que o id é de mensagem desta conversa enviada por outra identidade.
    lidaAteMensagemId: uuid(),
    criadoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (tabela) => [
    primaryKey({ name: "participantes_conversa_pk", columns: [tabela.conversaId, tabela.identidadeId] }),
    // Lista de conversas: WHERE identidade_id = ? (a PK começa por conversa_id e não serve a esta busca).
    index("participantes_conversa_identidade_id_conversa_id_idx").on(tabela.identidadeId, tabela.conversaId),
  ],
);
