import { sql } from "drizzle-orm";
import { check, index, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { identidades } from "../identidades/identidades.js";

/**
 * AGENDA DE ENDEREÇOS do cliente (identidade PESSOAL). Dado privado: só a própria identidade lê e
 * escreve; a empresa nunca acessa esta agenda — recebe apenas o SNAPSHOT do endereço do pedido.
 *
 * Endereço TEXTUAL e PONTO DE ENTREGA são coisas diferentes: o texto é o que o cliente cadastrou
 * (o mapa nunca o corrige) e a coordenada só existe quando o cliente CONFIRMA o ponto no mapa.
 * Numeric(9,6)/(9,6) dá precisão de ~0,11 m, suficiente para navegação urbana, sem exigir PostGIS.
 */
export const enderecosCliente = pgTable(
  "enderecos_cliente",
  {
    id: uuid().primaryKey().default(sql`uuidv7()`),
    // Dono do endereço; sempre derivado da sessão, nunca do corpo da requisição.
    identidadeId: uuid()
      .notNull()
      .references(() => identidades.id, { onDelete: "cascade" }),
    apelido: text().notNull(),
    cep: text().notNull(),
    logradouro: text().notNull(),
    numero: text().notNull(),
    complemento: text(),
    bairro: text().notNull(),
    cidade: text().notNull(),
    uf: text().notNull(),
    pontoReferencia: text(),
    latitude: numeric({ precision: 9, scale: 6, mode: "number" }),
    longitude: numeric({ precision: 9, scale: 6, mode: "number" }),
    // Marca a CONFIRMAÇÃO EXPLÍCITA do cliente. Abrir o mapa não confirma nada.
    localizacaoConfirmadaEm: timestamp({ withTimezone: true }),
    // Remoção é lógica: pedidos antigos continuam referenciando o endereço de origem.
    arquivadoEm: timestamp({ withTimezone: true }),
    criadoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (tabela) => [
    // "Endereços desta identidade", do mais recente para o mais antigo.
    index("enderecos_cliente_identidade_id_id_idx").on(tabela.identidadeId, tabela.id),
    // Ou o ponto está confirmado por inteiro (lat + long + data), ou não existe confirmação nenhuma.
    check(
      "enderecos_cliente_localizacao_completa",
      sql`(${tabela.latitude} is null and ${tabela.longitude} is null and ${tabela.localizacaoConfirmadaEm} is null) or (${tabela.latitude} is not null and ${tabela.longitude} is not null and ${tabela.localizacaoConfirmadaEm} is not null)`,
    ),
    check("enderecos_cliente_latitude_valida", sql`${tabela.latitude} is null or ${tabela.latitude} between -90 and 90`),
    check("enderecos_cliente_longitude_valida", sql`${tabela.longitude} is null or ${tabela.longitude} between -180 and 180`),
    check("enderecos_cliente_uf_valida", sql`${tabela.uf} ~ '^[A-Z]{2}$'`),
    check("enderecos_cliente_cep_valido", sql`${tabela.cep} ~ '^[0-9]{8}$'`),
    check(
      "enderecos_cliente_textos_validos",
      sql`char_length(${tabela.apelido}) between 1 and 40 and char_length(${tabela.logradouro}) between 1 and 120 and char_length(${tabela.numero}) between 1 and 20 and char_length(${tabela.bairro}) between 1 and 80 and char_length(${tabela.cidade}) between 1 and 80 and (${tabela.complemento} is null or char_length(${tabela.complemento}) between 1 and 60) and (${tabela.pontoReferencia} is null or char_length(${tabela.pontoReferencia}) between 1 and 160)`,
    ),
  ],
);
