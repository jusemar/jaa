import type { ContaAtual, CriarIdentidadePessoalEntrada } from "@jaa/contratos";
import { cabecalhoSessao } from "./cliente-autenticacao";
import { URL_API } from "@/lib/configuracao";

/**
 * Conta e identidade pessoal — as MESMAS rotas que o Web usa (`/usuarios/eu`, `/identidades/pessoal`).
 * O Mobile não tem cadastro próprio: quem entrega é uma pessoa comum do Jaa.
 */

export type ContaMobile = ContaAtual;

async function requisitar<T>(caminho: string, opcoes: RequestInit = {}): Promise<{ ok: true; dados: T } | { ok: false; mensagem: string }> {
  try {
    const resposta = await fetch(`${URL_API}${caminho}`, {
      ...opcoes,
      credentials: "include",
      headers: { ...(opcoes.body ? { "content-type": "application/json" } : {}), ...(await cabecalhoSessao()), ...opcoes.headers },
    });
    const corpo: unknown = await resposta.json().catch(() => null);
    if (!resposta.ok) {
      const erro = corpo as { mensagem?: string } | null;
      return { ok: false, mensagem: erro?.mensagem ?? "Não foi possível falar com o Jaa." };
    }
    return { ok: true, dados: corpo as T };
  } catch {
    return { ok: false, mensagem: "Sem conexão com o Jaa." };
  }
}

export const concluirCadastro = {
  /** Conta autenticada (ou `null` quando não há sessão válida). */
  async buscar(): Promise<ContaMobile | null> {
    const resultado = await requisitar<ContaMobile>("/usuarios/eu");
    return resultado.ok ? resultado.dados : null;
  },

  criar(entrada: CriarIdentidadePessoalEntrada) {
    return requisitar("/identidades/pessoal", { method: "POST", body: JSON.stringify(entrada) });
  },
};

export async function sair(): Promise<void> {
  await requisitar("/api/auth/sign-out", { method: "POST", body: JSON.stringify({}) });
}
