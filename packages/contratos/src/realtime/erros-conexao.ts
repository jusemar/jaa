import * as z from "zod";

// Motivos pelos quais a API recusa o handshake realtime. Chegam ao cliente em `connect_error`
// (`erro.message` = código; `erro.data` = { codigo, mensagem }).
export const codigoErroConexaoRealtimeSchema = z.enum([
  "NAO_AUTENTICADO",
  "CADASTRO_INCOMPLETO",
  "ERRO_INTERNO",
]);

export type CodigoErroConexaoRealtime = z.infer<typeof codigoErroConexaoRealtimeSchema>;

export const erroConexaoRealtimeSchema = z.object({
  codigo: codigoErroConexaoRealtimeSchema,
  mensagem: z.string(),
});

export type ErroConexaoRealtime = z.infer<typeof erroConexaoRealtimeSchema>;
