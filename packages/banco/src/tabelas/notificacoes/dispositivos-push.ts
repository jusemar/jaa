import { sql } from "drizzle-orm";
import { index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sessions, users } from "../autenticacao/better-auth.js";

// Mantido em sincronia com PLATAFORMAS_PUSH em @jaa/contratos. iOS já previsto; hoje só o Android envia.
export const plataformaPush = pgEnum("plataforma_push", ["android", "ios"]);

/**
 * DISPOSITIVO PARA PUSH: uma INSTALAÇÃO do aplicativo, da CONTA que está logada nela.
 *
 * O token pertence à conta (nunca à identidade selecionada): quem recebe um aviso é resolvido na hora
 * do fato — identidade destinatária → contas que podem operá-la → dispositivos destas contas.
 *
 * - `instalacao_id`: gerado pelo aparelho e guardado nele (some ao desinstalar). Uma linha por
 *   instalação: trocar de conta no mesmo aparelho TRANSFERE a linha; reinstalar cria outra.
 * - `token`: Expo Push Token, único — o mesmo token nunca fica em duas contas.
 * - `sessao_id`: a sessão do Better Auth que registrou. Logout (sessão apagada) leva a linha junto;
 *   sessão vencida deixa de valer no envio (o envio só usa sessão ainda válida).
 * - `invalidado_em`: o provedor disse que o token morreu (ex.: app desinstalado); não envia mais.
 */
export const dispositivosPush = pgTable(
  "dispositivos_push",
  {
    id: uuid().primaryKey().default(sql`uuidv7()`),
    instalacaoId: uuid().notNull(),
    usuarioId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sessaoId: text()
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    token: text().notNull(),
    plataforma: plataformaPush().notNull(),
    criadoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
    invalidadoEm: timestamp({ withTimezone: true }),
  },
  (tabela) => [
    uniqueIndex("dispositivos_push_instalacao_unica").on(tabela.instalacaoId),
    uniqueIndex("dispositivos_push_token_unico").on(tabela.token),
    // Envio: dispositivos válidos das contas que podem operar a identidade destinatária.
    index("dispositivos_push_usuario_idx").on(tabela.usuarioId).where(sql`${tabela.invalidadoEm} is null`),
    index("dispositivos_push_sessao_idx").on(tabela.sessaoId),
  ],
);
