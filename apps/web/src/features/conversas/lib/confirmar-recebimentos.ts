import { LIMITE_CONFIRMACAO_RECEBIMENTO, type Mensagem } from "@jaa/contratos";
import { aoMudarIdentidadeAtuante } from "@/lib/identidade-atuante";
import { confirmarRecebimentoMensagens } from "./api-conversas";

/**
 * Fila ÚNICA por aba das confirmações de recebimento (ENTREGUE).
 * Chamada sempre que este cliente recebe/processa mensagens: evento realtime, histórico ou lista.
 * - só mensagens de OUTRAS identidades ainda "enviada" (entregue/lida não precisam de confirmação);
 * - agrupa chamadas próximas numa única requisição (até o limite do contrato);
 * - falha de rede/servidor: devolve à fila e tenta de novo; repetir é seguro (a API é idempotente).
 */

const INTERVALO_AGRUPAMENTO_MS = 50;
const INTERVALO_NOVA_TENTATIVA_MS = 3000;

const confirmados = new Set<string>();
const fila = new Set<string>();

// Confirmações pertencem à identidade que recebeu: ao trocar de identidade, a fila recomeça.
aoMudarIdentidadeAtuante(() => {
  fila.clear();
  confirmados.clear();
});
let temporizador: ReturnType<typeof setTimeout> | null = null;
let enviando = false;

function agendar(atrasoMs: number) {
  if (temporizador !== null || fila.size === 0) return;
  temporizador = setTimeout(() => {
    temporizador = null;
    void enviarFila();
  }, atrasoMs);
}

async function enviarFila() {
  if (enviando) return;
  const lote = [...fila].slice(0, LIMITE_CONFIRMACAO_RECEBIMENTO);
  if (lote.length === 0) return;

  enviando = true;
  for (const id of lote) fila.delete(id);
  try {
    const resultado = await confirmarRecebimentoMensagens(lote);
    if (resultado.ok) {
      for (const id of lote) confirmados.add(id);
    } else if (resultado.status === 0 || resultado.status >= 500) {
      for (const id of lote) fila.add(id);
      agendar(INTERVALO_NOVA_TENTATIVA_MS);
      return;
    }
    // Outros erros (ex.: sessão encerrada) não se resolvem repetindo: o lote é descartado.
  } finally {
    enviando = false;
  }
  agendar(0);
}

export function confirmarRecebimentos(identidadeId: string, mensagens: Mensagem[]): void {
  for (const mensagem of mensagens) {
    if (mensagem.remetenteIdentidadeId === identidadeId || mensagem.estado !== "enviada") continue;
    if (!confirmados.has(mensagem.id)) fila.add(mensagem.id);
  }
  agendar(INTERVALO_AGRUPAMENTO_MS);
}
