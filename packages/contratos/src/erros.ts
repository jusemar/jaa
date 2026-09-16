import * as z from "zod";

export const codigoErroApiSchema = z.enum([
  "NAO_AUTENTICADO",
  "DADOS_INVALIDOS",
  "NOME_USUARIO_INDISPONIVEL",
  "IDENTIDADE_PESSOAL_JA_EXISTE",
  "CADASTRO_INCOMPLETO",
  "IDENTIDADE_NAO_ENCONTRADA",
  "IDENTIDADE_NAO_AUTORIZADA",
  "EMPRESA_NAO_ENCONTRADA",
  "SLUG_INDISPONIVEL",
  "PRODUTO_NAO_ENCONTRADO",
  "PEDIDO_NAO_ENCONTRADO",
  "TRANSICAO_PEDIDO_INVALIDA",
  "ITENS_INVALIDOS",
  "PAGAMENTO_INVALIDO",
  "CONVERSA_CONSIGO_MESMO",
  "CONVERSA_NAO_ENCONTRADA",
  "ID_CLIENTE_REUTILIZADO",
  "MENSAGEM_NAO_ENCONTRADA",
  "MENSAGEM_RESPONDIDA_NAO_ENCONTRADA",
  "MENSAGEM_DE_OUTRA_IDENTIDADE",
  "MENSAGEM_EXCLUIDA",
]);

export type CodigoErroApi = z.infer<typeof codigoErroApiSchema>;

export const erroApiSchema = z.object({
  codigo: codigoErroApiSchema,
  mensagem: z.string(),
});

export type ErroApi = z.infer<typeof erroApiSchema>;
