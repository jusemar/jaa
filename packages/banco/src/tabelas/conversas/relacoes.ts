import { relations } from "drizzle-orm";
import { identidades } from "../identidades/identidades.js";
import { mensagens } from "../mensagens/mensagens.js";
import { conversas } from "./conversas.js";
import { participantesConversa } from "./participantes-conversa.js";

export const conversasRelacoes = relations(conversas, ({ many }) => ({
  participantes: many(participantesConversa),
  mensagens: many(mensagens),
}));

export const participantesConversaRelacoes = relations(participantesConversa, ({ one }) => ({
  conversa: one(conversas, {
    fields: [participantesConversa.conversaId],
    references: [conversas.id],
  }),
  identidade: one(identidades, {
    fields: [participantesConversa.identidadeId],
    references: [identidades.id],
  }),
}));
