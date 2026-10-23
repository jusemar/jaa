import * as z from "zod";

/*
 * PUSH no celular (Android agora; iOS previsto): o aviso de NOVA MENSAGEM levado ao sistema quando o app
 * está em segundo plano ou fechado. Quem recebe é decidido no SERVIDOR (identidade destinatária → contas
 * que podem operá-la → dispositivos); o app só registra o aparelho.
 */

export const PLATAFORMAS_PUSH = ["android", "ios"] as const;
export const plataformaPushSchema = z.enum(PLATAFORMAS_PUSH);
export type PlataformaPush = z.infer<typeof plataformaPushSchema>;

// Formato do Expo Push Token (o único tipo de token que a API aceita: o envio passa pelo Expo).
export const expoPushTokenSchema = z
  .string()
  .max(200)
  .regex(/^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$/, "Token de push inválido.");

/** Registrar (ou atualizar) ESTA instalação para a conta da sessão. A conta nunca vem no corpo. */
export const registrarDispositivoPushEntradaSchema = z.strictObject({
  instalacaoId: z.uuid(),
  token: expoPushTokenSchema,
  plataforma: plataformaPushSchema,
});
export type RegistrarDispositivoPushEntrada = z.infer<typeof registrarDispositivoPushEntradaSchema>;

export const removerDispositivoPushParametrosSchema = z.strictObject({ instalacaoId: z.uuid() });

/*
 * CANAL do Android para mensagens. O id é estável: o Android guarda por id o que a pessoa ajustou (som,
 * importância), e um canal já criado não muda mais pelo app. O app cria o canal com este id.
 */
export const CANAL_PUSH_MENSAGENS = "mensagens";

// Textos seguros: o push NUNCA leva o conteúdo nem o autor da mensagem (passa por Expo e Google).
export const TITULO_PUSH_NOVA_MENSAGEM = "Nova mensagem";
export const TEXTO_PUSH_NOVA_MENSAGEM = "Você recebeu uma nova mensagem.";

/*
 * O que o toque no push abre — `data` VERSIONADO. São só endereços: o app nunca autoriza nada por eles
 * (confere a identidade nas operáveis vindas do servidor antes de trocar). `identidadeId` = identidade
 * DESTINATÁRIA (a que deve estar ativa para abrir a conversa).
 */
export const dadosPushSchema = z.object({
  v: z.literal(1),
  evento: z.literal("nova-mensagem"),
  identidadeId: z.uuid(),
  conversaId: z.uuid(),
});
export type DadosPush = z.infer<typeof dadosPushSchema>;
