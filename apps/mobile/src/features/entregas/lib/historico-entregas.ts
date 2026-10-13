import { PERIODO_PADRAO_HISTORICO_ENTREGAS, periodoHistoricoEntregasSchema, ROTULO_PERIODO_PEDIDOS, type EntregaConcluida, type PeriodoHistoricoEntregas } from "@jaa/contratos";
import { problemaDoPeriodo } from "@/features/pedidos/lib/paginacao-pedidos";

/*
 * HISTÓRICO DE ENTREGAS no app: só o estado da consulta e a junção das páginas — sem React e sem rede.
 * O período é o MESMO de Pedidos (opções, rótulos e validação vêm de lá); quem calcula os limites e
 * decide o que é uma entrega concluída é o servidor. Cópia da Web: mudou lá, muda aqui.
 */

export const ENTREGAS_POR_PAGINA = 20;

export interface PeriodoDoHistorico {
  periodo: PeriodoHistoricoEntregas;
  // AAAA-MM-DD; só existem no personalizado.
  dataInicial?: string | undefined;
  dataFinal?: string | undefined;
}

export const PERIODO_INICIAL: PeriodoDoHistorico = { periodo: PERIODO_PADRAO_HISTORICO_ENTREGAS };

export const OPCOES_DE_PERIODO = periodoHistoricoEntregasSchema.options.map((opcao) => ({ id: opcao, rotulo: ROTULO_PERIODO_PEDIDOS[opcao] }));

/** O período pode virar consulta? (no personalizado, só com as duas datas e em ordem) */
export const periodoValido = (periodo: PeriodoDoHistorico) => problemaDoPeriodo(periodo) === null;

/** O período como vai na query string. */
export function consultaDoHistorico(periodo: PeriodoDoHistorico, antesDe?: string | null): string {
  const consulta = new URLSearchParams({ periodo: periodo.periodo, limite: String(ENTREGAS_POR_PAGINA) });
  if (periodo.periodo === "personalizado" && periodo.dataInicial && periodo.dataFinal) {
    consulta.set("dataInicial", periodo.dataInicial);
    consulta.set("dataFinal", periodo.dataFinal);
  }
  if (antesDe) consulta.set("antesDe", antesDe);
  return consulta.toString();
}

/** "Carregar mais": a página seguinte entra no fim, sem repetir entrega que já está na tela. */
export function juntarPaginas(atuais: readonly EntregaConcluida[], novas: readonly EntregaConcluida[]): EntregaConcluida[] {
  const vistas = new Set(atuais.map((entrega) => entrega.id));
  return [...atuais, ...novas.filter((entrega) => !vistas.has(entrega.id))];
}

/** "11/10/2026, 14:32" — data e hora da conclusão. O formatador é criado a cada uso (fuso do aparelho). */
export function formatarConclusao(iso: string, fusoHorario?: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: fusoHorario, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export const TEXTO_HISTORICO_VAZIO: Record<PeriodoHistoricoEntregas, string> = {
  hoje: "Você ainda não concluiu entregas hoje para esta empresa.",
  semana: "Nenhuma entrega concluída nesta semana para esta empresa.",
  mes: "Nenhuma entrega concluída neste mês para esta empresa.",
  personalizado: "Nenhuma entrega concluída neste período para esta empresa.",
};
