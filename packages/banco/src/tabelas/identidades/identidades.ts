import { sql } from "drizzle-orm";
import { check, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "../autenticacao/better-auth.js";
import { empresas } from "../empresas/empresas.js";

// Quem age no Jaa. "pessoal": pertence a uma conta. "empresarial": pertence a uma empresa e é operada
// por membros autorizados (membros_empresa). Conversas e mensagens referenciam só a identidade.
export const tipoIdentidade = pgEnum("tipo_identidade", ["pessoal", "empresarial"]);

export const identidades = pgTable(
  "identidades",
  {
    id: uuid().primaryKey().defaultRandom(),
    // Dono da identidade — exatamente um, conforme o tipo (constraint identidades_dono_por_tipo):
    // pessoal → conta autenticável (Better Auth); empresarial → empresa.
    usuarioId: text().references(() => users.id, { onDelete: "restrict" }),
    empresaId: uuid().references(() => empresas.id, { onDelete: "restrict" }),
    tipo: tipoIdentidade().notNull(),
    nomeExibicao: text().notNull(),
    // Sempre armazenado na forma canônica minúscula; ver normalizarNomeUsuario em @jaa/contratos.
    nomeUsuario: text().notNull(),
    criadoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (tabela) => [
    uniqueIndex("identidades_nome_usuario_unico").on(tabela.nomeUsuario),
    // Exatamente uma identidade pessoal por conta, garantido pelo banco.
    uniqueIndex("identidades_pessoal_por_usuario_unico")
      .on(tabela.usuarioId)
      .where(sql`${tabela.tipo} = 'pessoal'`),
    // Uma identidade empresarial por empresa nesta fase.
    uniqueIndex("identidades_empresarial_por_empresa_unico")
      .on(tabela.empresaId)
      .where(sql`${tabela.empresaId} is not null`),
    // Comparação como texto: permite criar esta regra na mesma migration que adiciona o valor ao enum.
    check(
      "identidades_dono_por_tipo",
      sql`(${tabela.tipo}::text = 'pessoal' and ${tabela.usuarioId} is not null and ${tabela.empresaId} is null) or (${tabela.tipo}::text = 'empresarial' and ${tabela.empresaId} is not null and ${tabela.usuarioId} is null)`,
    ),
    // Formato canônico: minúsculas impedem duplicidade por variação de maiúsculas.
    check("identidades_nome_usuario_formato", sql`${tabela.nomeUsuario} ~ '^[a-z][a-z0-9_]{2,29}$'`),
    check(
      "identidades_nome_exibicao_valido",
      sql`char_length(${tabela.nomeExibicao}) between 1 and 50 and ${tabela.nomeExibicao} = btrim(${tabela.nomeExibicao})`,
    ),
  ],
);
