import { sql } from "drizzle-orm";
import { bigint, check, foreignKey, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { mensagens } from "./mensagens.js";

// Tipos de anexo: imagem e áudio (mensagem de voz). Documento e vídeo entram como novos valores.
export const tipoAnexo = pgEnum("tipo_anexo", ["imagem", "audio"]);

/**
 * ANEXO de uma mensagem: a imagem de uma mensagem "imagem" ou o áudio de uma mensagem "audio".
 *
 * Cada tipo guarda SÓ os metadados que tem (CHECK `anexos_mensagem_metadados_por_tipo`): imagem →
 * largura e altura, sem duração; áudio → duração, sem dimensões. Nada de valor fictício.
 *
 * - `chave` é a CHAVE do objeto no bucket PRIVADO, nunca uma URL: a leitura é sempre por URL assinada
 *   de curta duração, gerada na hora e nunca gravada aqui.
 * - Remoção é LÓGICA (`removido_em`), como o tombstone da mensagem: a linha e a chave ficam para
 *   auditoria e para a limpeza do arquivo no storage. Nenhuma linha é apagada fisicamente.
 * - Coerência mensagem ↔ anexo (imagem/áudio tem exatamente um anexo do MESMO tipo; anexo só em
 *   mensagem do mesmo tipo; anexo ativo enquanto a mensagem é visível) envolve as DUAS tabelas e é
 *   conferida no COMMIT por triggers de constraint diferidos que existem só nas migrations
 *   (`0043_mensagens_com_anexo.sql`, estendida para áudio na `0044_mensagens_de_audio.sql`), no mesmo
 *   padrão da fundação da empresa (`0007`).
 */
export const anexosMensagem = pgTable(
  "anexos_mensagem",
  {
    id: uuid().primaryKey().default(sql`uuidv7()`),
    conversaId: uuid().notNull(),
    mensagemId: uuid().notNull(),
    tipo: tipoAnexo().notNull(),
    chave: text().notNull(),
    // Tipo do arquivo GRAVADO: imagem é sempre image/webp (o pipeline reencoda); áudio é o original
    // validado, audio/webm ou audio/mp4.
    tipoConteudo: text().notNull(),
    // bigint: vídeo/documento futuros podem passar de 2 GB sem redesenhar a tabela.
    tamanhoBytes: bigint({ mode: "number" }).notNull(),
    // Dimensões do arquivo gravado: o cliente reserva o espaço do balão antes de baixar a imagem.
    largura: integer(),
    altura: integer(),
    // Duração do áudio em milissegundos (o player mostra o tempo antes de baixar o arquivo).
    duracaoMs: integer(),
    criadoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
    removidoEm: timestamp({ withTimezone: true }),
  },
  (tabela) => [
    // O anexo é de uma mensagem DESTA conversa (FK composta sobre o índice único conversa_id+id).
    // RESTRICT: mensagens não são apagadas (exclusão é tombstone); apagar uma com anexo é recusado.
    foreignKey({
      name: "anexos_mensagem_mensagem_fk",
      columns: [tabela.conversaId, tabela.mensagemId],
      foreignColumns: [mensagens.conversaId, mensagens.id],
    }).onDelete("restrict"),
    uniqueIndex("anexos_mensagem_chave_unica").on(tabela.chave),
    // UM anexo por mensagem nesta fase. Álbum no futuro = remover este índice (e criar um não único).
    uniqueIndex("anexos_mensagem_um_por_mensagem").on(tabela.mensagemId),
    check("anexos_mensagem_chave_valida", sql`char_length(${tabela.chave}) between 1 and 300`),
    check("anexos_mensagem_tipo_conteudo_valido", sql`char_length(${tabela.tipoConteudo}) between 1 and 100`),
    check("anexos_mensagem_imagem_em_webp", sql`${tabela.tipo}::text <> 'imagem' or ${tabela.tipoConteudo} = 'image/webp'`),
    check("anexos_mensagem_tamanho_positivo", sql`${tabela.tamanhoBytes} > 0`),
    check("anexos_mensagem_audio_formato", sql`${tabela.tipo}::text <> 'audio' or ${tabela.tipoConteudo} in ('audio/webm', 'audio/mp4')`),
    check(
      "anexos_mensagem_metadados_por_tipo",
      // `is not null` explícito: `null > 0` é NULL, e uma CHECK que dá NULL é ACEITA.
      sql`(${tabela.tipo}::text = 'imagem' and ${tabela.largura} is not null and ${tabela.altura} is not null and ${tabela.largura} > 0 and ${tabela.altura} > 0 and ${tabela.duracaoMs} is null) or (${tabela.tipo}::text = 'audio' and ${tabela.largura} is null and ${tabela.altura} is null and ${tabela.duracaoMs} is not null and ${tabela.duracaoMs} > 0)`,
    ),
    check("anexos_mensagem_removido_apos_criacao", sql`${tabela.removidoEm} is null or ${tabela.removidoEm} >= ${tabela.criadoEm}`),
  ],
);
