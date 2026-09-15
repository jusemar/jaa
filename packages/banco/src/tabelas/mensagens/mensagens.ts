import { sql } from "drizzle-orm";
import { check, foreignKey, index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { participantesConversa } from "../conversas/participantes-conversa.js";

export const tipoMensagem = pgEnum("tipo_mensagem", ["texto"]);

export const mensagens = pgTable(
  "mensagens",
  {
    // UUIDv7 gerado pelo PostgreSQL (relógio único do banco, monotônico por conexão):
    // identidade global da mensagem E chave de ordenação/paginação por cursor. Requer PostgreSQL 18+.
    id: uuid().primaryKey().default(sql`uuidv7()`),
    conversaId: uuid().notNull(),
    remetenteIdentidadeId: uuid().notNull(),
    // Gerado pelo cliente para cada mensagem; reenviar a mesma tentativa não cria cópias.
    idCliente: uuid().notNull(),
    tipo: tipoMensagem().notNull(),
    conteudo: text().notNull(),
    criadoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (tabela) => [
    // O remetente precisa ser participante da conversa: garantido pelo próprio banco.
    foreignKey({
      name: "mensagens_remetente_participante_fk",
      columns: [tabela.conversaId, tabela.remetenteIdentidadeId],
      foreignColumns: [participantesConversa.conversaId, participantesConversa.identidadeId],
    }).onDelete("restrict"),
    uniqueIndex("mensagens_id_cliente_por_remetente_unico").on(tabela.remetenteIdentidadeId, tabela.idCliente),
    // Histórico: WHERE conversa_id = ? AND id < cursor ORDER BY id DESC LIMIT n.
    index("mensagens_conversa_id_id_idx").on(tabela.conversaId, tabela.id),
    // Mantido em sincronia com conteudoMensagemTextoSchema em @jaa/contratos.
    check(
      "mensagens_conteudo_texto_valido",
      sql`char_length(${tabela.conteudo}) between 1 and 4000 and ${tabela.conteudo} ~ '[^[:space:]]'`,
    ),
  ],
);
