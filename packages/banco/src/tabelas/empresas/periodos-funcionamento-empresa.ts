import { sql } from "drizzle-orm";
import { check, pgTable, smallint, time, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { empresas } from "./empresas.js";

/**
 * HORÁRIO DE FUNCIONAMENTO da empresa: os períodos em que ela RECEBE PEDIDOS, por dia da semana.
 * Zero ou mais períodos por dia (08:00–14:00 + 18:00–23:00); dia sem linha = fechado.
 *
 * `dia_semana` é ISO: 1 = segunda … 7 = domingo. As horas são LOCAIS da empresa
 * (`empresas.fuso_horario`), nunca UTC.
 *
 * MEIA-NOITE: `fim` menor ou igual a `inicio` significa que o período fecha no DIA SEGUINTE
 * (18:00–02:00). Ele pertence ao dia em que abre. Fechar exatamente à meia-noite é `24:00`.
 *
 * As linhas só valem com `empresas.horario_funcionamento_ativo` ligado; desligado, a empresa recebe
 * pedidos a qualquer hora e os períodos ficam guardados.
 *
 * Sobreposição não é conferida aqui: ela envolve dias vizinhos (o período que passa da meia-noite
 * invade o dia seguinte) e a semana é sempre gravada INTEIRA, numa transação, depois de validada por
 * `periodosFuncionamentoSchema` em @jaa/contratos.
 *
 * Conceito separado de `periodos_atendimento` (perfil profissional): lá é quando um profissional
 * atende um serviço; aqui é quando a empresa aceita pedido.
 */
export const periodosFuncionamentoEmpresa = pgTable(
  "periodos_funcionamento_empresa",
  {
    id: uuid().primaryKey().defaultRandom(),
    empresaId: uuid()
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    diaSemana: smallint().notNull(),
    inicio: time().notNull(),
    fim: time().notNull(),
    criadoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (tabela) => [
    // Também é o índice de "os períodos desta empresa" (começa por empresa_id).
    uniqueIndex("periodos_funcionamento_empresa_inicio_unico").on(tabela.empresaId, tabela.diaSemana, tabela.inicio),
    check("periodos_funcionamento_empresa_dia_valido", sql`${tabela.diaSemana} between 1 and 7`),
    check("periodos_funcionamento_empresa_inicio_valido", sql`${tabela.inicio} < '24:00'::time`),
    check("periodos_funcionamento_empresa_fim_valido", sql`${tabela.fim} > '00:00'::time and ${tabela.fim} <= '24:00'::time`),
    // Iguais não dizem nada (duração zero ou 24 h?): dia inteiro é 00:00–24:00.
    check("periodos_funcionamento_empresa_inicio_diferente_do_fim", sql`${tabela.inicio} <> ${tabela.fim}`),
    check("periodos_funcionamento_empresa_minutos_inteiros", sql`extract(second from ${tabela.inicio}) = 0 and extract(second from ${tabela.fim}) = 0`),
  ],
);
