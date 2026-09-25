import type { SaidaEntrega, StatusPedido, StatusSaida } from "@jaa/contratos";

type StatusVisualEntrega = StatusSaida | "cancelada";

export const ROTULO_STATUS_PEDIDO_NA_LISTA: Record<StatusPedido, string> = {
  recebido: "Recebido",
  confirmado: "Confirmado (legado)",
  em_preparacao: "Em preparação",
  pronto: "Pronto",
  saiu_para_entrega: "Saiu para entrega",
  em_rota: "Saiu para entrega",
  entregue: "Entregue",
  cancelado: "Cancelado",
};

export const APRESENTACAO_STATUS_ENTREGA: Record<
  StatusVisualEntrega,
  { rotulo: string; fundo: string }
> = {
  em_formacao: { rotulo: "Em formação", fundo: "bg-amber-50" },
  aguardando_entregador: {
    rotulo: "Aguardando entregador",
    fundo: "bg-orange-50",
  },
  preparada: { rotulo: "Aguardando liberação", fundo: "bg-violet-50" },
  liberada_retirada: { rotulo: "Liberado para retirada", fundo: "bg-sky-50" },
  em_andamento: { rotulo: "Em rota", fundo: "bg-teal-50" },
  concluida: { rotulo: "Concluído", fundo: "bg-slate-50" },
  cancelada: { rotulo: "Cancelada", fundo: "bg-red-50" },
};

export function statusVisualEntregaDoPedido(
  statusPedido: StatusPedido,
  saida: SaidaEntrega | null,
): StatusVisualEntrega | null {
  if (statusPedido === "cancelado") return "cancelada";
  if (statusPedido === "entregue") return "concluida";
  return saida?.status ?? null;
}

export function apresentacaoEntregaDoPedido(
  statusPedido: StatusPedido,
  saida: SaidaEntrega | null,
) {
  const status = statusVisualEntregaDoPedido(statusPedido, saida);
  return status ? APRESENTACAO_STATUS_ENTREGA[status] : null;
}

export function encontrarSaidaDoPedido(
  saidas: SaidaEntrega[],
  pedidoId: string,
): SaidaEntrega | null {
  return (
    saidas.find((saida) =>
      saida.paradas.some((parada) => parada.pedidoId === pedidoId),
    ) ?? null
  );
}

function nomeRota(saida: SaidaEntrega): string {
  return saida.zonaPrincipal
    ? [
        saida.zonaPrincipal.nome,
        ...saida.zonasCombinadas.map((zona) => zona.nome),
      ].join(" + ")
    : "Manual";
}

export function ResumoLogisticoPedido({
  statusPedido,
  saida,
}: {
  statusPedido: StatusPedido;
  saida: SaidaEntrega | null;
}) {
  const apresentacao = apresentacaoEntregaDoPedido(statusPedido, saida);
  if (!apresentacao) return null;
  return (
    <div
      data-resumo-logistico
      className="mt-1.5 flex flex-col gap-0.5 border-l-2 border-borda pl-2 text-xs"
    >
      <span className="font-medium">Entrega: {apresentacao.rotulo}</span>
      {saida ? (
        <>
          <span>Rota: {nomeRota(saida)}</span>
          <span>
            Entregador:{" "}
            {saida.entregador?.nomeExibicao ?? "Aguardando atribuição"}
          </span>
        </>
      ) : null}
    </div>
  );
}

export function LegendaStatusEntrega() {
  return (
    <div
      aria-label="Legenda dos status da entrega"
      className="flex flex-wrap items-center gap-1.5 text-[11px] text-conteudo-suave"
    >
      <span className="font-medium text-conteudo">Status da entrega:</span>
      {Object.entries(APRESENTACAO_STATUS_ENTREGA).map(([status, item]) => (
        <span
          key={status}
          className={`whitespace-nowrap rounded-full border border-borda px-2 py-0.5 font-medium text-conteudo ${item.fundo}`}
        >
          {item.rotulo}
        </span>
      ))}
    </div>
  );
}
