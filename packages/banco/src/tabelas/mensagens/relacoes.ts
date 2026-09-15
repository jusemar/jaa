import { relations } from "drizzle-orm";
import { conversas } from "../conversas/conversas.js";
import { identidades } from "../identidades/identidades.js";
import { mensagens } from "./mensagens.js";

export const mensagensRelacoes = relations(mensagens, ({ one }) => ({
  conversa: one(conversas, {
    fields: [mensagens.conversaId],
    references: [conversas.id],
  }),
  remetente: one(identidades, {
    fields: [mensagens.remetenteIdentidadeId],
    references: [identidades.id],
  }),
}));
