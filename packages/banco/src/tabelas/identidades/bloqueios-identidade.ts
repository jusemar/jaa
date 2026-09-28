import { sql } from "drizzle-orm";
import { check, foreignKey, index, pgTable, primaryKey, timestamp, uuid } from "drizzle-orm/pg-core";
import { identidades, tipoIdentidade } from "./identidades.js";

/**
 * BLOQUEIO DE COMUNICAÇÃO entre PESSOAS: "eu bloqueei esta pessoa".
 *
 * - É uma decisão UNILATERAL de quem bloqueia (só ele desfaz), mas o efeito vale NOS DOIS SENTIDOS:
 *   com a linha A→B, nem A manda para B nem B manda para A. Se B também bloquear A, são duas linhas,
 *   e cada um só remove a sua;
 * - bloqueia MENSAGEM, não OPERAÇÃO: pedido, entrega, fila, rastreamento e despacho não olham esta
 *   tabela. A mesma pessoa pode continuar sendo cliente ou entregador da outra;
 * - só identidades PESSOAIS (FK composta com o tipo + CHECK): empresa é outra identidade e não é
 *   bloqueada por tabela nenhuma daqui sem decisão de produto;
 * - não é a exceção de privacidade (`excecoes_privacidade`), que decide quem VÊ o perfil.
 */
export const bloqueiosIdentidade = pgTable(
  "bloqueios_identidade",
  {
    bloqueadorIdentidadeId: uuid().notNull(),
    bloqueadorTipo: tipoIdentidade().notNull().default("pessoal"),
    bloqueadoIdentidadeId: uuid().notNull(),
    bloqueadoTipo: tipoIdentidade().notNull().default("pessoal"),
    criadoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (tabela) => [
    primaryKey({ columns: [tabela.bloqueadorIdentidadeId, tabela.bloqueadoIdentidadeId] }),
    foreignKey({
      name: "bloqueios_identidade_bloqueador_pessoal_fk",
      columns: [tabela.bloqueadorIdentidadeId, tabela.bloqueadorTipo],
      foreignColumns: [identidades.id, identidades.tipo],
    }).onDelete("cascade"),
    foreignKey({
      name: "bloqueios_identidade_bloqueado_pessoal_fk",
      columns: [tabela.bloqueadoIdentidadeId, tabela.bloqueadoTipo],
      foreignColumns: [identidades.id, identidades.tipo],
    }).onDelete("cascade"),
    // "Alguém bloqueou esta pessoa?" — o outro sentido da checagem, usado a cada envio.
    index("bloqueios_identidade_bloqueado_idx").on(tabela.bloqueadoIdentidadeId, tabela.bloqueadorIdentidadeId),
    check("bloqueios_identidade_somente_pessoas", sql`${tabela.bloqueadorTipo}::text = 'pessoal' and ${tabela.bloqueadoTipo}::text = 'pessoal'`),
    check("bloqueios_identidade_nao_e_voce", sql`${tabela.bloqueadorIdentidadeId} <> ${tabela.bloqueadoIdentidadeId}`),
  ],
);
