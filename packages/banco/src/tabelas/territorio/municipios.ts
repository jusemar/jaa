import { sql } from "drizzle-orm";
import { boolean, check, index, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { colunaMultipoligono } from "../../geoespacial.js";

/*
 * TERRITÓRIO — duas coisas separadas de propósito:
 *
 * 1. IDENTIDADE ADMINISTRATIVA (`municipios`): o código oficial do IBGE (7 dígitos) é a chave. O nome
 *    é só exibição — "Belo Horizonte" digitado nunca identifica município;
 * 2. GEOMETRIA TERRITORIAL (`malhas_municipio`): o polígono oficial, VERSIONADO pelo ano da Malha
 *    Municipal do IBGE. Nova malha = nova versão; a anterior fica para histórico e só uma é vigente.
 *
 * Os dados NÃO vêm por migration: serão carregados por um comando de importação idempotente a partir
 * da fonte oficial do IBGE (pendência registrada). Até lá as tabelas existem vazias — nenhum limite
 * territorial é inventado.
 */

export const municipios = pgTable(
  "municipios",
  {
    codigoIbge: text().primaryKey(),
    nome: text().notNull(),
    uf: text().notNull(),
    ativo: boolean().notNull().default(true),
    criadoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (tabela) => [
    check("municipios_codigo_ibge_valido", sql`${tabela.codigoIbge} ~ '^[0-9]{7}$'`),
    check("municipios_uf_valida", sql`${tabela.uf} ~ '^[A-Z]{2}$'`),
    check("municipios_nome_valido", sql`char_length(${tabela.nome}) between 1 and 80`),
  ],
);

export const malhasMunicipio = pgTable(
  "malhas_municipio",
  {
    codigoIbge: text()
      .notNull()
      .references(() => municipios.codigoIbge, { onDelete: "cascade" }),
    // Ano da Malha Municipal do IBGE (ex.: "2025").
    versao: text().notNull(),
    geometria: colunaMultipoligono().notNull(),
    // De onde veio (URL/arquivo oficial) — rastreabilidade da importação.
    fonte: text().notNull(),
    vigente: boolean().notNull().default(false),
    importadoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (tabela) => [
    primaryKey({ name: "malhas_municipio_pk", columns: [tabela.codigoIbge, tabela.versao] }),
    // Uma única geometria vigente por município.
    uniqueIndex("malhas_municipio_vigente_unica").on(tabela.codigoIbge).where(sql`${tabela.vigente}`),
    // "Em que município está este ponto?" — só a malha vigente participa.
    index("malhas_municipio_geometria_gist").using("gist", tabela.geometria).where(sql`${tabela.vigente}`),
    check("malhas_municipio_versao_valida", sql`${tabela.versao} ~ '^[0-9]{4}$'`),
    check("malhas_municipio_geometria_valida", sql`ST_IsValid(${tabela.geometria}) and not ST_IsEmpty(${tabela.geometria})`),
  ],
);
