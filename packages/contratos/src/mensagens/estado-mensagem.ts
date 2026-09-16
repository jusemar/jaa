import * as z from "zod";

/**
 * Estado de uma mensagem em relação aos seus DESTINATÁRIOS (os outros participantes), igual para
 * quem envia e quem recebe. Calculado pelo servidor a partir de fatos persistidos:
 * - enviada:  a API persistiu a mensagem (nunca antes do commit);
 * - entregue: um cliente autenticado do destinatário confirmou o recebimento (socket conectado ou
 *             emit() NÃO contam);
 * - lida:     o destinatário confirmou leitura com a conversa aberta e visível.
 * Em grupos (futuro), o estado agregado exige todos os destinatários.
 */
export const estadoMensagemSchema = z.enum(["enviada", "entregue", "lida"]);

export type EstadoMensagem = z.infer<typeof estadoMensagemSchema>;

const ORDEM_ESTADO: Record<EstadoMensagem, number> = { enviada: 0, entregue: 1, lida: 2 };

// O estado só avança: dados atrasados ou fora de ordem (HTTP antigo, evento repetido) nunca regridem.
export function estadoMaisAvancado(a: EstadoMensagem, b: EstadoMensagem): EstadoMensagem {
  return ORDEM_ESTADO[a] >= ORDEM_ESTADO[b] ? a : b;
}

export const LIMITE_CONFIRMACAO_RECEBIMENTO = 100;

// Confirma que ESTE cliente recebeu/processou as mensagens (evento realtime, histórico ou lista).
// Quem confirma é sempre a identidade da sessão; só vale para mensagens recebidas de outras identidades
// em conversas de que ela participa. Podem ser de conversas diferentes. Repetir é seguro.
export const confirmarRecebimentoEntradaSchema = z.object({
  mensagemIds: z.array(z.uuid()).min(1).max(LIMITE_CONFIRMACAO_RECEBIMENTO),
});

export type ConfirmarRecebimentoEntrada = z.input<typeof confirmarRecebimentoEntradaSchema>;

export const confirmacaoRecebimentoSchema = z.object({
  // Mensagens confirmadas (sem repetição), incluindo as que já estavam confirmadas antes.
  mensagemIds: z.array(z.uuid()),
});

export type ConfirmacaoRecebimento = z.infer<typeof confirmacaoRecebimentoSchema>;

// Marcador de leitura: "li todas as mensagens recebidas nesta conversa até esta (inclusive)".
// Uma requisição cobre qualquer quantidade de mensagens. Nunca faz o marcador voltar.
export const confirmarLeituraEntradaSchema = z.object({
  ateMensagemId: z.uuid(),
});

export type ConfirmarLeituraEntrada = z.input<typeof confirmarLeituraEntradaSchema>;

export const leituraConversaSchema = z.object({
  conversaId: z.uuid(),
  // Marcador atual após a confirmação: pode ser posterior ao pedido, se já estava adiante.
  lidaAteMensagemId: z.uuid(),
});

export type LeituraConversa = z.infer<typeof leituraConversaSchema>;
