import { sql } from "drizzle-orm";
import { boolean, check, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

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
    /*
     * Fuso (IANA) em que a OPERAÇÃO da empresa acontece: é por ele que um instante vira o "dia de
     * hoje" da empresa (ex.: qual programação semanal do cardápio vale agora) — nunca pelo relógio de
     * quem está comprando. O horário de funcionamento usa o mesmo fuso.
     */
    // Mantido em sincronia com FUSO_HORARIO_PADRAO em @jaa/contratos.
    fusoHorario: text().notNull().default("America/Sao_Paulo"),
    /*
     * A empresa CONTROLA horário de funcionamento? Falso (padrão) = recebe pedidos a qualquer hora —
     * é o comportamento de toda empresa que nunca configurou horário, e de todas as que existiam
     * antes desta coluna. Ligado, valem os períodos de `periodos_funcionamento_empresa` (sem período
     * nenhum = sempre fechada). Desligar não apaga os períodos.
     */
    horarioFuncionamentoAtivo: boolean().notNull().default(false),
    criadoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (tabela) => [
    uniqueIndex("empresas_slug_unico").on(tabela.slug),
    // Mantido em sincronia com slugEmpresaSchema em @jaa/contratos.
    check("empresas_fuso_horario_valido", sql`char_length(${tabela.fusoHorario}) between 1 and 64`),
    check("empresas_slug_formato", sql`${tabela.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(${tabela.slug}) between 3 and 60`),
  ],
);
