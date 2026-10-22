import { visitanteAtualSchema, type VisitanteAtual } from "@jaa/contratos";
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
