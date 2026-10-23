import { visitanteAtualSchema, type ContaAtual, type VisitanteAtual } from "@jaa/contratos";
import { buscarContaAtual } from "@/features/autenticacao/lib/api-conta";
import { requisitarApi, type ResultadoApi } from "@/lib/api";

/*
 * Sessão de VISITANTE pelo Link do Jaa, aberta sem a pessoa precisar fazer nada. A API cria a sessão
 * temporária (cookie HttpOnly do Better Auth, como qualquer sessão) — o navegador não vê token nenhum.
 *
 * Uma criação por vez nesta aba: o efeito que chama isto pode rodar duas vezes (React em
 * desenvolvimento) e duas chamadas simultâneas, ainda sem cookie, criariam dois visitantes.
 */
let emAndamento: Promise<ResultadoApi<VisitanteAtual>> | null = null;

export function entrarComoVisitante(): Promise<ResultadoApi<VisitanteAtual>> {
  emAndamento ??= requisitarApi("/visitantes", visitanteAtualSchema, { method: "POST", body: JSON.stringify({}) }).finally(() => {
    emAndamento = null;
  });
  return emAndamento;
}

/**
 * Sessão para AGIR agora (pesquisar na Home, por exemplo): a que já existe — de conta ou de visitante —
 * é reaproveitada; sem nenhuma (401), abre a de visitante. Qualquer outra falha volta como falha:
 * não é motivo para mandar a pessoa entrar.
 */
export async function garantirSessaoDeVisitante(): Promise<ResultadoApi<ContaAtual>> {
  const conta = await buscarContaAtual();
  if (conta.ok || conta.status !== 401) return conta;
  const visitante = await entrarComoVisitante();
  return visitante.ok ? buscarContaAtual() : visitante;
}
