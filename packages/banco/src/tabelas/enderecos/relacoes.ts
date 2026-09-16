import { relations } from "drizzle-orm";
import { identidades } from "../identidades/identidades.js";
import { enderecosCliente } from "./enderecos-cliente.js";

export const enderecosClienteRelacoes = relations(enderecosCliente, ({ one }) => ({
  identidade: one(identidades, { fields: [enderecosCliente.identidadeId], references: [identidades.id] }),
}));
