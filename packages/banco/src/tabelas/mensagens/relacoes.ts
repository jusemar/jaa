import { relations } from "drizzle-orm";
import { conversas } from "../conversas/conversas.js";
import { identidades } from "../identidades/identidades.js";
import { mensagens } from "./mensagens.js";
import { recebimentosMensagem } from "./recebimentos-mensagem.js";

export const mensagensRelacoes = relations(mensagens, ({ one, many }) => ({
  conversa: one(conversas, {
    fields: [mensagens.conversaId],
    references: [conversas.id],
  }),
  remetente: one(identidades, {
    fields: [mensagens.remetenteIdentidadeId],
    references: [identidades.id],
  }),
  recebimentos: many(recebimentosMensagem),
}));

export const recebimentosMensagemRelacoes = relations(recebimentosMensagem, ({ one }) => ({
  mensagem: one(mensagens, {
    fields: [recebimentosMensagem.mensagemId],
    references: [mensagens.id],
  }),
  destinatario: one(identidades, {
    fields: [recebimentosMensagem.destinatarioIdentidadeId],
    references: [identidades.id],
  }),
}));
