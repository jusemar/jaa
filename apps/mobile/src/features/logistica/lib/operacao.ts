import { ROTULO_STATUS_SAIDA, restanteDaFormacaoMs, type SaidaEntrega, type StatusSaida } from "@jaa/contratos";

/*
 * Regras de TELA da Operação (rotas/saídas da empresa) — as mesmas da Web (`area-saidas-empresa.tsx` e
 * `painel-despacho.tsx`). Puras. Quem fecha, combina, libera e despacha é o servidor.
 */

export const FILTROS_DA_OPERACAO = [
  { id: "todos", rotulo: "Todos", vazio: "Nenhuma rota encontrada.", statuses: null },
  { id: "formacao", rotulo: "Em formação", vazio: "Nenhuma rota em formação.", statuses: ["em_formacao"] },
  { id: "retirada", rotulo: "Aguardando retirada", vazio: "Nenhuma rota aguardando retirada.", statuses: ["aguardando_entregador", "preparada", "liberada_retirada"] },
  { id: "andamento", rotulo: "Em andamento", vazio: "Nenhuma rota em andamento.", statuses: ["em_andamento"] },
  { id: "concluidas", rotulo: "Concluídas", vazio: "Nenhuma rota concluída.", statuses: ["concluida"] },
] as const satisfies readonly { id: string; rotulo: string; vazio: string; statuses: readonly StatusSaida[] | null }[];

export type FiltroOperacao = (typeof FILTROS_DA_OPERACAO)[number]["id"];

export function filtrarSaidasDaOperacao(saidas: SaidaEntrega[], filtro: FiltroOperacao): SaidaEntrega[] {
  const statuses: readonly StatusSaida[] | null = FILTROS_DA_OPERACAO.find((item) => item.id === filtro)?.statuses ?? null;
  return statuses ? saidas.filter((saida) => statuses.includes(saida.status)) : saidas;
}

export function rotuloStatusSaida(saida: Pick<SaidaEntrega, "status">): string {
  return saida.status === "em_andamento" ? "Em entrega" : ROTULO_STATUS_SAIDA[saida.status];
}

/** Tom do selo de status: atenção enquanto junta pedidos/espera gente; marca quando há entregador. */
export function tomDoStatusSaida(status: StatusSaida): "atencao" | "marca" | "neutro" {
  if (status === "em_formacao" || status === "aguardando_entregador") return "atencao";
  return status === "concluida" ? "neutro" : "marca";
}

export function nomeDaRota(saida: Pick<SaidaEntrega, "zonaPrincipal" | "zonasCombinadas">): string {
  if (!saida.zonaPrincipal) return "Rota manual";
  return `Rota ${[saida.zonaPrincipal.nome, ...saida.zonasCombinadas.map((zona) => zona.nome)].join(" + ")}`;
}

/** "#12, #13, #14 +2": os três primeiros pedidos e quantos faltam. */
export function resumoDosPedidos(numeros: readonly number[]): string {
  const principais = numeros
    .slice(0, 3)
    .map((numero) => `#${numero}`)
    .join(", ");
  const restantes = numeros.length - 3;
  return restantes > 0 ? `${principais} +${restantes}` : principais;
}

export function formatarEspera(saida: Pick<SaidaEntrega, "prazoFormacaoEm">, agora: Date = new Date()): string {
  const restante = restanteDaFormacaoMs(saida, agora);
  if (restante === null) return "";
  if (restante <= 0) return "fechando…";
  const minutos = Math.ceil(restante / 60_000);
  return minutos === 1 ? "fecha em 1 min" : `fecha em ${minutos} min`;
}

/** A liberação antecipada vale enquanto a rota não foi liberada e ainda não saiu. */
export function podeLiberarSaida(saida: Pick<SaidaEntrega, "status" | "liberadaEm">): boolean {
  return saida.liberadaEm === null && (saida.status === "em_formacao" || saida.status === "aguardando_entregador" || saida.status === "preparada");
}

/** A saída mudou (evento): substitui a que a tela tinha ou entra no começo da lista. */
export function adotarSaidaNaOperacao(saidas: SaidaEntrega[], atualizada: SaidaEntrega): SaidaEntrega[] {
  return saidas.some((item) => item.id === atualizada.id) ? saidas.map((item) => (item.id === atualizada.id ? atualizada : item)) : [atualizada, ...saidas];
}

/** Linha de resumo do cartão da rota: "3 pedidos · Pedidos #1, #2, #3 de 5 · fecha em 4 min". */
export function resumoDaRota(saida: SaidaEntrega, maxPedidosPorSaida: number | null, agora: Date = new Date()): string {
  const ativas = saida.paradas.filter((parada) => parada.encerradaEm === null);
  const consideradas = saida.status === "concluida" ? saida.paradas : ativas;
  const total = consideradas.length;
  const numeros = resumoDosPedidos(consideradas.map((parada) => parada.numeroPedido));
  const formacao = saida.status === "em_formacao" && maxPedidosPorSaida !== null ? ` de ${maxPedidosPorSaida} · ${formatarEspera(saida, agora)}` : "";
  return `${total} ${total === 1 ? "pedido" : "pedidos"}${numeros ? ` · Pedido${total === 1 ? "" : "s"} ${numeros}` : ""}${formacao}`;
}
