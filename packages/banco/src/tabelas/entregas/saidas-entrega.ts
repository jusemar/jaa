import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "../autenticacao/better-auth.js";
import { empresas } from "../empresas/empresas.js";
import { entregadoresEmpresa } from "./entregadores-empresa.js";
import { zonasEntrega } from "./zonas-entrega.js";

/*
 * em_formacao → a automação ainda está juntando pedidos daquela zona (único estado que aceita pedido);
 * aguardando_entregador → fechada por quantidade ou tempo, mas ninguém elegível na fila da base;
 * preparada  → tem entregador reservado e os pedidos ainda estão na loja;
 * em_andamento → o entregador saiu com os pedidos;
 * concluida  → todas as paradas terminaram (entregues ou canceladas).
 * É o estado da OPERAÇÃO, não do pedido: cada pedido continua com a sua própria máquina de estados.
 * A saída montada à mão pela empresa nasce direto em "preparada".
 */
export const statusSaidaEntrega = pgEnum("status_saida_entrega", ["em_formacao", "aguardando_entregador", "preparada", "em_andamento", "concluida"]);

/*
 * percurso_real → geometria/distância/duração vieram do provedor de rotas para a ordem atual;
 * aproximacao_local → só a ordem determinística local; nada de números ou traçado inventados.
 */
export const estadoRotaSaida = pgEnum("estado_rota_saida", ["percurso_real", "aproximacao_local"]);

/**
 * SAÍDA DE ENTREGA: uma operação real — um entregador saindo com VÁRIOS pedidos de UMA empresa.
 *
 * Uma saída nunca mistura empresas: se a mesma pessoa também leva pedidos de outra, aquilo é outra
 * saída, invisível para esta empresa. `versao_sequencia` protege a reordenação contra tela velha.
 */
