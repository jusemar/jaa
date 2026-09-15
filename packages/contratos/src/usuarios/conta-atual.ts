import * as z from "zod";
import { identidadePessoalSchema } from "../identidades/identidade-pessoal.ts";

// Cadastro completo = a conta autenticada já possui sua identidade pessoal.
export const contaAtualSchema = z.object({
  telefoneMascarado: z.string().nullable(),
  cadastroCompleto: z.boolean(),
  identidadePessoal: identidadePessoalSchema.nullable(),
});

export type ContaAtual = z.infer<typeof contaAtualSchema>;
