import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, integer, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { colunaMultipoligono } from "../../geoespacial.js";
import { municipios } from "../territorio/municipios.js";
import { perfisProfissionais, servicosPerfil } from "./perfis-profissionais.js";

/*
 * ÁREA DE ATUAÇÃO: onde o profissional aceita trabalhar. Cada linha tem UMA modalidade e a cobertura
 * do perfil é a UNIÃO das áreas ativas. Linhas (não 5 colunas): o limite da versão atual é do servidor.
 *
 * - raio: `raio_metros` a partir da BASE do perfil (o centro é a base — mudar a base move o raio);
 * - poligono: `cobertura` desenhada no mapa (MultiPolygon válido; borda conta como dentro);
 * - municipio: `codigo_ibge` oficial (nunca o nome digitado).
 *
 * ABRANGÊNCIA: `todos_os_servicos = true` vale para qualquer serviço do perfil; `false` vale só para os
 * serviços ligados em `areas_atuacao_servicos`. É explícita para que remover o último serviço ligado
 * NÃO transforme a área, em silêncio, em "vale para tudo" — ela simplesmente deixa de cobrir.
 */
export const modalidadeAreaAtuacao = pgEnum("modalidade_area_atuacao", ["raio", "poligono", "municipio"]);

export const areasAtuacao = pgTable(
  "areas_atuacao",
  {
    id: uuid().primaryKey().default(sql`uuidv7()`),
    perfilId: uuid()
      .notNull()
      .references(() => perfisProfissionais.id, { onDelete: "cascade" }),
    modalidade: modalidadeAreaAtuacao().notNull(),
    // Rótulo pessoal opcional ("Perto de casa"). Não é exibido a terceiros.
    nome: text(),
    raioMetros: integer(),
    cobertura: colunaMultipoligono(),
    codigoIbge: text().references(() => municipios.codigoIbge, { onDelete: "restrict" }),
    todosOsServicos: boolean().notNull().default(true),
    ativa: boolean().notNull().default(true),
    criadoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (tabela) => [
    uniqueIndex("areas_atuacao_id_perfil_unico").on(tabela.id, tabela.perfilId),
    index("areas_atuacao_perfil_idx").on(tabela.perfilId),
    // Um índice por modalidade, cada um parcial: a consulta de cobertura usa três caminhos indexados.
    index("areas_atuacao_cobertura_gist").using("gist", tabela.cobertura).where(sql`${tabela.modalidade} = 'poligono' and ${tabela.ativa}`),
    index("areas_atuacao_municipio_idx").on(tabela.codigoIbge).where(sql`${tabela.modalidade} = 'municipio' and ${tabela.ativa}`),
    // Exatamente os campos da modalidade — nada de área "meio raio, meio polígono".
    check(
      "areas_atuacao_campos_por_modalidade",
      sql`(${tabela.modalidade}::text = 'raio' and ${tabela.raioMetros} is not null and ${tabela.cobertura} is null and ${tabela.codigoIbge} is null)
       or (${tabela.modalidade}::text = 'poligono' and ${tabela.cobertura} is not null and ${tabela.raioMetros} is null and ${tabela.codigoIbge} is null)
       or (${tabela.modalidade}::text = 'municipio' and ${tabela.codigoIbge} is not null and ${tabela.raioMetros} is null and ${tabela.cobertura} is null)`,
    ),
    // O teto da versão atual (50 km) é regra do servidor; o banco garante só o que nunca muda.
    check("areas_atuacao_raio_positivo", sql`${tabela.raioMetros} is null or ${tabela.raioMetros} > 0`),
    check("areas_atuacao_cobertura_valida", sql`${tabela.cobertura} is null or (ST_IsValid(${tabela.cobertura}) and not ST_IsEmpty(${tabela.cobertura}))`),
    check("areas_atuacao_nome_valido", sql`${tabela.nome} is null or char_length(${tabela.nome}) between 1 and 60`),
  ],
);

// Serviços do perfil aos quais uma área RESTRITA se aplica — área e serviço sempre do MESMO perfil.
export const areasAtuacaoServicos = pgTable(
  "areas_atuacao_servicos",
  {
    areaId: uuid().notNull(),
    perfilId: uuid().notNull(),
    servicoPerfilId: uuid().notNull(),
  },
  (tabela) => [
    primaryKey({ name: "areas_atuacao_servicos_pk", columns: [tabela.areaId, tabela.servicoPerfilId] }),
    foreignKey({
      name: "areas_atuacao_servicos_area_do_perfil_fk",
      columns: [tabela.areaId, tabela.perfilId],
      foreignColumns: [areasAtuacao.id, areasAtuacao.perfilId],
    }).onDelete("cascade"),
    foreignKey({
      name: "areas_atuacao_servicos_servico_do_perfil_fk",
      columns: [tabela.servicoPerfilId, tabela.perfilId],
      foreignColumns: [servicosPerfil.id, servicosPerfil.perfilId],
    }).onDelete("cascade"),
    index("areas_atuacao_servicos_servico_idx").on(tabela.servicoPerfilId),
  ],
);
