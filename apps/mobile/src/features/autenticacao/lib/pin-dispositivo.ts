import { pinCriadoSchema, situacaoPinSchema, type SituacaoPin } from "@jaa/contratos";
import { cofre } from "./armazenamento-seguro";
import { clienteAutenticacao } from "./cliente-autenticacao";
import { mensagemDoCodigo } from "./mensagens-codigo";

/*
 * PIN DO DISPOSITIVO no aplicativo — mesmas rotas e contratos da Web (`/api/auth/pin/*`).
 *
 * A credencial que identifica ESTE aparelho para UMA conta é entregue pela API uma única vez, ao criar
 * o PIN, e fica no ARMAZENAMENTO SEGURO do sistema — nunca em AsyncStorage, arquivo ou log. Ao entrar,
 * ela vai junto com o PIN digitado; quem decide se o aparelho é autorizado, de quem é a conta e se o
 * PIN confere é o servidor.
 *
 * VÁRIAS CONTAS NO MESMO APARELHO: cada conta tem as próprias chaves (`cofre-dispositivo.ts`). A tela
 * de entrada trabalha sempre com a CONTA ATIVA (a última que entrou); criar o PIN de uma conta nunca
 * toca na credencial de outra.
 *
 * As chamadas vão pelo `$fetch` do cliente do Better Auth: é o plugin do Expo que identifica o app
 * para a API e guarda a sessão criada depois do PIN.
 */

export type ResultadoPin = { ok: true } | { ok: false; mensagem: string; bloqueado: boolean };

const falha = (erro: unknown): ResultadoPin => ({
  ok: false,
  mensagem: mensagemDoCodigo(erro),
  bloqueado: typeof erro === "object" && erro !== null && (erro as { code?: unknown }).code === "PIN_BLOQUEADO",
});

const SEM_AUTORIZACAO: SituacaoPin = { autorizado: false, biometria: false };

async function chamar(caminho: string, corpo: Record<string, string>) {
  return clienteAutenticacao.$fetch<unknown>(caminho, { method: "POST", body: corpo, timeout: 15_000 });
}

/** A credencial do dispositivo da conta ATIVA, para quem precisa apresentá-la ao servidor (PIN e biometria). */
export const lerCredencialDoDispositivo = () => cofre.lerCredencial();

/**
 * A conta que acabou de entrar (por código, senha, PIN ou biometria) passa a ser a deste aparelho.
 * `contaId` = id da identidade pessoal. Não cria, não apaga e não revoga credencial nenhuma.
 */
export async function usarContaNoAparelho(contaId: string | null | undefined): Promise<void> {
  if (contaId) await cofre.usarConta(contaId).catch(() => false);
}

// Chaves únicas da primeira versão: saem do aparelho, e a autorização que representavam é revogada.
let chavesAntigasConferidas = false;
async function retirarChavesAntigas() {
  if (chavesAntigasConferidas) return;
  chavesAntigasConferidas = true;
  const credencial = await cofre.retirarChavesAntigas();
  if (credencial) await chamar("/pin/remover", { credencial }).catch(() => undefined);
}

/**
 * O que o SERVIDOR diz da autorização da conta ATIVA neste aparelho: está autorizada (PIN)? tem
 * biometria? Sem credencial guardada, nem pergunta. Na dúvida (rede, erro), nada é oferecido além do código.
 */
export async function situacaoDoDispositivo(): Promise<SituacaoPin> {
  await retirarChavesAntigas();
  const contaId = await cofre.contaAtiva();
  const credencial = contaId ? await cofre.lerCredencialDe(contaId) : null;
  if (!contaId || !credencial) return SEM_AUTORIZACAO;
  try {
    const { data, error } = await chamar("/pin/situacao", { credencial });
    if (error) return SEM_AUTORIZACAO;
    const situacao = situacaoPinSchema.safeParse(data);
    if (!situacao.success) return SEM_AUTORIZACAO;
    // O servidor não reconhece mais esta credencial (revogada): o que era DESTA conta sai do aparelho.
    if (!situacao.data.autorizado) await cofre.esquecerConta(contaId);
    return situacao.data;
  } catch {
    return SEM_AUTORIZACAO;
  }
}

/** A conta ativa pode entrar com PIN neste aparelho? */
export async function dispositivoTemPin(): Promise<boolean> {
  return (await situacaoDoDispositivo()).autorizado;
}

/**
 * Cria o PIN deste aparelho PARA A CONTA que está autenticada (só logo depois de entrar com o código)
 * e guarda a credencial recebida nas chaves DELA. Se esta mesma conta já tinha um PIN aqui, o servidor
 * revoga o anterior; a credencial de outra conta nunca é enviada nem alterada.
 */
export async function criarPin(contaId: string, pin: string, confirmacao: string): Promise<ResultadoPin> {
  try {
    const anterior = await cofre.lerCredencialDe(contaId);
    const { data, error } = await chamar("/pin/criar", { pin, confirmacao, ...(anterior ? { credencial: anterior } : {}) });
    if (error) return falha(error);
    const criado = pinCriadoSchema.safeParse(data);
    if (!criado.success || !criado.data.credencial) return falha({ status: 500 });
    if (!(await cofre.guardarCredencial(contaId, criado.data.credencial))) return falha({ status: 500 });
    // PIN novo = autorização nova no servidor: a biometria da anterior (desta conta) não vale mais.
    await cofre.esquecerBiometriaDe(contaId);
    await cofre.usarConta(contaId);
    return { ok: true };
  } catch {
    return falha(null);
  }
}

/** Entra com o PIN da conta ATIVA deste aparelho. */
export async function entrarComPin(pin: string): Promise<ResultadoPin> {
  try {
    const credencial = await cofre.lerCredencial();
    if (!credencial) return falha({ status: 401, code: "PIN_NAO_ACEITO" });
    const { error } = await chamar("/pin/entrar", { pin, credencial });
    return error ? falha(error) : { ok: true };
  } catch {
    return falha(null);
  }
}

/**
 * A conta ATIVA deixa de usar PIN (e biometria) neste aparelho: a API revoga a autorização dela e as
 * chaves DELA são apagadas. As outras contas do aparelho não são afetadas.
 */
export async function removerPin(): Promise<void> {
  const contaId = await cofre.contaAtiva();
  if (!contaId) return;
  const credencial = await cofre.lerCredencialDe(contaId);
  try {
    if (credencial) await chamar("/pin/remover", { credencial });
  } catch {
    // Sem conexão: a credencial some do aparelho do mesmo jeito; sem ela o PIN não entra.
  }
  await cofre.esquecerConta(contaId);
}
