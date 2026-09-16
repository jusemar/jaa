import { sql } from "drizzle-orm";
import { check, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { enderecosCliente } from "../enderecos/enderecos-cliente.js";
import { pedidos } from "./pedidos.js";

/**
 * DESTINO do pedido: SNAPSHOT do endereço textual e do ponto confirmado no momento da compra.
 * Como os itens, é histórico: editar depois o endereço salvo não altera pedido nenhum.
 * `endereco_id` é referência auxiliar (SET NULL se o endereço sumir) — o histórico não depende dela.
 *
 * Um pedido tem no máximo um destino (PK = pedido_id). Pedidos anteriores a esta etapa simplesmente
 * não têm linha aqui; a obrigatoriedade vale para os novos pedidos de entrega.
 * As coordenadas aqui são a base da futura navegação/rota do entregador: por isso são obrigatórias.
 */
export const destinosPedido = pgTable(
  "destinos_pedido",
  {
    pedidoId: uuid()
      .primaryKey()
      .references(() => pedidos.id, { onDelete: "cascade" }),
    enderecoId: uuid().references(() => enderecosCliente.id, { onDelete: "set null" }),
    cep: text().notNull(),
    logradouro: text().notNull(),
    numero: text().notNull(),
    complemento: text(),
    bairro: text().notNull(),
    cidade: text().notNull(),
    uf: text().notNull(),
    pontoReferencia: text(),
    latitude: numeric({ precision: 9, scale: 6, mode: "number" }).notNull(),
    longitude: numeric({ precision: 9, scale: 6, mode: "number" }).notNull(),
    // Quando o cliente confirmou aquele ponto (copiado do endereço na criação do pedido).
    localizacaoConfirmadaEm: timestamp({ withTimezone: true }).notNull(),
  },
  (tabela) => [
    check("destinos_pedido_latitude_valida", sql`${tabela.latitude} between -90 and 90`),
    check("destinos_pedido_longitude_valida", sql`${tabela.longitude} between -180 and 180`),
    check("destinos_pedido_uf_valida", sql`${tabela.uf} ~ '^[A-Z]{2}$'`),
    check("destinos_pedido_cep_valido", sql`${tabela.cep} ~ '^[0-9]{8}$'`),
  ],
);
