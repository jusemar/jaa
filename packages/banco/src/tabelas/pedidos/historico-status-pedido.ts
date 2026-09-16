import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "../autenticacao/better-auth.js";
import { pedidos, statusPedido } from "./pedidos.js";

/**
 * HISTÓRICO OPERACIONAL do pedido, append-only: `pedidos.status` é o estado ATUAL, este é o que
 * aconteceu. Gravado na MESMA transação da mudança, então status atual e histórico nunca divergem.
 * Só registra fato ocorrido: etapas futuras da timeline são derivadas da máquina de estados na
 * exibição, nunca inseridas aqui adiantadas.
 *
 * `operadorUsuarioId` é AUDITORIA INTERNA (a conta que executou pela empresa) e, como em mensagens,
 * jamais é serializado: para o cliente quem opera é a EMPRESA, nunca uma pessoa.
 */
export const historicoStatusPedido = pgTable(
  "historico_status_pedido",
  {
    // UUIDv7: ordem cronológica estável mesmo com horários iguais.
    id: uuid().primaryKey().default(sql`uuidv7()`),
    pedidoId: uuid()
      .notNull()
      .references(() => pedidos.id, { onDelete: "cascade" }),
    status: statusPedido().notNull(),
    ocorridoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
    // Null quando o evento nasce do próprio cliente (criação do pedido).
    operadorUsuarioId: text().references(() => users.id, { onDelete: "set null" }),
    motivo: text(),
  },
  (tabela) => [
    // Timeline de um pedido, em ordem.
    index("historico_status_pedido_pedido_id_id_idx").on(tabela.pedidoId, tabela.id),
    // Cada status acontece uma vez por pedido: o fluxo não volta nem repete etapa.
    uniqueIndex("historico_status_pedido_status_unico").on(tabela.pedidoId, tabela.status),
    check("historico_status_pedido_motivo_por_status", sql`(${tabela.motivo} is null or ${tabela.status}::text = 'cancelado') and (${tabela.motivo} is null or char_length(${tabela.motivo}) between 3 and 200)`),
  ],
);
