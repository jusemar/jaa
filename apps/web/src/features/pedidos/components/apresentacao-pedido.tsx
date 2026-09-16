import { ROTULO_PAGAMENTO_ENTREGA, ROTULO_STATUS_PEDIDO, trocoEsperadoCentavos, type Pedido, type ResumoPedido } from "@jaa/contratos";
import { formatarPrecoCentavos } from "@/features/produtos/lib/precos";

// Interface TÉCNICA do Pedido Jaa: card na conversa e detalhe. O Jaa não processa pagamento; só mostra
// como o cliente pretende pagar NA ENTREGA. Troco aparece SOMENTE no dinheiro com troco.

function LinhaPagamento({ pedido }: { pedido: Pick<Pedido, "formaPagamentoNaEntrega" | "trocoParaCentavos" | "totalCentavos"> }) {
  const troco = trocoEsperadoCentavos(pedido);
  return (
    <>
      <p data-pagamento={pedido.formaPagamentoNaEntrega} className="text-xs">
        Pagamento: {ROTULO_PAGAMENTO_ENTREGA[pedido.formaPagamentoNaEntrega]}
      </p>
      {pedido.trocoParaCentavos !== null && (
        <p data-troco className="text-xs">
          Troco para: {formatarPrecoCentavos(pedido.trocoParaCentavos)}
          {troco !== null && troco > 0 && <span className="text-zinc-500"> (levar {formatarPrecoCentavos(troco)} de troco)</span>}
        </p>
      )}
    </>
  );
}

export function CardPedido({ pedido, aoAbrir }: { pedido: ResumoPedido; aoAbrir: (pedidoId: string) => void }) {
  return (
    <div data-card-pedido={pedido.id} className="flex min-w-0 flex-col gap-1 rounded border border-emerald-600 bg-white/70 p-2 text-left">
      <p className="text-xs font-semibold text-emerald-800">Pedido</p>
      <ul className="text-xs">
        {pedido.itens.map((item) => (
          <li key={item.nomeProduto}>
            {item.quantidade}× {item.nomeProduto} — {formatarPrecoCentavos(item.subtotalCentavos)}
          </li>
        ))}
      </ul>
      <p data-total-pedido className="text-xs font-medium">
        Total: {formatarPrecoCentavos(pedido.totalCentavos)}
      </p>
      <LinhaPagamento pedido={pedido} />
      <p data-status-pedido={pedido.status} className="text-xs text-zinc-600">
        Status: {ROTULO_STATUS_PEDIDO[pedido.status]}
      </p>
      <button type="button" onClick={() => aoAbrir(pedido.id)} className="self-start rounded border px-2 py-0.5 text-xs">
        Ver pedido
      </button>
    </div>
  );
}

export function DetalhePedido({ pedido, aoFechar }: { pedido: Pedido; aoFechar: () => void }) {
  return (
    <article aria-label="Detalhe do pedido" className="flex flex-col gap-1 rounded border border-zinc-200 bg-white p-3 text-sm">
      <button type="button" onClick={aoFechar} className="self-end text-xs underline">
        Fechar pedido
      </button>
      <h3 className="font-semibold">Pedido — {pedido.empresa.nome}</h3>
      <p className="text-xs text-zinc-500">Cliente: {pedido.cliente.nomeExibicao}</p>
      <ol aria-label="Itens do pedido" className="flex flex-col gap-0.5 text-xs">
        {pedido.itens.map((item) => (
          <li key={item.id}>
            {item.quantidade}× {item.nomeProduto} — {formatarPrecoCentavos(item.precoUnitarioCentavos)} cada = {formatarPrecoCentavos(item.subtotalCentavos)}
          </li>
        ))}
      </ol>
      <p data-total-pedido className="font-medium">
        Total: {formatarPrecoCentavos(pedido.totalCentavos)}
      </p>
      <LinhaPagamento pedido={pedido} />
      <p data-status-pedido={pedido.status}>Status: {ROTULO_STATUS_PEDIDO[pedido.status]}</p>
    </article>
  );
}
