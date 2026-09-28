import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, integer, pgEnum, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/*
 * TAXONOMIA do Motor Profissional: CATEGORIA → SERVIÇO → (ESPECIALIDADES, ATRIBUTOS → OPÇÕES).
 *
 * - SERVIÇO é o que o profissional oferece ("Entrega", "Transporte de passageiros", "Eletricista");
 * - ESPECIALIDADE detalha em que parte daquele serviço ele atua ("chuveiro", "pós-obra");
 * - ATRIBUTO é característica/filtro daquele serviço ("Veículo"), com OPÇÕES ("Moto", "Carro").
 *
 * Especialidades, atributos e opções pertencem a UM serviço (FK composta com `servico_id`): "Moto" de
 * Entrega e "Moto" de Transporte de passageiros são linhas diferentes — motoboy = Entrega + Moto,
 * mototáxi = Transporte de passageiros + Moto, sem entidade "motoboy" nem vazamento entre serviços.
 *
 * Nada disso é fixo em código: as linhas são dados, administráveis no futuro Gestor da Plataforma.
 * `ativo`/`ativa` desliga sem apagar (perfis existentes continuam referenciando).
 */

const slugValido = (coluna: unknown) => sql`${coluna} ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(${coluna}) between 2 and 60`;
const nomeValido = (coluna: unknown) => sql`char_length(${coluna}) between 1 and 80 and ${coluna} = btrim(${coluna})`;

