import type { EnviarPosicaoEntrada, ListaSaidas, PosicaoEntregador, SaidaEntrega } from "@jaa/contratos";
import { cabecalhoSessao } from "@/features/autenticacao/lib/cliente-autenticacao";
import { URL_API } from "@/lib/configuracao";

/**
 * Cliente HTTP do Mobile para a API do Jaa. Mesmíssima API do Web: o aplicativo é mais um cliente,
 * nunca um caminho paralelo — e nenhuma regra de autorização mora aqui.
 *
 * A sessão é a MESMA do Better Auth; no aparelho ela vem do armazenamento seguro (plugin do Expo) e
 * viaja no cabeçalho `Cookie`, porque o `fetch` nativo não tem o cookie jar do navegador.
 */

export type ResultadoApi<T> = { ok: true; dados: T } | { ok: false; status: number; codigo?: string; mensagem: string };

async function requisitar<T>(caminho: string, opcoes: RequestInit = {}): Promise<ResultadoApi<T>> {
  try {
    const resposta = await fetch(`${URL_API}${caminho}`, {
      ...opcoes,
      credentials: "include",
      headers: { ...(opcoes.body ? { "content-type": "application/json" } : {}), ...(await cabecalhoSessao()), ...opcoes.headers },
    });
    const corpo: unknown = await resposta.json().catch(() => null);
    if (!resposta.ok) {
      const erro = corpo as { codigo?: string; mensagem?: string } | null;
      return { ok: false, status: resposta.status, ...(erro?.codigo ? { codigo: erro.codigo } : {}), mensagem: erro?.mensagem ?? "Não foi possível falar com o Jaa." };
    }
    return { ok: true, dados: corpo as T };
  } catch {
    // Sem rede: quem chamou decide o que fazer (o rastreamento guarda a posição e tenta de novo).
    return { ok: false, status: 0, mensagem: "Sem conexão." };
  }
}

/** Saídas do entregador autenticado. A saída EM ANDAMENTO é o que liga (ou não) o rastreamento. */
export async function listarMinhasSaidas(): Promise<ResultadoApi<ListaSaidas>> {
  return requisitar<ListaSaidas>("/entregas/saidas");
}

export function saidaEmAndamento(saidas: SaidaEntrega[]): SaidaEntrega | null {
  return saidas.find((saida) => saida.status === "em_andamento") ?? null;
}

/**
 * Envia UMA leitura. O aparelho informa o que mediu; o servidor decide se aceita, e devolve 409
 * quando a saída não está mais em andamento — o sinal de que o rastreamento deve parar.
 */
export function enviarPosicao(saidaId: string, leitura: EnviarPosicaoEntrada): Promise<ResultadoApi<PosicaoEntregador | { aplicada: false }>> {
  return requisitar(`/entregas/saidas/${encodeURIComponent(saidaId)}/posicao`, { method: "POST", body: JSON.stringify(leitura) });
}
