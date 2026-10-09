import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./better-auth.js";

/**
 * DISPOSITIVO AUTORIZADO a entrar com PIN (tabela do Jaa, não do Better Auth).
 *
 * Uma linha = UMA conta em UM dispositivo/navegador. O PIN é do dispositivo, não da conta: quem sabe
 * só o PIN, em outro aparelho, não tem a credencial e não entra.
 *
 * NADA aqui está em claro:
 * - `credencial_hash`: SHA-256 da credencial aleatória (256 bits) que só o dispositivo guarda;
 * - `pin_hash`: hash forte (scrypt) de um valor derivado de PIN + credencial + segredo do servidor.
 *   Como a credencial em claro não está no banco, um vazamento do banco não permite testar os
 *   1.000.000 de PINs possíveis.
 *
 * BIOMETRIA (só no aplicativo): `biometria_hash` é o SHA-256 de um SEGUNDO segredo aleatório, que o
 * aparelho guarda protegido pela biometria do sistema. Nenhum dado biométrico existe aqui — só a
 * prova de que aquele aparelho liberou o segredo dele. Nulo = biometria não ativada neste dispositivo.
 *
 * A linha nunca é apagada pelo fluxo: revogar é preencher `revogado_em`.
 */
export const dispositivosAutorizados = pgTable(
  "dispositivos_autorizados",
  {
    id: uuid().primaryKey().default(sql`uuidv7()`),
    usuarioId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    credencialHash: text().notNull(),
    pinHash: text().notNull(),
    biometriaHash: text(),
    // Erros SEGUIDOS desde o último acerto; alimentam o bloqueio progressivo.
    tentativasErradas: integer().notNull().default(0),
    bloqueadoAte: timestamp({ withTimezone: true }),
    criadoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
    ultimoUsoEm: timestamp({ withTimezone: true }),
    revogadoEm: timestamp({ withTimezone: true }),
  },
  (tabela) => [
    // A credencial identifica a autorização (e, por ela, a conta): a busca do login é por aqui.
    uniqueIndex("dispositivos_autorizados_credencial_unica").on(tabela.credencialHash),
    uniqueIndex("dispositivos_autorizados_biometria_unica").on(tabela.biometriaHash).where(sql`${tabela.biometriaHash} is not null`),
    index("dispositivos_autorizados_usuario_idx").on(tabela.usuarioId),
    check("dispositivos_autorizados_tentativas_validas", sql`${tabela.tentativasErradas} >= 0`),
  ],
);
