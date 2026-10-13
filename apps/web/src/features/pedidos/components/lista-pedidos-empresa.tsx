"use client";

import {
  ROTULO_FILTRO_PEDIDOS,
  ROTULO_PAGAMENTO_ENTREGA,
  ROTULO_PERIODO_PEDIDOS,
  filtroPedidosEmpresaSchema,
  periodoPedidosSchema,
  type ContagensPedidosEmpresa,
  type FiltroPedidosEmpresa,
  type PedidoDaEmpresa,
  type PeriodoPedidos,
  type SaidaEntrega,
} from "@jaa/contratos";
import { IconeCalendario, IconeSeta, IconeVoltar } from "@/components/ui/icones";
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

/*
 * FILTROS são CONTROLES: pílulas clicáveis, com contorno, estado "marcado" preenchido e a quantidade
 * num contador próprio. O status de cada pedido, na lista, continua sendo texto informativo — os dois
 * não se parecem de propósito.
 */

/**
 * Filtro por STATUS com a quantidade de cada um no período selecionado. As quantidades vêm do
 * servidor (o período inteiro, não a página); `null` = ainda carregando, sem número.
 */
export function FiltrosPedidos({
  filtro,
  contagens = null,
  aoFiltrar,
}: {
  filtro: FiltroPedidosEmpresa;
  contagens?: ContagensPedidosEmpresa | null;
  aoFiltrar: (filtro: FiltroPedidosEmpresa) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Filtrar pedidos por status"
      data-filtros-de-status
      className="flex flex-wrap gap-1.5"
    >
      {filtroPedidosEmpresaSchema.options.map((opcao) => {
        const marcado = filtro === opcao;
        const quantidade = contagens?.[opcao];
        return (
          <button
            key={opcao}
            type="button"
            data-filtro={opcao}
            aria-pressed={marcado}
            aria-label={quantidade === undefined ? ROTULO_FILTRO_PEDIDOS[opcao] : `${ROTULO_FILTRO_PEDIDOS[opcao]}: ${quantidade} ${quantidade === 1 ? "pedido" : "pedidos"}`}
            onClick={() => aoFiltrar(opcao)}
            className={`flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors ${marcado ? "border-marca bg-marca text-marca-conteudo" : "border-borda bg-superficie text-conteudo hover:bg-superficie-suave"}`}
          >
            {ROTULO_FILTRO_PEDIDOS[opcao]}
            {quantidade !== undefined && (
              <span
                data-quantidade-do-filtro={quantidade}
                className={`min-w-5 rounded-full px-1.5 py-0.5 text-center text-[11px] font-semibold tabular-nums leading-none ${marcado ? "bg-marca-conteudo/20 text-marca-conteudo" : "bg-superficie-suave text-conteudo-suave"}`}
              >
                {quantidade}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Filtro por PERÍODO (pela criação do pedido, no fuso da empresa — quem calcula é o servidor). No
 * personalizado aparecem as duas datas; o que estiver faltando ou fora de ordem é dito em texto, e a
 * lista continua mostrando o último período válido.
 */
export function FiltroDePeriodo({
  periodo,
  dataInicial,
  dataFinal,
  problema,
  aoEscolherPeriodo,
  aoMudarDatas,
  opcoes = periodoPedidosSchema.options,
  idDoCampo = "pedidos-periodo",
}: {
  // Períodos oferecidos (o histórico de entregas, por exemplo, não tem "Todo o período").
  opcoes?: readonly PeriodoPedidos[];
  idDoCampo?: string;
  periodo: PeriodoPedidos;
  dataInicial: string;
  dataFinal: string;
  problema: string | null;
  aoEscolherPeriodo: (periodo: PeriodoPedidos) => void;
  aoMudarDatas: (datas: { dataInicial: string; dataFinal: string }) => void;
}) {
  const campo = "min-h-9 rounded-jaa-compacto border border-borda bg-superficie px-2 text-sm text-conteudo";
  return (
    <div data-filtro-de-periodo={periodo} className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={idDoCampo} className="flex items-center gap-1.5 text-xs font-medium text-conteudo-suave">
          <IconeCalendario className="h-4 w-4" />
          Período
        </label>
        <select id={idDoCampo} value={periodo} onChange={(evento) => aoEscolherPeriodo(evento.target.value as PeriodoPedidos)} className={campo}>
          {opcoes.map((opcao) => (
            <option key={opcao} value={opcao}>
              {ROTULO_PERIODO_PEDIDOS[opcao]}
            </option>
          ))}
        </select>
        {periodo === "personalizado" && (
          <>
            <label className="flex items-center gap-1.5 text-xs text-conteudo-suave">
              De
              <input type="date" name="dataInicial" value={dataInicial} max={dataFinal || undefined} onChange={(evento) => aoMudarDatas({ dataInicial: evento.target.value, dataFinal })} className={campo} />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-conteudo-suave">
              até
              <input type="date" name="dataFinal" value={dataFinal} min={dataInicial || undefined} onChange={(evento) => aoMudarDatas({ dataInicial, dataFinal: evento.target.value })} className={campo} />
            </label>
          </>
        )}
      </div>
      {problema && (
        <p role="status" data-problema-do-periodo className="text-xs text-aviso">
          {problema}
        </p>
      )}
    </div>
  );
}

export function ListaPedidosEmpresa({
  pedidos,
  saidas = [],
  vazio = "Nenhum pedido aqui.",
  aoAbrir,
}: {
  pedidos: PedidoDaEmpresa[];
  saidas?: SaidaEntrega[];
  // O que dizer quando não há pedido (muda com o período e o filtro escolhidos).
  vazio?: string;
  aoAbrir: (pedido: PedidoDaEmpresa) => void;
}) {
  if (pedidos.length === 0)
    return <p data-lista-vazia className="text-sm text-conteudo-suave">{vazio}</p>;

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
