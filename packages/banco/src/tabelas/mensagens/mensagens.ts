import { sql } from "drizzle-orm";
import { check, foreignKey, index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "../autenticacao/better-auth.js";
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
    // Resposta a uma mensagem específica (de qualquer tipo, hoje e no futuro). Null = mensagem comum.
    mensagemRespondidaId: uuid(),
    // Última edição do conteúdo pelo autor. Null = nunca editada. Sem histórico de versões nesta fase.
    // `criadoEm` (horário exibido e ordem) nunca muda com a edição.
    editadaEm: timestamp({ withTimezone: true }),
    // "Excluir para todos" (só o autor): exclusão LÓGICA. A linha permanece (ordem, cursores,
    // confirmações e respostas continuam íntegros), mas o conteúdo é apagado aqui mesmo:
    // nenhuma consulta, evento ou referência consegue devolvê-lo depois.
    excluidaParaTodosEm: timestamp({ withTimezone: true }),
    // AUDITORIA INTERNA: conta autenticada que executou cada ação. Essencial quando a remetente é uma
    // identidade EMPRESARIAL operada por pessoas (proprietário hoje; atendentes no futuro).
    // Nunca é serializada: para quem conversa, quem fala é sempre a identidade (ex.: Pizzaria BH).
    // SET NULL: apagar uma conta não apaga mensagens nem a identidade que as enviou.
    operadorUsuarioId: text().references(() => users.id, { onDelete: "set null" }),
    editadaPorUsuarioId: text().references(() => users.id, { onDelete: "set null" }),
    excluidaPorUsuarioId: text().references(() => users.id, { onDelete: "set null" }),
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
    // Único (o id já é único) para servir de alvo à FK composta de recebimentos_mensagem,
    // que garante que o recebimento aponta para uma mensagem daquela mesma conversa.
    uniqueIndex("mensagens_conversa_id_id_unico").on(tabela.conversaId, tabela.id),
    // A mensagem respondida existe e é da MESMA conversa: garantido pelo banco (FK composta sobre o
    // índice único conversa_id+id). Sem cascata: a exclusão futura será lógica (tombstone), mantendo a
    // linha original; a referência continua válida e a interface decide como mostrar "apagada".
    // NO ACTION (e não RESTRICT) permite apagar em uma única instrução mensagens que se referenciam.
    foreignKey({
      name: "mensagens_mensagem_respondida_fk",
      columns: [tabela.conversaId, tabela.mensagemRespondidaId],
      foreignColumns: [tabela.conversaId, tabela.id],
    }).onDelete("no action"),
    check("mensagens_nao_responde_a_si_mesma", sql`${tabela.mensagemRespondidaId} is null or ${tabela.mensagemRespondidaId} <> ${tabela.id}`),
    // Sustenta a verificação da FK ao apagar mensagens referenciadas; só contém respostas.
    index("mensagens_conversa_id_mensagem_respondida_id_idx")
      .on(tabela.conversaId, tabela.mensagemRespondidaId)
      .where(sql`${tabela.mensagemRespondidaId} is not null`),
    check("mensagens_editada_apos_criacao", sql`${tabela.editadaEm} is null or ${tabela.editadaEm} >= ${tabela.criadoEm}`),
    // Mantido em sincronia com conteudoMensagemTextoSchema em @jaa/contratos.
    // Tombstone (excluída para todos) tem obrigatoriamente conteúdo vazio.
    check(
      "mensagens_conteudo_texto_valido",
      sql`(${tabela.excluidaParaTodosEm} is null and char_length(${tabela.conteudo}) between 1 and 4000 and ${tabela.conteudo} ~ '[^[:space:]]') or (${tabela.excluidaParaTodosEm} is not null and ${tabela.conteudo} = '')`,
    ),
    check("mensagens_excluida_apos_criacao", sql`${tabela.excluidaParaTodosEm} is null or ${tabela.excluidaParaTodosEm} >= ${tabela.criadoEm}`),
  ],
);
