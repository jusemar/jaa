import * as z from "zod";

export const codigoErroApiSchema = z.enum([
  "NAO_AUTENTICADO",
  "DADOS_INVALIDOS",
  "NOME_USUARIO_INDISPONIVEL",
  "IDENTIDADE_PESSOAL_JA_EXISTE",
]);

export type CodigoErroApi = z.infer<typeof codigoErroApiSchema>;

export const erroApiSchema = z.object({
  codigo: codigoErroApiSchema,
  mensagem: z.string(),
});

export type ErroApi = z.infer<typeof erroApiSchema>;
