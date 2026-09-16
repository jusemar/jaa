import { sql } from "drizzle-orm";
import { check, foreignKey, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "../autenticacao/better-auth.js";
import { pedidos } from "../pedidos/pedidos.js";
import { entregadoresEmpresa } from "./entregadores-empresa.js";

/**
 * ATRIBUIÇÃO de um pedido a um entregador, com HISTÓRICO: a linha sem `encerrado_em` é a atribuição
 * ATUAL (no máximo uma por pedido, garantido por índice único parcial); reatribuir encerra a anterior
 * e abre outra, na mesma transação.
 *
 * O histórico nunca é apagado: "14:30 atribuído a Paulo, 14:45 reatribuído a Carlos" continua legível.
 * A AUTORIZAÇÃO, porém, olha só a atribuição atual — quem perdeu o pedido perde o acesso na hora.
 *
 * Um entregador pode ter VÁRIAS atribuições ativas ao mesmo tempo (a rota com várias paradas vem depois).
 */
export const atribuicoesEntrega = pgTable(
  "atribuicoes_entrega",
  {
    // UUIDv7: ordem cronológica estável do histórico de atribuições.
    id: uuid().primaryKey().default(sql`uuidv7()`),
    pedidoId: uuid()
      .notNull()
      .references(() => pedidos.id, { onDelete: "cascade" }),
    entregadorId: uuid()
      .notNull()
      .references(() => entregadoresEmpresa.id, { onDelete: "restrict" }),
    // Empresa do pedido, repetida para a FK composta que impede atribuir entregador de OUTRA empresa.
    empresaId: uuid().notNull(),
    // Conta da empresa que atribuiu (auditoria interna; nunca exposta ao cliente nem ao entregador).
    atribuidoPorUsuarioId: text().references(() => users.id, { onDelete: "set null" }),
    atribuidoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
    // Preenchido quando a atribuição deixa de valer (reatribuição, cancelamento, remoção do vínculo).
    encerradoEm: timestamp({ withTimezone: true }),
    motivoEncerramento: text(),
  },
  (tabela) => [
    // No máximo UMA atribuição atual por pedido: impede "dois entregadores atuais" em concorrência.
    uniqueIndex("atribuicoes_entrega_atual_unica").on(tabela.pedidoId).where(sql`${tabela.encerradoEm} is null`),
    // Timeline de um pedido e "as entregas deste entregador".
    index("atribuicoes_entrega_pedido_id_id_idx").on(tabela.pedidoId, tabela.id),
    index("atribuicoes_entrega_entregador_id_idx").on(tabela.entregadorId, tabela.id),
    // O pedido é DESTA empresa…
    foreignKey({
      name: "atribuicoes_entrega_pedido_da_empresa_fk",
      columns: [tabela.pedidoId, tabela.empresaId],
      foreignColumns: [pedidos.id, pedidos.empresaId],
    }).onDelete("cascade"),
    // …e o entregador também: ninguém atribui pedido de uma empresa ao entregador de outra.
    foreignKey({
      name: "atribuicoes_entrega_entregador_da_empresa_fk",
      columns: [tabela.entregadorId, tabela.empresaId],
      foreignColumns: [entregadoresEmpresa.id, entregadoresEmpresa.empresaId],
    }).onDelete("restrict"),
    check("atribuicoes_entrega_motivo_por_encerramento", sql`${tabela.motivoEncerramento} is null or ${tabela.encerradoEm} is not null`),
  ],
);
