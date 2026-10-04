import { clienteAutenticacao } from "@/features/autenticacao/lib/cliente-autenticacao";
import { requisitar } from "@/lib/api";
import { interpretarContextoConta, type ContextoContaInterpretado } from "./contexto-conta";

const LIMITE_MS = 15_000;

export type ResultadoBuscaContexto =
  | { tipo: "pronto"; contexto: ContextoContaInterpretado }
  | { tipo: "sem_sessao" }
  | { tipo: "erro"; mensagem: string };

/**
 * `GET /conta/contexto` com a sessão do Better Auth guardada no aparelho. Sem sessão guardada nem
 * chama a API; sessão recusada (401) também é "sem sessão", não erro. Nunca envia `x-jaa-identidade`:
 * o contexto é da CONTA, não da identidade atuante.
 */
export async function buscarContextoConta(): Promise<ResultadoBuscaContexto> {
  if (!(await clienteAutenticacao.getCookie())) return { tipo: "sem_sessao" };

  // Limite de tempo: API inalcançável vira erro com "tentar de novo", nunca uma tela presa carregando.
  const limite = new AbortController();
  const temporizador = setTimeout(() => limite.abort(), LIMITE_MS);
  const resposta = await requisitar<unknown>("/conta/contexto", { signal: limite.signal });
  clearTimeout(temporizador);
  if (!resposta.ok) return resposta.status === 401 ? { tipo: "sem_sessao" } : { tipo: "erro", mensagem: resposta.mensagem };

  const interpretado = interpretarContextoConta(resposta.dados);
  return interpretado.ok ? { tipo: "pronto", contexto: interpretado.contexto } : { tipo: "erro", mensagem: interpretado.motivo };
}
