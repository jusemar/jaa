import { sql } from "drizzle-orm";
import { check, integer, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { empresas } from "./empresas.js";

/**
 * BASE OPERACIONAL da empresa: de onde as entregas saem. Como no endereço do cliente, o texto é o que
 * a empresa cadastrou (o mapa nunca o corrige) e a COORDENADA só existe quando alguém confirma o
 * ponto explicitamente; mudar campo estrutural do endereço invalida a confirmação.
 *
 * Serve hoje para detectar PRESENÇA do entregador na base (geofence) e será a origem das rotas depois.
 * `raio_metros` é a área da base — NÃO é região de entrega.
 */
export const basesEmpresa = pgTable(
  "bases_empresa",
  {
    empresaId: uuid()
      .primaryKey()
      .references(() => empresas.id, { onDelete: "cascade" }),
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
    localizacaoConfirmadaEm: timestamp({ withTimezone: true }),
    // Área da base (não é raio de entrega): 30 m cobre uma loja; 2 km, um galpão com pátio.
    raioMetros: integer().notNull().default(150),
    criadoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (tabela) => [
    // Ou o ponto está confirmado por inteiro, ou não existe confirmação nenhuma.
    check(
      "bases_empresa_localizacao_completa",
      sql`(${tabela.latitude} is null and ${tabela.longitude} is null and ${tabela.localizacaoConfirmadaEm} is null) or (${tabela.latitude} is not null and ${tabela.longitude} is not null and ${tabela.localizacaoConfirmadaEm} is not null)`,
    ),
    check("bases_empresa_latitude_valida", sql`${tabela.latitude} is null or ${tabela.latitude} between -90 and 90`),
    check("bases_empresa_longitude_valida", sql`${tabela.longitude} is null or ${tabela.longitude} between -180 and 180`),
    check("bases_empresa_raio_valido", sql`${tabela.raioMetros} between 30 and 2000`),
    check("bases_empresa_uf_valida", sql`${tabela.uf} ~ '^[A-Z]{2}$'`),
    check("bases_empresa_cep_valido", sql`${tabela.cep} ~ '^[0-9]{8}$'`),
  ],
);
