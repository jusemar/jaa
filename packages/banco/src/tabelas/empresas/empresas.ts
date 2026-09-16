import { sql } from "drizzle-orm";
import { check, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

// Estados de operação da empresa. Novos estados (ex.: suspensa, encerrada) entram como novos valores.
export const statusEmpresa = pgEnum("status_empresa", ["ativa"]);

/**
 * Empresa = unidade de isolamento comercial (tenant lógico) em banco compartilhado.
 * Quem fala nas conversas é a IDENTIDADE EMPRESARIAL dela (identidades.empresa_id); o nome público
 * (nomeExibicao) e o @usuario vivem na identidade, sem cópia aqui, para não existirem duas fontes.
 * Quem pode operar a empresa está em membros_empresa; nunca em uma coluna "dono" nesta tabela.
 * Criação: empresa, identidade empresarial e proprietário na MESMA transação (garantido por trigger
 * de constraint diferido; ver migration 0007).
 */
export const empresas = pgTable(
  "empresas",
  {
    id: uuid().primaryKey().defaultRandom(),
    // Identificador PÚBLICO da futura loja (/loja/<slug>). Não autoriza nada: acesso usa ids e vínculos.
    slug: text().notNull(),
    status: statusEmpresa().notNull().default("ativa"),
    criadoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (tabela) => [
    uniqueIndex("empresas_slug_unico").on(tabela.slug),
    // Mantido em sincronia com slugEmpresaSchema em @jaa/contratos.
    check("empresas_slug_formato", sql`${tabela.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(${tabela.slug}) between 3 and 60`),
  ],
);