const datas = {
  criadoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const categoriasProfissionais = pgTable(
  "categorias_profissionais",
  {
    id: uuid().primaryKey().default(sql`uuidv7()`),
    slug: text().notNull(),
    nome: text().notNull(),
    ativa: boolean().notNull().default(true),
    ordem: integer().notNull().default(0),
    ...datas,
  },
  (tabela) => [
    uniqueIndex("categorias_profissionais_slug_unico").on(tabela.slug),
    check("categorias_profissionais_slug_valido", slugValido(tabela.slug)),
    check("categorias_profissionais_nome_valido", nomeValido(tabela.nome)),
  ],
);

export const servicosProfissionais = pgTable(
  "servicos_profissionais",
  {
    id: uuid().primaryKey().default(sql`uuidv7()`),
    categoriaId: uuid()
      .notNull()
      .references(() => categoriasProfissionais.id, { onDelete: "restrict" }),
    slug: text().notNull(),
    nome: text().notNull(),
    ativo: boolean().notNull().default(true),
    ordem: integer().notNull().default(0),
    ...datas,
  },
  (tabela) => [
    uniqueIndex("servicos_profissionais_slug_unico").on(tabela.slug),
    index("servicos_profissionais_categoria_idx").on(tabela.categoriaId),
    check("servicos_profissionais_slug_valido", slugValido(tabela.slug)),
    check("servicos_profissionais_nome_valido", nomeValido(tabela.nome)),
  ],
);

export const especialidadesServico = pgTable(
  "especialidades_servico",
  {
    id: uuid().primaryKey().default(sql`uuidv7()`),
    servicoId: uuid()
      .notNull()
      .references(() => servicosProfissionais.id, { onDelete: "restrict" }),
    slug: text().notNull(),
    nome: text().notNull(),
    ativa: boolean().notNull().default(true),
    ordem: integer().notNull().default(0),
    ...datas,
  },
  (tabela) => [
    uniqueIndex("especialidades_servico_slug_unico").on(tabela.servicoId, tabela.slug),
    // Alvo das FKs compostas: especialidade escolhida sempre do MESMO serviço.
    uniqueIndex("especialidades_servico_id_servico_unico").on(tabela.id, tabela.servicoId),
    check("especialidades_servico_slug_valido", slugValido(tabela.slug)),
    check("especialidades_servico_nome_valido", nomeValido(tabela.nome)),
  ],
);

// "unica": no máximo uma opção por serviço do perfil (ex.: faixa); "multipla": várias (ex.: veículos).
export const tipoSelecaoAtributo = pgEnum("tipo_selecao_atributo", ["unica", "multipla"]);

export const atributosServico = pgTable(
  "atributos_servico",
  {
    id: uuid().primaryKey().default(sql`uuidv7()`),
    servicoId: uuid()
      .notNull()
      .references(() => servicosProfissionais.id, { onDelete: "restrict" }),
    slug: text().notNull(),
    nome: text().notNull(),
    tipoSelecao: tipoSelecaoAtributo().notNull().default("multipla"),
    ativo: boolean().notNull().default(true),
    ordem: integer().notNull().default(0),
    ...datas,
  },
  (tabela) => [
    uniqueIndex("atributos_servico_slug_unico").on(tabela.servicoId, tabela.slug),
    uniqueIndex("atributos_servico_id_servico_unico").on(tabela.id, tabela.servicoId),
    check("atributos_servico_slug_valido", slugValido(tabela.slug)),
    check("atributos_servico_nome_valido", nomeValido(tabela.nome)),
  ],
);

export const opcoesAtributo = pgTable(
  "opcoes_atributo",
  {
    id: uuid().primaryKey().default(sql`uuidv7()`),
    atributoId: uuid().notNull(),
    // Redundante de propósito: permite FK composta garantindo que a opção é do serviço escolhido.
    servicoId: uuid().notNull(),
    slug: text().notNull(),
    nome: text().notNull(),
    ativa: boolean().notNull().default(true),
    ordem: integer().notNull().default(0),
    ...datas,
  },
  (tabela) => [
    foreignKey({
      name: "opcoes_atributo_atributo_do_servico_fk",
      columns: [tabela.atributoId, tabela.servicoId],
      foreignColumns: [atributosServico.id, atributosServico.servicoId],
    }).onDelete("restrict"),
    uniqueIndex("opcoes_atributo_slug_unico").on(tabela.atributoId, tabela.slug),
    uniqueIndex("opcoes_atributo_id_servico_unico").on(tabela.id, tabela.servicoId),
    check("opcoes_atributo_slug_valido", slugValido(tabela.slug)),
    check("opcoes_atributo_nome_valido", nomeValido(tabela.nome)),
  ],
);

/**
 * DICIONÁRIO DE BUSCA: termos (nome, sinônimos, apelidos populares) que levam a um serviço — e,
 * opcionalmente, a uma especialidade ou opção dele ("motoboy" → Entrega + Moto; "pós obra" → Limpeza +
 * pós-obra). A busca textual procura AQUI, uma tabela pequena, e não entre os profissionais.
 * `termo_normalizado` é gerado pelo banco com `jaa_normalizar` (sem acento, minúsculo), com GIN de
 * trigramas. `termo_compacto` é o normalizado SEM espaço nem pontuação: "Motoboy", "moto boy" e
 * "MOTO-BOY" são a MESMA grafia, sem uma linha para cada. Só absorve diferença de escrita — não é
 * sinônimo nem semântica ("moto" continua não sendo "motoboy"). Sem IA: um termo novo é uma linha nova.
 */
export const termosBuscaServico = pgTable(
  "termos_busca_servico",
  {
    id: uuid().primaryKey().default(sql`uuidv7()`),
    servicoId: uuid()
      .notNull()
      .references(() => servicosProfissionais.id, { onDelete: "cascade" }),
    especialidadeId: uuid(),
    opcaoId: uuid(),
    termo: text().notNull(),
    termoNormalizado: text()
      .notNull()
      .generatedAlwaysAs(sql`jaa_normalizar(termo)`),
    termoCompacto: text()
      .notNull()
      .generatedAlwaysAs(sql`regexp_replace(jaa_normalizar(termo), '[^a-z0-9]', '', 'g')`),
    criadoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (tabela) => [
    foreignKey({
      name: "termos_busca_servico_especialidade_do_servico_fk",
      columns: [tabela.especialidadeId, tabela.servicoId],
      foreignColumns: [especialidadesServico.id, especialidadesServico.servicoId],
    }).onDelete("cascade"),
    foreignKey({
      name: "termos_busca_servico_opcao_do_servico_fk",
      columns: [tabela.opcaoId, tabela.servicoId],
      foreignColumns: [opcoesAtributo.id, opcoesAtributo.servicoId],
    }).onDelete("cascade"),
    // O mesmo termo pode levar a serviços diferentes ("moto"), mas não se repete para o mesmo alvo.
    unique("termos_busca_servico_unico")
      .on(tabela.termoNormalizado, tabela.servicoId, tabela.especialidadeId, tabela.opcaoId)
      .nullsNotDistinct(),
    index("termos_busca_servico_trgm").using("gin", tabela.termoNormalizado.op("gin_trgm_ops")),
    // Correspondência EXATA pela grafia compacta (igualdade: B-tree basta).
    index("termos_busca_servico_compacto_idx").on(tabela.termoCompacto),
    check("termos_busca_servico_termo_valido", sql`char_length(btrim(${tabela.termo})) between 1 and 80`),
  ],
);
