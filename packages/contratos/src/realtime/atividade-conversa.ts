import * as z from "zod";

/*
 * Atividade EFÊMERA de conversa via Socket.IO: presença online/offline e "digitando".
 * Nada disso é persistido. Quem age é sempre a identidade autenticada no handshake: nenhum payload
 * informa identidade de origem. O cliente só pede para observar uma conversa; o servidor confere a
 * participação no banco antes de passar a entregar presença/digitando daquela conversa.
 */

// Cliente → servidor (com acknowledgement).
export const EVENTO_CONVERSA_OBSERVAR = "conversa:observar";
export const EVENTO_CONVERSA_DEIXAR_DE_OBSERVAR = "conversa:deixar-de-observar";
export const EVENTO_DIGITANDO_INFORMAR = "digitando:informar";

// Servidor → cliente.
export const EVENTO_PRESENCA_ATUALIZADA = "presenca:atualizada";
export const EVENTO_DIGITANDO_ATUALIZADO = "digitando:atualizado";

// Enquanto digita, o cliente renova "digitando" no máximo neste intervalo (não a cada tecla).
export const INTERVALO_RENOVACAO_DIGITANDO_MS = 2500;
// Sem nova tecla por este tempo, o cliente informa que parou.
export const PAUSA_PARA_PARAR_DIGITANDO_MS = 3000;
// Quem recebe descarta "digitando" não renovado neste prazo, mesmo sem o aviso de parada.
export const VALIDADE_DIGITANDO_MS = 8000;

export const codigoErroEventoRealtimeSchema = z.enum(["DADOS_INVALIDOS", "CONVERSA_NAO_ENCONTRADA", "LIMITE_OBSERVACOES"]);

export type CodigoErroEventoRealtime = z.infer<typeof codigoErroEventoRealtimeSchema>;

const respostaErroEventoSchema = z.object({ ok: z.literal(false), codigo: codigoErroEventoRealtimeSchema });

export const observarConversaEntradaSchema = z.object({
  conversaId: z.uuid(),
});

export type ObservarConversaEntrada = z.input<typeof observarConversaEntradaSchema>;

export const presencaIdentidadeSchema = z.object({
  identidadeId: z.uuid(),
  online: z.boolean(),
});

export type PresencaIdentidade = z.infer<typeof presencaIdentidadeSchema>;

// Ao observar, o cliente recebe a presença ATUAL dos outros participantes; mudanças chegam depois
// por `presenca:atualizada`. Conversa inexistente ou alheia → CONVERSA_NAO_ENCONTRADA (nada é revelado).
export const respostaObservarConversaSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), presencas: z.array(presencaIdentidadeSchema) }),
  respostaErroEventoSchema,
]);

export type RespostaObservarConversa = z.infer<typeof respostaObservarConversaSchema>;

export const informarDigitandoEntradaSchema = z.object({
  conversaId: z.uuid(),
  digitando: z.boolean(),
});

export type InformarDigitandoEntrada = z.input<typeof informarDigitandoEntradaSchema>;

export const respostaEventoRealtimeSchema = z.discriminatedUnion("ok", [z.object({ ok: z.literal(true) }), respostaErroEventoSchema]);

export type RespostaEventoRealtime = z.infer<typeof respostaEventoRealtimeSchema>;

// Entregue somente a quem observa uma conversa com a identidade. Sem broadcast global.
export const eventoPresencaAtualizadaSchema = presencaIdentidadeSchema;

export type EventoPresencaAtualizada = z.infer<typeof eventoPresencaAtualizadaSchema>;

// Entregue somente a quem observa a conversa, exceto as conexões da própria identidade que digita.
export const eventoDigitandoAtualizadoSchema = z.object({
  conversaId: z.uuid(),
  identidadeId: z.uuid(),
  digitando: z.boolean(),
});

export type EventoDigitandoAtualizado = z.infer<typeof eventoDigitandoAtualizadoSchema>;

export interface EventosRealtimeClienteParaServidor {
  [EVENTO_CONVERSA_OBSERVAR]: (dados: ObservarConversaEntrada, responder: (resposta: RespostaObservarConversa) => void) => void;
  [EVENTO_CONVERSA_DEIXAR_DE_OBSERVAR]: (dados: ObservarConversaEntrada, responder?: (resposta: RespostaEventoRealtime) => void) => void;
  [EVENTO_DIGITANDO_INFORMAR]: (dados: InformarDigitandoEntrada, responder?: (resposta: RespostaEventoRealtime) => void) => void;
}
