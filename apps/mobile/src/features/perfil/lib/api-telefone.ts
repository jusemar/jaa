import { situacaoTelefoneContaSchema, type SituacaoTelefoneConta } from "@jaa/contratos";
import { clienteAutenticacao } from "@/features/autenticacao/lib/cliente-autenticacao";
import { requisitarApi, type RespostaApi } from "@/lib/api";
import { URL_API } from "@/lib/configuracao";

/*
 * TELEFONE DA CONTA — as mesmas rotas da Web (`/conta/telefone*`).
 *
 * Pedir o código e confirmar vão pelo `$fetch` do cliente do Better Auth, de propósito: por trás, a
 * API entrega essas duas chamadas ao Better Auth (é ele que envia o SMS e grava o número), e é o
 * plugin do Expo que identifica o app e leva a sessão — como no "entrar com senha".
 */

export type ResultadoTelefone<T> = { ok: true; dados: T } | { ok: false; mensagem: string };

// Texto para a falha: só a mensagem do SERVIDOR (frases fixas do Jaaa) ou um texto genérico.
function falha(erro: unknown): { ok: false; mensagem: string } {
  const dados = typeof erro === "object" && erro !== null ? (erro as Record<string, unknown>) : {};
  if (typeof dados.status !== "number" || dados.status === 0) return { ok: false, mensagem: "Sem conexão com o Jaaa." };
  return { ok: false, mensagem: typeof dados.mensagem === "string" && dados.mensagem.length > 0 ? dados.mensagem : "Não foi possível concluir. Tente novamente." };
}

async function enviar(caminho: string, corpo: Record<string, string>): Promise<ResultadoTelefone<unknown>> {
  try {
    const { data, error } = await clienteAutenticacao.$fetch<unknown>(`${URL_API}${caminho}`, { method: "POST", body: corpo, timeout: 15_000 });
    return error ? falha(error) : { ok: true, dados: data };
  } catch {
    return falha(null);
  }
}

/** O número como a pessoa o lê, ou null (conta que nasceu por e-mail). */
export function buscarSituacaoTelefone(): Promise<RespostaApi<SituacaoTelefoneConta>> {
  return requisitarApi("/conta/telefone", situacaoTelefoneContaSchema);
}

/** O servidor confere o número (inclusive se já é de outra conta) ANTES de enviar o SMS ao número novo. */
export async function pedirCodigoTelefone(telefone: string): Promise<ResultadoTelefone<null>> {
  const resultado = await enviar("/conta/telefone/codigo", { telefone });
  return resultado.ok ? { ok: true, dados: null } : resultado;
}

/** Só a confirmação do código grava o telefone novo na conta. */
export async function confirmarTelefone(telefone: string, codigo: string): Promise<ResultadoTelefone<SituacaoTelefoneConta>> {
  const resultado = await enviar("/conta/telefone", { telefone, codigo });
  if (!resultado.ok) return resultado;
  const situacao = situacaoTelefoneContaSchema.safeParse(resultado.dados);
  return situacao.success ? { ok: true, dados: situacao.data } : falha({ status: 500 });
}
