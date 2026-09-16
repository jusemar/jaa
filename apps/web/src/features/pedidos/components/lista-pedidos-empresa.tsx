"use client";

import {
  ROTULO_FILTRO_PEDIDOS,
  ROTULO_PAGAMENTO_ENTREGA,
  ROTULO_STATUS_PEDIDO,
  filtroPedidosEmpresaSchema,
  type FiltroPedidosEmpresa,
  type PedidoDaEmpresa,
} from "@jaa/contratos";
import { formatarHorarioMensagem } from "@/features/conversas/lib/horarios";
import { formatarPrecoCentavos } from "@/features/produtos/lib/precos";

// Lista operacional: clareza para triagem (quem pediu, quanto, como paga, em que pé está).

export function FiltrosPedidos({ filtro, aoFiltrar }: { filtro: FiltroPedidosEmpresa; aoFiltrar: (filtro: FiltroPedidosEmpresa) => void }) {
  return (
    <div role="group" aria-label="Filtrar pedidos" className="flex flex-wrap gap-1">
      {filtroPedidosEmpresaSchema.options.map((opcao) => (
        <button
          key={opcao}
          type="button"
          data-filtro={opcao}
          aria-pressed={filtro === opcao}
          onClick={() => aoFiltrar(opcao)}
          className={`rounded border px-2 py-1 text-xs ${filtro === opcao ? "bg-black text-white" : ""}`}
        >
          {ROTULO_FILTRO_PEDIDOS[opcao]}
        </button>
      ))}
    </div>
  );
}

export function ListaPedidosEmpresa({ pedidos, aoAbrir }: { pedidos: PedidoDaEmpresa[]; aoAbrir: (pedido: PedidoDaEmpresa) => void }) {
  if (pedidos.length === 0) return <p className="text-sm text-zinc-500">Nenhum pedido aqui.</p>;

  return (
    <ol aria-label="Pedidos" className="flex flex-col divide-y divide-zinc-200 rounded border border-zinc-200 text-sm">
      {pedidos.map((pedido) => (
        <li key={pedido.id} data-pedido={pedido.id} className="flex items-center justify-between gap-2 px-3 py-2">
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-medium">{pedido.cliente.nomeExibicao}</span>
            <span className="text-xs text-zinc-500">
              Criado às {formatarHorarioMensagem(pedido.criadoEm)} · {pedido.quantidadeItens} {pedido.quantidadeItens === 1 ? "item" : "itens"} ·{" "}
              {formatarPrecoCentavos(pedido.totalCentavos)} · {ROTULO_PAGAMENTO_ENTREGA[pedido.formaPagamentoNaEntrega]}
            </span>
            <span data-status-pedido={pedido.status} className="text-xs">
              {ROTULO_STATUS_PEDIDO[pedido.status]}
            </span>
          </span>
          <button type="button" onClick={() => aoAbrir(pedido)} className="shrink-0 rounded border px-2 py-1 text-xs">
            Abrir
          </button>
        </li>
      ))}
    </ol>
  );
}
