"use client";

import {
  ROTULO_FILTRO_PEDIDOS,
  ROTULO_PAGAMENTO_ENTREGA,
  filtroPedidosEmpresaSchema,
  type FiltroPedidosEmpresa,
  type PedidoDaEmpresa,
  type SaidaEntrega,
} from "@jaa/contratos";
import { IconeSeta, IconeVoltar } from "@/components/ui/icones";
import { formatarHorarioMensagem } from "@/features/conversas/lib/horarios";
import { formatarPrecoCentavos } from "@/features/produtos/lib/precos";
import type { ResumoDaPagina } from "../lib/paginacao-pedidos";
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
            <div className="flex min-w-0 flex-1 flex-col">
            {/* Tocar nos dados do pedido também abre; o botão "Abrir" ao lado faz o mesmo. */}
            <button type="button" data-abrir-pedido onClick={() => aoAbrir(pedido)} className="flex min-w-0 flex-col rounded-jaa-compacto text-left">
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
            </button>
              <ResumoLogisticoPedido
                statusPedido={pedido.status}
                saida={saida}
              />
            </div>
            <button
              type="button"
              data-botao-abrir
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

/**
 * "1–10 de 36 pedidos" + ‹ Anterior · Página 1 de 4 · Próxima ›. Com uma página só, fica a contagem.
 * Os botões não somem quando não há para onde ir: ficam desabilitados, e a posição não pula.
 */
export function PaginacaoPedidos({ resumo, ocupado = false, aoAnterior, aoProxima }: { resumo: ResumoDaPagina; ocupado?: boolean; aoAnterior: () => void; aoProxima: () => void }) {
  if (resumo.total === 0) return null;
  const botao = "flex min-h-9 items-center gap-1 rounded-jaa border border-borda px-2.5 text-xs font-medium transition-colors hover:bg-superficie-suave disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <nav aria-label="Páginas de pedidos" data-paginacao-pedidos className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <p data-contagem-pedidos aria-live="polite" className="text-xs text-conteudo-suave">
        {resumo.contagem}
      </p>
      {resumo.totalPaginas > 1 && (
        <div className="flex items-center gap-2">
          <button type="button" data-pagina-anterior disabled={!resumo.temAnterior || ocupado} onClick={aoAnterior} className={botao}>
            <IconeVoltar className="h-3.5 w-3.5" />
            Anterior
          </button>
          <span data-pagina-atual className="whitespace-nowrap text-xs tabular-nums text-conteudo">
            Página {resumo.pagina} de {resumo.totalPaginas}
          </span>
          <button type="button" data-pagina-proxima disabled={!resumo.temProxima || ocupado} onClick={aoProxima} className={botao}>
            Próxima
            <IconeSeta className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </nav>
  );
}
