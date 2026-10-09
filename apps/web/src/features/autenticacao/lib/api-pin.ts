import { pinCriadoSchema, situacaoPinSchema } from "@jaa/contratos";
import { clienteAutenticacao } from "./cliente-autenticacao";
import { mensagemDeErroAutenticacao } from "./mensagens-erro";

/*
 * PIN DO DISPOSITIVO no navegador.
 *
 * A credencial que identifica este navegador fica em cookie HttpOnly, emitido e lido só pela API: nada
 * dela passa por aqui nem por qualquer armazenamento do navegador. O que esta camada envia é só o
 * PIN digitado — e quem decide se o dispositivo é autorizado, de quem é a conta e se o PIN confere é
 * o servidor. As chamadas vão pelo cliente do Better Auth (mesma origem conferida, mesmos cookies).
 */

export type ResultadoPin = { ok: true } | { ok: false; mensagem: string; bloqueado: boolean };

const falha = (erro: { status: number; code?: string | undefined }): ResultadoPin => ({ ok: false, mensagem: mensagemDeErroAutenticacao(erro), bloqueado: erro.code === "PIN_BLOQUEADO" });

async function chamar(caminho: string, corpo: Record<string, string> = {}) {
  return clienteAutenticacao.$fetch<unknown>(caminho, { method: "POST", body: corpo });
}

/** Este navegador pode oferecer "Entrar com PIN"? Na dúvida (rede, erro), não. */
export async function buscarSituacaoPin(): Promise<boolean> {
  try {
    const { data, error } = await chamar("/pin/situacao");
    const situacao = error ? null : situacaoPinSchema.safeParse(data);
    return situacao?.success ? situacao.data.autorizado : false;
  } catch {
    return false;
  }
}

export async function criarPin(pin: string, confirmacao: string): Promise<ResultadoPin> {
  const { data, error } = await chamar("/pin/criar", { pin, confirmacao });
  if (error) return falha(error);
  return pinCriadoSchema.safeParse(data).success ? { ok: true } : falha({ status: 500 });
}

export async function entrarComPin(pin: string): Promise<ResultadoPin> {
  const { error } = await chamar("/pin/entrar", { pin });
  return error ? falha(error) : { ok: true };
}

/** Este navegador deixa de aceitar PIN (a API revoga a autorização e apaga o cookie). */
export async function removerPin(): Promise<void> {
  await chamar("/pin/remover").catch(() => undefined);
}
