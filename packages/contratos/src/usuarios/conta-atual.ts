import * as z from "zod";
import { identidadePessoalSchema } from "../identidades/identidade-pessoal.ts";
import { visitanteAtualSchema } from "../visitantes/visitante.ts";

// Cadastro completo = a conta autenticada já possui sua identidade pessoal.
export const contaAtualSchema = z.object({
  telefoneMascarado: z.string().nullable(),
  cadastroCompleto: z.boolean(),
  identidadePessoal: identidadePessoalSchema.nullable(),
  /*
   * Sessão de VISITANTE (conta temporária aberta pelo Link do Jaa): conversa sem cadastro até criar
   * conta ou entrar. Ausente/null = conta comum. Opcional para clientes que ainda não o conhecem.
   */
  visitante: visitanteAtualSchema.nullable().optional(),
});

export type ContaAtual = z.infer<typeof contaAtualSchema>;
