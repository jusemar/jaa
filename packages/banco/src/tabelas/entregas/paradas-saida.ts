import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { pedidos } from "../pedidos/pedidos.js";
import { saidasEntrega } from "./saidas-entrega.js";

/**
 * PARADA da saída: um pedido dentro da operação, na posição atual da sequência.
 *
 * O destino da parada é sempre o SNAPSHOT do pedido (endereço e ponto que o cliente confirmou):
 * nada é geocodificado de novo nem lido da agenda atual do cliente.
 *
 * `encerrada_em` marca a parada que saiu da sequência ativa (pedido entregue ou cancelado). Com o
 * índice único parcial, um pedido só pode estar em UMA saída ativa por vez — o histórico permanece.
 */
export const paradasSaida = pgTable(
  "paradas_saida",
  {
    id: uuid().primaryKey().default(sql`uuidv7()`),
    saidaId: uuid()
      .notNull()
      .references(() => saidasEntrega.id, { onDelete: "cascade" }),
    pedidoId: uuid()
      .notNull()
      .references(() => pedidos.id, { onDelete: "cascade" }),
    // Empresa da saída, repetida para as FKs compostas (parada, saída e pedido na mesma empresa).
    empresaId: uuid().notNull(),
    // Posição na sequência ATUAL (1..n). Reordenar reescreve as posições na mesma transação.
    posicao: integer().notNull(),
    encerradaEm: timestamp({ withTimezone: true }),
    motivoEncerramento: text(),
    criadoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (tabela) => [
    // Um pedido em no máximo UMA saída ativa (resolve corridas entre dois gestores).
    uniqueIndex("paradas_saida_pedido_ativo_unico").on(tabela.pedidoId).where(sql`${tabela.encerradaEm} is null`),
    // O mesmo pedido não repete dentro da saída.
    uniqueIndex("paradas_saida_pedido_por_saida_unico").on(tabela.saidaId, tabela.pedidoId),
    // Sequência da saída, em ordem.
    index("paradas_saida_saida_id_posicao_idx").on(tabela.saidaId, tabela.posicao),
    foreignKey({
      name: "paradas_saida_saida_da_empresa_fk",
      columns: [tabela.saidaId, tabela.empresaId],
      foreignColumns: [saidasEntrega.id, saidasEntrega.empresaId],
    }).onDelete("cascade"),
    foreignKey({
      name: "paradas_saida_pedido_da_empresa_fk",
      columns: [tabela.pedidoId, tabela.empresaId],
      foreignColumns: [pedidos.id, pedidos.empresaId],
    }).onDelete("cascade"),
    check("paradas_saida_posicao_valida", sql`${tabela.posicao} >= 1`),
    check("paradas_saida_motivo_por_encerramento", sql`${tabela.motivoEncerramento} is null or ${tabela.encerradaEm} is not null`),
  ],
);
