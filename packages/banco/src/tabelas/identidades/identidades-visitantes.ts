import { sql } from "drizzle-orm";
import { check, index, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { identidades } from "./identidades.js";

/**
 * IDENTIDADE VISITANTE: quem abriu o Link do Jaa sem conta e começou a conversar.
 *
 * A identidade continua sendo PESSOAL (o tipo não muda) e pertence a uma conta TEMPORÁRIA do Better
 * Auth (`users.is_anonymous`). Esta linha é o que a torna visitante — e enquanto ela existir a
 * identidade NÃO conta como "a identidade pessoal da conta" em lugar nenhum: sem ela, rotas de conta
 * (pedido, empresa, perfil profissional, contatos...) respondem "conta necessária".
 *
 * Estados (um só por vez):
 * - ATIVA: `convertida_em` e `encerrada_em` nulos. Expira após 24 h sem atividade (`ultima_atividade_em`);
 * - CONVERTIDA: a pessoa criou conta. A identidade já é da conta nova; falta só escolher nome e
 *   @usuario definitivos — quando isso acontece, esta linha some (expiração cancelada para sempre);
 * - ENCERRADA: expirou, mas há histórico com outras identidades. A identidade fica só como AUTORA das
 *   mensagens que os outros já receberam (sem sessão, sem como entrar); nada do histórico some.
 */
export const identidadesVisitantes = pgTable(
  "identidades_visitantes",
  {
    identidadeId: uuid()
      .primaryKey()
      .references(() => identidades.id, { onDelete: "cascade" }),
    // Relógio do BANCO: a expiração nunca depende do relógio de cliente nenhum.
    ultimaAtividadeEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
    convertidaEm: timestamp({ withTimezone: true }),
    encerradaEm: timestamp({ withTimezone: true }),
    criadoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (tabela) => [
    check("identidades_visitantes_um_estado", sql`${tabela.convertidaEm} is null or ${tabela.encerradaEm} is null`),
    // A rotina de expiração procura só as ATIVAS mais antigas.
    index("identidades_visitantes_ativas_idx")
      .on(tabela.ultimaAtividadeEm)
      .where(sql`${tabela.convertidaEm} is null and ${tabela.encerradaEm} is null`),
  ],
);
