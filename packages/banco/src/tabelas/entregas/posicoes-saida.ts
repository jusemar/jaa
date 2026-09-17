import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, numeric, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { entregadoresEmpresa } from "./entregadores-empresa.js";
import { saidasEntrega } from "./saidas-entrega.js";

/**
 * POSIÇÃO ATUAL do entregador numa saída EM ANDAMENTO — uma linha por saída, sempre a ÚLTIMA válida.
 *
 * Não é trilha: o Jaa guarda onde a operação está agora, não por onde ela passou. Histórico completo
 * de percurso continua fora de escopo (privacidade e volume), e a linha some quando a saída termina.
 *
 * `capturada_em` é o relógio do APARELHO (é o que diz se a posição é recente) e `recebida_em`, o do
 * servidor. A gravação só avança quando a captura é mais nova: pacote atrasado ou fora de ordem nunca
 * sobrescreve a posição atual.
 */
export const posicoesSaida = pgTable(
  "posicoes_saida",
  {
    saidaId: uuid()
      .primaryKey()
      .references(() => saidasEntrega.id, { onDelete: "cascade" }),
    // Empresa e entregador ficam aqui para o escopo valer no próprio dado, não só na consulta.
    empresaId: uuid().notNull(),
    entregadorId: uuid()
      .notNull()
      .references(() => entregadoresEmpresa.id, { onDelete: "cascade" }),
    latitude: numeric({ precision: 9, scale: 6, mode: "number" }).notNull(),
    longitude: numeric({ precision: 9, scale: 6, mode: "number" }).notNull(),
    precisaoMetros: integer(),
    velocidadeMetrosPorSegundo: numeric({ precision: 6, scale: 2, mode: "number" }),
    direcaoGraus: integer(),
    capturadaEm: timestamp({ withTimezone: true }).notNull(),
    recebidaEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (tabela) => [
    // A posição é DAQUELA saída e DAQUELA empresa: o banco não deixa misturar operações.
    foreignKey({
      name: "posicoes_saida_da_empresa_fk",
      columns: [tabela.saidaId, tabela.empresaId],
      foreignColumns: [saidasEntrega.id, saidasEntrega.empresaId],
    }).onDelete("cascade"),
    foreignKey({
      name: "posicoes_saida_entregador_da_empresa_fk",
      columns: [tabela.entregadorId, tabela.empresaId],
      foreignColumns: [entregadoresEmpresa.id, entregadoresEmpresa.empresaId],
    }).onDelete("cascade"),
    // "Quem está na rua agora?" — o painel operacional da empresa.
    index("posicoes_saida_empresa_idx").on(tabela.empresaId, tabela.capturadaEm),
    check("posicoes_saida_latitude_valida", sql`${tabela.latitude} between -90 and 90`),
    check("posicoes_saida_longitude_valida", sql`${tabela.longitude} between -180 and 180`),
    check("posicoes_saida_precisao_valida", sql`${tabela.precisaoMetros} is null or ${tabela.precisaoMetros} >= 0`),
    check("posicoes_saida_direcao_valida", sql`${tabela.direcaoGraus} is null or ${tabela.direcaoGraus} between 0 and 360`),
  ],
);
