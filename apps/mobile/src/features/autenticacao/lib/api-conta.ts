import { metodosDeEntradaSchema, type ContaAtual, type CriarIdentidadePessoalEntrada, type MetodosDeEntrada } from "@jaa/contratos";
import { cabecalhoSessao, clienteAutenticacao } from "./cliente-autenticacao";
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
      return { ok: false, mensagem: erro?.mensagem ?? "Não foi possível falar com o Jaaa." };
    }
    return { ok: true, dados: corpo as T };
  } catch {
    return { ok: false, mensagem: "Sem conexão com o Jaaa." };
  }
}

/**
 * Por onde o código pode chegar neste servidor (consulta pública, a mesma da Web). Qualquer falha
 * vale como "só telefone": o e-mail nunca é oferecido sem o servidor confirmar que o canal existe.
 */
export async function buscarMetodosDeEntrada(): Promise<MetodosDeEntrada> {
  const resultado = await requisitar<unknown>("/autenticacao/metodos");
  const lido = resultado.ok ? metodosDeEntradaSchema.safeParse(resultado.dados) : null;
  return lido?.success ? lido.data : { telefone: true, email: false };
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

/**
 * Encerra a sessão pelo cliente do Better Auth: é o plugin do Expo que apaga o cookie guardado no
 * SecureStore (uma chamada HTTP solta derrubaria a sessão no servidor e deixaria o cookie no aparelho).
 * Sem rede, a sessão local é apagada do mesmo jeito.
 */
export async function sair(): Promise<void> {
  try {
    await clienteAutenticacao.signOut();
  } catch {
    // Sem conexão: o plugin já limpou a sessão local antes de tentar a chamada.
  }
}
