import { relations } from "drizzle-orm";
import { identidades } from "../identidades/identidades.js";
import { contatos } from "./contatos.js";

export const contatosRelacoes = relations(contatos, ({ one }) => ({
  // Dona da agenda e a identidade salva: a relação é unilateral, então os dois lados são explícitos.
  dona: one(identidades, { fields: [contatos.identidadeId], references: [identidades.id], relationName: "donaDaAgenda" }),
  contato: one(identidades, { fields: [contatos.contatoIdentidadeId], references: [identidades.id], relationName: "contatoSalvo" }),
}));
