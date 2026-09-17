import { boolean, pgEnum, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { identidades } from "./identidades.js";

/**
 * PREFERÊNCIAS DE PRIVACIDADE e STATUS da identidade. Linha opcional: sem ela valem os padrões — e os
 * padrões são os mais restritivos que ainda deixam o mensageiro utilizável.
 *
 * O STATUS aqui é ESCOLHIDO pela pessoa ("ocupado", "ausente", "invisível") e não se confunde com a
 * PRESENÇA técnica (há conexão realtime aberta?), que continua sendo derivada e efêmera (seção 14 do
 * CLAUDE.md). Invisível é o único que apaga a presença técnica para os outros.
 */
export const statusEscolhido = pgEnum("status_escolhido", ["disponivel", "ocupado", "ausente", "invisivel"]);

// Quem pode ver aquele dado. "exceções" são casos pontuais em `excecoes_privacidade`.
export const visibilidadePerfil = pgEnum("visibilidade_perfil", ["todos", "contatos", "ninguem"]);

export const preferenciasIdentidade = pgTable("preferencias_identidade", {
  identidadeId: uuid()
    .primaryKey()
    .references(() => identidades.id, { onDelete: "cascade" }),
  // Padrão FALSE: descoberta por telefone é opt-in, nunca o contrário.
  buscavelPorTelefone: boolean().notNull().default(false),
  statusEscolhido: statusEscolhido().notNull().default("disponivel"),
  // A foto é o que já aparece em qualquer lista de conversa: esconder por padrão quebraria a leitura.
  visibilidadeFoto: visibilidadePerfil().notNull().default("todos"),
  // Status e frase são informação NOVA que a pessoa escolhe divulgar: começam restritos aos contatos.
  visibilidadeStatus: visibilidadePerfil().notNull().default("contatos"),
  /*
   * Presença JÁ EXISTIA e sempre foi visível para quem está na conversa. Nascer restrita esconderia,
   * sem aviso, algo que as pessoas já usam — então o padrão preserva o comportamento e restringir
   * passa a ser uma escolha, a um toque de distância.
   */
  visibilidadePresenca: visibilidadePerfil().notNull().default("todos"),
  criadoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