export const saidasEntrega = pgTable(
  "saidas_entrega",
  {
    // UUIDv7: ordem cronológica das saídas.
    id: uuid().primaryKey().default(sql`uuidv7()`),
    empresaId: uuid()
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    /*
     * Vínculo de entregador (não a conta): garante que quem leva é entregador DESTA empresa.
     * Nulo enquanto a saída está em formação ou aguardando alguém elegível na fila da base.
     */
    entregadorId: uuid().references(() => entregadoresEmpresa.id, { onDelete: "restrict" }),
    status: statusSaidaEntrega().notNull().default("preparada"),
    // Zona que originou a saída; as outras (combinação autorizada) são derivadas das paradas.
    zonaPrincipalId: uuid().references(() => zonasEntrega.id, { onDelete: "set null" }),
    /*
     * ROTA da saída (motor de rotas do Jaa). A ORIGEM é um SNAPSHOT do ponto da base no momento do
     * planejamento: mudar a base depois não reescreve o que já foi planejado ou percorrido.
     * Geometria, distância e duração só existem quando um provedor real calculou — nunca estimadas
     * pelo Jaa. `rotaVersaoSequencia` diz para qual ordem o percurso vale (reordenar o envelhece).
     */
    origemLatitude: numeric({ precision: 9, scale: 6, mode: "number" }),
    origemLongitude: numeric({ precision: 9, scale: 6, mode: "number" }),
    rotaEstado: estadoRotaSaida(),
    rotaMotivoFallback: text(),
    rotaProvedor: text(),
    rotaSequenciaDoProvedor: boolean().notNull().default(false),
    rotaGeometria: jsonb(),
    rotaDistanciaMetros: integer(),
    rotaDuracaoSegundos: integer(),
    rotaCalculadaEm: timestamp({ withTimezone: true }),
    rotaVersaoSequencia: integer(),
    // Montada pela automação (a criação manual do gestor continua existindo e nasce preparada).
    automatica: boolean().notNull().default(false),
    // Incrementa a cada mudança da sequência; quem salva manda a versão que viu.
    versaoSequencia: integer().notNull().default(1),
    // Auditoria interna: quem da empresa montou a saída (nunca exposto ao cliente).
    criadaPorUsuarioId: text().references(() => users.id, { onDelete: "set null" }),
    criadoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /*
     * Relógio da formação: começa no PRIMEIRO pedido incluído. O prazo é PERSISTIDO (não vive num
     * timer em memória), então reiniciar a API não faz a saída perder o vencimento.
     */
    formacaoIniciadaEm: timestamp({ withTimezone: true }),
    prazoFormacaoEm: timestamp({ withTimezone: true }),
    // Fechada = congelada: por quantidade, por tempo ou pelo gestor. Depois disso não entra pedido.
    fechadaEm: timestamp({ withTimezone: true }),
    atribuidaEm: timestamp({ withTimezone: true }),
    iniciadaEm: timestamp({ withTimezone: true }),
    concluidaEm: timestamp({ withTimezone: true }),
    atualizadoEm: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (tabela) => [
    // Alvo da FK composta das paradas: parada e saída sempre da MESMA empresa.
    uniqueIndex("saidas_entrega_id_empresa_id_unico").on(tabela.id, tabela.empresaId),
    // "Saídas desta empresa" e "saídas deste entregador", das mais recentes para as mais antigas.
    index("saidas_entrega_empresa_id_id_idx").on(tabela.empresaId, tabela.id),
    index("saidas_entrega_entregador_id_id_idx").on(tabela.entregadorId, tabela.id),
    // O entregador é DESTA empresa (nada de levar pedido de uma empresa com vínculo de outra).
    foreignKey({
      name: "saidas_entrega_entregador_da_empresa_fk",
      columns: [tabela.entregadorId, tabela.empresaId],
      foreignColumns: [entregadoresEmpresa.id, entregadoresEmpresa.empresaId],
    }).onDelete("restrict"),
    /*
     * UMA saída em formação por zona: o próximo pedido daquela zona entra na que já existe, em vez de
     * abrir várias abertas ao mesmo tempo. Cheia, ela fecha na hora e libera a zona para a seguinte.
     */
    // `fechada_em is null` é exatamente "em formação" (garantido pelo CHECK abaixo) e, ao contrário
    // da comparação com o enum, é imutável — requisito de predicado de índice no PostgreSQL.
    uniqueIndex("saidas_entrega_formacao_por_zona_unico")
      .on(tabela.empresaId, tabela.zonaPrincipalId)
      .where(sql`${tabela.fechadaEm} is null`),
    index("saidas_entrega_prazo_formacao_idx").on(tabela.prazoFormacaoEm).where(sql`${tabela.fechadaEm} is null`),
    // A zona é DESTA empresa (uma empresa jamais agrupa pedidos pela zona de outra).
    foreignKey({
      name: "saidas_entrega_zona_da_empresa_fk",
      columns: [tabela.zonaPrincipalId, tabela.empresaId],
      foreignColumns: [zonasEntrega.id, zonasEntrega.empresaId],
    }).onDelete("set null"),
    // Só sai da loja quem já tem entregador reservado.
    check(
      "saidas_entrega_entregador_por_status",
      sql`${tabela.entregadorId} is not null or ${tabela.status} in ('em_formacao', 'aguardando_entregador', 'concluida')`,
    ),
    check("saidas_entrega_atribuida_com_entregador", sql`${tabela.atribuidaEm} is null or ${tabela.entregadorId} is not null`),
    /*
     * Fechada = congelada para novos pedidos. Só a saída EM FORMAÇÃO não tem data de fechamento — a
     * montada à mão já nasce fechada, porque nasce com os pedidos que o gestor escolheu.
     */
    check("saidas_entrega_fechada_por_status", sql`(${tabela.status} = 'em_formacao') = (${tabela.fechadaEm} is null)`),
    // Em formação ou aguardando entregador ninguém saiu; concluída pode ter terminado sem sair.
    check("saidas_entrega_iniciada_por_status", sql`${tabela.iniciadaEm} is null or ${tabela.status} in ('em_andamento', 'concluida')`),
    check("saidas_entrega_concluida_por_status", sql`(${tabela.status} = 'concluida') = (${tabela.concluidaEm} is not null)`),
    check("saidas_entrega_versao_valida", sql`${tabela.versaoSequencia} >= 1`),
    // Origem é tudo-ou-nada, como todo ponto confirmado no Jaa.
    check(
      "saidas_entrega_origem_completa",
      sql`(${tabela.origemLatitude} is null) = (${tabela.origemLongitude} is null)`,
    ),
    // Números e traçado só existem com percurso REAL: em fallback, nada é inventado.
    check(
      "saidas_entrega_percurso_por_estado",
      sql`${tabela.rotaEstado} is distinct from 'aproximacao_local' or (${tabela.rotaGeometria} is null and ${tabela.rotaDistanciaMetros} is null and ${tabela.rotaDuracaoSegundos} is null)`,
    ),
  ],
);
