import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, pgTable, primaryKey, smallint, text, time, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { colunaPontoGeografico, expressaoGeografica } from "../../geoespacial.js";
import { identidades, tipoIdentidade } from "../identidades/identidades.js";
import { especialidadesServico, opcoesAtributo, servicosProfissionais } from "./taxonomia.js";

const datas = {
  criadoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/**
 * PERFIL PROFISSIONAL: uma CAPACIDADE da identidade PESSOAL (1:1), nunca uma conta nova nem uma
 * empresa. O banco garante que só identidade pessoal tem perfil (FK composta com o tipo).
 *
 * Nasce inativo; ativar exige base confirmada, ao menos um serviço e uma área (regra do servidor).
 */
export const perfisProfissionais = pgTable(
  "perfis_profissionais",
  {
    id: uuid().primaryKey().default(sql`uuidv7()`),
    identidadeId: uuid().notNull(),
    identidadeTipo: tipoIdentidade().notNull().default("pessoal"),
    ativo: boolean().notNull().default(false),
    ativadoEm: timestamp({ withTimezone: true }),
    /*
     * "Oportunidades de outras regiões — Quero receber / Não quero receber". Só vale para
     * OPORTUNIDADES de empresas (que usam a área DELAS); solicitações normais sempre respeitam a área
     * do profissional. Começa FALSE: ninguém recebe fora da própria área sem ter escolhido.
     */
    recebeOportunidadesOutrasRegioes: boolean().notNull().default(false),
    /*
     * Fuso (IANA) em que os HORÁRIOS DE ATENDIMENTO do perfil são interpretados: um instante vira dia e
     * hora locais por aqui antes de comparar com a grade. O padrão vem do Brasil, mas é dado do perfil
     * (Manaus, Rio Branco…); a validade do nome é conferida pelo servidor.
     */
    // Mantido em sincronia com FUSO_HORARIO_PADRAO em @jaa/contratos.
    fusoHorario: text().notNull().default("America/Sao_Paulo"),
    ...datas,
  },
  (tabela) => [
    uniqueIndex("perfis_profissionais_identidade_unico").on(tabela.identidadeId),
    foreignKey({
      name: "perfis_profissionais_identidade_pessoal_fk",
      columns: [tabela.identidadeId, tabela.identidadeTipo],
      foreignColumns: [identidades.id, identidades.tipo],
    }).onDelete("cascade"),
    check("perfis_profissionais_somente_pessoal", sql`${tabela.identidadeTipo}::text = 'pessoal'`),
    check("perfis_profissionais_ativacao_coerente", sql`not ${tabela.ativo} or ${tabela.ativadoEm} is not null`),
    check("perfis_profissionais_fuso_horario_valido", sql`char_length(${tabela.fusoHorario}) between 1 and 64`),
  ],
);

/**
 * BASE PROFISSIONAL: endereço ESTÁVEL de referência (não é a localização atual do aparelho, que é
 * dinâmica e nunca é guardada aqui). Mesmas regras do endereço do cliente: o texto é de quem cadastra,
 * a coordenada só existe após confirmação explícita no mapa e mudar campo estrutural a derruba.
 *
 * DADO PRIVADO: o ponto serve ao matching (raio a partir da base, distância). Nenhuma resposta pública
 * devolve endereço ou coordenada — no máximo cidade/UF e distância arredondada.
 * `codigo_ibge` é o que a consulta de CEP informou (preenchimento); a autoridade territorial para
 * matching é o PONTO confirmado.
 */
export const basesProfissionais = pgTable(
  "bases_profissionais",
  {
    perfilId: uuid()
      .primaryKey()
      .references(() => perfisProfissionais.id, { onDelete: "cascade" }),
    cep: text().notNull(),
    logradouro: text().notNull(),
    numero: text().notNull(),
    complemento: text(),
    bairro: text().notNull(),
    cidade: text().notNull(),
    uf: text().notNull(),
    pontoReferencia: text(),
    codigoIbge: text(),
    ponto: colunaPontoGeografico(),
    localizacaoConfirmadaEm: timestamp({ withTimezone: true }),
    ...datas,
  },
  (tabela) => [
    // Raio/distância a partir da base: GiST na expressão geography (estratégia do Bloco 1).
    index("bases_profissionais_ponto_gist").using("gist", expressaoGeografica(tabela.ponto)).where(sql`${tabela.ponto} is not null`),
    check(
      "bases_profissionais_localizacao_completa",
      sql`(${tabela.ponto} is null) = (${tabela.localizacaoConfirmadaEm} is null)`,
    ),
    check("bases_profissionais_uf_valida", sql`${tabela.uf} ~ '^[A-Z]{2}$'`),
    check("bases_profissionais_cep_valido", sql`${tabela.cep} ~ '^[0-9]{8}$'`),
    check("bases_profissionais_codigo_ibge_valido", sql`${tabela.codigoIbge} is null or ${tabela.codigoIbge} ~ '^[0-9]{7}$'`),
    check(
      "bases_profissionais_textos_validos",
      sql`char_length(${tabela.logradouro}) between 1 and 120 and char_length(${tabela.numero}) between 1 and 20 and char_length(${tabela.bairro}) between 1 and 80 and char_length(${tabela.cidade}) between 1 and 80 and (${tabela.complemento} is null or char_length(${tabela.complemento}) between 1 and 60) and (${tabela.pontoReferencia} is null or char_length(${tabela.pontoReferencia}) between 1 and 160)`,
    ),
  ],
);

/**
 * SERVIÇO DO PERFIL: o que ESTE profissional oferece. Linhas (não colunas servico_1..3): o limite da
 * versão atual (3) é regra do servidor, configurável depois sem mudar o banco.
 * A disponibilidade vem dos HORÁRIOS DE ATENDIMENTO deste serviço (`periodos_atendimento`).
 */
export const servicosPerfil = pgTable(
  "servicos_perfil",
  {
    id: uuid().primaryKey().default(sql`uuidv7()`),
    perfilId: uuid()
      .notNull()
      .references(() => perfisProfissionais.id, { onDelete: "cascade" }),
    servicoId: uuid()
      .notNull()
      .references(() => servicosProfissionais.id, { onDelete: "restrict" }),
    /*
     * O profissional aceita que este serviço use a AGENDA (futura): clientes poderão reservar dentro dos
     * horários de atendimento. Só uma permissão — não cria horário reservável nem reserva. Começa NÃO.
     */
    permiteAgendamento: boolean().notNull().default(false),
    ...datas,
  },
  (tabela) => [
    // O mesmo serviço não se repete no perfil.
    uniqueIndex("servicos_perfil_servico_por_perfil_unico").on(tabela.perfilId, tabela.servicoId),
    // Alvos das FKs compostas (escolhas do mesmo serviço; vínculo de área do mesmo perfil).
    uniqueIndex("servicos_perfil_id_servico_unico").on(tabela.id, tabela.servicoId),
    uniqueIndex("servicos_perfil_id_perfil_unico").on(tabela.id, tabela.perfilId),
    // Matching: "quem oferece este serviço?".
    index("servicos_perfil_servico_idx").on(tabela.servicoId, tabela.perfilId),
  ],
);

// Especialidades escolhidas — só do MESMO serviço (FK composta), nunca vazam para outro serviço.
export const especialidadesServicoPerfil = pgTable(
  "especialidades_servico_perfil",
  {
    servicoPerfilId: uuid().notNull(),
    servicoId: uuid().notNull(),
    especialidadeId: uuid().notNull(),
  },
  (tabela) => [
    primaryKey({ name: "especialidades_servico_perfil_pk", columns: [tabela.servicoPerfilId, tabela.especialidadeId] }),
    foreignKey({
      name: "especialidades_servico_perfil_servico_perfil_fk",
      columns: [tabela.servicoPerfilId, tabela.servicoId],
      foreignColumns: [servicosPerfil.id, servicosPerfil.servicoId],
    }).onDelete("cascade"),
    foreignKey({
      name: "especialidades_servico_perfil_especialidade_fk",
      columns: [tabela.especialidadeId, tabela.servicoId],
      foreignColumns: [especialidadesServico.id, especialidadesServico.servicoId],
    }).onDelete("restrict"),
  ],
);

// Opções de atributo escolhidas — só do MESMO serviço (FK composta).
export const opcoesServicoPerfil = pgTable(
  "opcoes_servico_perfil",
  {
    servicoPerfilId: uuid().notNull(),
    servicoId: uuid().notNull(),
    opcaoId: uuid().notNull(),
  },
  (tabela) => [
    primaryKey({ name: "opcoes_servico_perfil_pk", columns: [tabela.servicoPerfilId, tabela.opcaoId] }),
    foreignKey({
      name: "opcoes_servico_perfil_servico_perfil_fk",
      columns: [tabela.servicoPerfilId, tabela.servicoId],
      foreignColumns: [servicosPerfil.id, servicosPerfil.servicoId],
    }).onDelete("cascade"),
    foreignKey({
      name: "opcoes_servico_perfil_opcao_fk",
      columns: [tabela.opcaoId, tabela.servicoId],
      foreignColumns: [opcoesAtributo.id, opcoesAtributo.servicoId],
    }).onDelete("restrict"),
  ],
);

/**
 * HORÁRIOS DE ATENDIMENTO de um serviço do perfil: grade semanal, zero ou mais períodos por dia.
 * Dia sem período = não atende. 24 h = 00:00–24:00. Horas LOCAIS (fuso do perfil); fim exclusivo.
 * Nascem com o serviço (segunda a sexta, 08:00–18:00) e o profissional altera depois.
 *
 * Sobreposição no mesmo serviço/dia é recusada pelo TRIGGER `periodos_atendimento_sem_sobreposicao`
 * (migration 0033), que trava a linha do serviço para duas gravações simultâneas não se cruzarem.
 */
export const periodosAtendimento = pgTable(
  "periodos_atendimento",
  {
    id: uuid().primaryKey().default(sql`uuidv7()`),
    servicoPerfilId: uuid()
      .notNull()
      .references(() => servicosPerfil.id, { onDelete: "cascade" }),
    // ISO 8601: 1 = segunda … 7 = domingo (igual a extract(isodow …)).
    diaSemana: smallint().notNull(),
    inicio: time().notNull(),
    fim: time().notNull(),
  },
  (tabela) => [
    // Dois períodos do mesmo dia nunca começam juntos (e a consulta "atende às X?" usa este índice).
    uniqueIndex("periodos_atendimento_inicio_unico").on(tabela.servicoPerfilId, tabela.diaSemana, tabela.inicio),
    check("periodos_atendimento_dia_valido", sql`${tabela.diaSemana} between 1 and 7`),
    check("periodos_atendimento_inicio_antes_do_fim", sql`${tabela.inicio} < ${tabela.fim}`),
    check("periodos_atendimento_fim_ate_24h", sql`${tabela.fim} <= '24:00'::time`),
    check("periodos_atendimento_minutos_inteiros", sql`extract(second from ${tabela.inicio}) = 0 and extract(second from ${tabela.fim}) = 0`),
  ],
);
