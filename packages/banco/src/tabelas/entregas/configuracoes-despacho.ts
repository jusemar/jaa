import { sql } from "drizzle-orm";
import { boolean, check, integer, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { empresas } from "../empresas/empresas.js";

/**
 * AUTOMAÇÃO DAS ENTREGAS, por empresa. Quantidade e tempo são CONFIGURAÇÃO de cada operação: uma
 * pizzaria pode fechar a saída com 5 pedidos em 15 minutos e outra com 2 em 5 — nada aqui é regra
 * universal do Jaa. A linha só existe quando a empresa salva algo; o padrão vive nos contratos.
 */
export const configuracoesDespacho = pgTable(
  "configuracoes_despacho",
  {
    empresaId: uuid()
      .primaryKey()
      .references(() => empresas.id, { onDelete: "cascade" }),
    // A saída fecha quando chegar a este número de pedidos…
    maxPedidosPorSaida: integer().notNull().default(5),
    // …ou quando passar este tempo desde o PRIMEIRO pedido da formação, o que vier antes.
    tempoFormacaoMinutos: integer().notNull().default(15),
    // Permite considerar zonas explicitamente compatíveis quando o volume é baixo.
    combinarZonas: boolean().notNull().default(true),
    // Quando desligada, quantidade/tempo fecham e organizam a rota, mas o gestor ainda a libera.
    liberacaoAutomatica: boolean().notNull().default(true),
    criadoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (tabela) => [
    check("configuracoes_despacho_maximo_valido", sql`${tabela.maxPedidosPorSaida} between 1 and 15`),
    check("configuracoes_despacho_tempo_valido", sql`${tabela.tempoFormacaoMinutos} between 1 and 180`),
  ],
);
