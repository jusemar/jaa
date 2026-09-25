"use client";

import {
  ROTULO_FILTRO_PEDIDOS,
  ROTULO_PAGAMENTO_ENTREGA,
  filtroPedidosEmpresaSchema,
  type FiltroPedidosEmpresa,
  type PedidoDaEmpresa,
  type SaidaEntrega,
} from "@jaa/contratos";
import { formatarHorarioMensagem } from "@/features/conversas/lib/horarios";
import { formatarPrecoCentavos } from "@/features/produtos/lib/precos";
import {
  apresentacaoEntregaDoPedido,
  encontrarSaidaDoPedido,
  ResumoLogisticoPedido,
  ROTULO_STATUS_PEDIDO_NA_LISTA,
} from "./resumo-logistico-pedido";

// Lista operacional: clareza para triagem (quem pediu, quanto, como paga, em que pé está).

export function FiltrosPedidos({
  filtro,
  aoFiltrar,
}: {
  filtro: FiltroPedidosEmpresa;
  aoFiltrar: (filtro: FiltroPedidosEmpresa) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Filtrar pedidos"
      className="flex flex-wrap gap-1"
    >
      {filtroPedidosEmpresaSchema.options.map((opcao) => (
        <button
          key={opcao}
          type="button"
          data-filtro={opcao}
          aria-pressed={filtro === opcao}
          onClick={() => aoFiltrar(opcao)}
          className={`rounded-jaa border px-2 py-1 text-xs ${filtro === opcao ? "bg-marca text-white" : ""}`}
        >
          {ROTULO_FILTRO_PEDIDOS[opcao]}
        </button>
      ))}
    </div>
  );
}

export function ListaPedidosEmpresa({
  pedidos,
  saidas = [],
  aoAbrir,
}: {
  pedidos: PedidoDaEmpresa[];
  saidas?: SaidaEntrega[];
  aoAbrir: (pedido: PedidoDaEmpresa) => void;
}) {
  if (pedidos.length === 0)
    return <p className="text-sm text-conteudo-suave">Nenhum pedido aqui.</p>;

  return (
    <ol
      aria-label="Pedidos"
      className="flex flex-col divide-y divide-borda rounded-jaa border border-borda text-sm"
    >
      {pedidos.map((pedido) => {
        const saida = encontrarSaidaDoPedido(saidas, pedido.id);
        const apresentacaoEntrega = apresentacaoEntregaDoPedido(
          pedido.status,
          saida,
        );
        return (
          <li
            key={pedido.id}
            data-pedido={pedido.id}
            className={`flex items-center justify-between gap-2 px-3 py-2 ${apresentacaoEntrega?.fundo ?? "bg-superficie"}`}
          >
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-medium">
                Pedido #{pedido.numero} · {pedido.cliente.nomeExibicao}
              </span>
              <span className="text-xs text-conteudo-suave">
                Criado às {formatarHorarioMensagem(pedido.criadoEm)} ·{" "}
                {pedido.quantidadeItens}{" "}
                {pedido.quantidadeItens === 1 ? "item" : "itens"} ·{" "}
                {formatarPrecoCentavos(pedido.totalCentavos)} ·{" "}
                {ROTULO_PAGAMENTO_ENTREGA[pedido.formaPagamentoNaEntrega]}
              </span>
              <span data-status-pedido={pedido.status} className="text-xs">
                Pedido: {ROTULO_STATUS_PEDIDO_NA_LISTA[pedido.status]}
              </span>
              <ResumoLogisticoPedido
                statusPedido={pedido.status}
                saida={saida}
              />
            </span>
            <button
              type="button"
              onClick={() => aoAbrir(pedido)}
              className="shrink-0 rounded-jaa border px-2 py-1 text-xs"
            >
              Abrir
            </button>
          </li>
        );
      })}
    </ol>
  );
}
