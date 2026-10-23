import * as z from "zod";
import type { MensagemPush, ProvedorPush, ReciboPush, TicketPush } from "./provedor-push.js";

const URL_ENVIO = "https://exp.host/--/api/v2/push/send";
const URL_RECIBOS = "https://exp.host/--/api/v2/push/getReceipts";
// Limites do Expo por requisição.
const MAXIMO_POR_ENVIO = 100;
const MAXIMO_POR_CONSULTA = 1000;
const TEMPO_LIMITE_MS = 10_000;

const erroSchema = z.object({ status: z.literal("error"), details: z.object({ error: z.string().optional() }).optional() });
const ticketSchema = z.union([z.object({ status: z.literal("ok"), id: z.string() }), erroSchema]);
const respostaEnvioSchema = z.object({ data: z.array(ticketSchema) });
const respostaRecibosSchema = z.object({ data: z.record(z.string(), z.union([z.object({ status: z.literal("ok") }), erroSchema])) });

const emLotes = <T>(itens: readonly T[], tamanho: number) => Array.from({ length: Math.ceil(itens.length / tamanho) }, (_, i) => itens.slice(i * tamanho, (i + 1) * tamanho));

/**
 * Expo Push Service por HTTP (sem SDK). `tokenDeAcesso` é o EXPO_ACCESS_TOKEN (opcional; segredo de
 * servidor). Falha de rede ou resposta inesperada vira exceção: quem chama registra e segue — push é
 * efeito posterior ao fato, nunca o desfaz.
 */
export function criarProvedorExpo({ tokenDeAcesso, buscar = fetch }: { tokenDeAcesso?: string | undefined; buscar?: typeof fetch }): ProvedorPush {
  async function postar(url: string, corpo: unknown): Promise<unknown> {
    const resposta = await buscar(url, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        ...(tokenDeAcesso ? { authorization: `Bearer ${tokenDeAcesso}` } : {}),
      },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    });
    if (!resposta.ok) throw new Error(`Expo Push respondeu ${resposta.status}.`);
    return resposta.json();
  }

  return {
    async enviar(mensagens) {
      const tickets: TicketPush[] = [];
      for (const lote of emLotes(mensagens, MAXIMO_POR_ENVIO)) {
        const corpo = lote.map((mensagem: MensagemPush) => ({
          to: mensagem.token,
          title: mensagem.titulo,
          body: mensagem.texto,
          data: mensagem.dados,
          channelId: mensagem.canal,
          priority: "high",
          // No Android 8+ o som é do canal; o campo vale para quem não tem canais (iOS).
          sound: "default",
        }));
        const { data } = respostaEnvioSchema.parse(await postar(URL_ENVIO, corpo));
        if (data.length !== lote.length) throw new Error("Expo Push devolveu quantidade de tickets diferente da enviada.");
        tickets.push(...data.map((ticket): TicketPush => (ticket.status === "ok" ? { status: "ok", id: ticket.id } : { status: "erro", erro: ticket.details?.error ?? null })));
      }
      return tickets;
    },

    async consultarRecibos(ids) {
      const recibos = new Map<string, ReciboPush>();
      for (const lote of emLotes(ids, MAXIMO_POR_CONSULTA)) {
        const { data } = respostaRecibosSchema.parse(await postar(URL_RECIBOS, { ids: lote }));
        for (const [id, recibo] of Object.entries(data)) recibos.set(id, recibo.status === "ok" ? { status: "ok" } : { status: "erro", erro: recibo.details?.error ?? null });
      }
      return recibos;
    },
  };
}
