import {
  ROTULO_PAGAMENTO_ENTREGA,
  ROTULO_STATUS_PEDIDO,
  ROTULO_STATUS_PEDIDO_CLIENTE,
  formatarCep,
  formatarEnderecoResumido,
  montarTimelinePedido,
  trocoEsperadoCentavos,
  type DestinoPedido,
  type Pedido,
  type ResumoPedido,
} from "@jaa/contratos";
import { formatarHorarioMensagem } from "@/features/conversas/lib/horarios";
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
          {troco !== null && troco > 0 && <span className="text-conteudo-suave"> (levar {formatarPrecoCentavos(troco)} de troco)</span>}
        </p>
      )}
    </>
  );
}

export function CardPedido({ pedido, aoAbrir, visaoCliente = false }: { pedido: ResumoPedido; aoAbrir: (pedidoId: string) => void; visaoCliente?: boolean }) {
  const rotulos = visaoCliente ? ROTULO_STATUS_PEDIDO_CLIENTE : ROTULO_STATUS_PEDIDO;
  return (
    /*
     * O card tem SEMPRE fundo claro e texto escuro, inclusive dentro de um balão próprio (que é
     * jade com texto quase branco). Herdar a cor do balão deixava o conteúdo do pedido branco sobre
     * verde-claro, praticamente ilegível. Quem identifica "fui eu que enviei" é o balão em volta.
     */
    <div data-card-pedido={pedido.id} className="flex min-w-0 flex-col gap-1 rounded-jaa border border-marca/40 bg-mensagem-recebida p-2 text-left text-conteudo shadow-balao">
      <p className="text-xs font-semibold text-marca">Pedido #{pedido.numero}</p>
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
      <p data-status-pedido={pedido.status} className="text-xs text-conteudo-suave">
        Status: {rotulos[pedido.status]}
      </p>
      <button type="button" onClick={() => aoAbrir(pedido.id)} className="self-start rounded-full border border-borda px-2.5 py-0.5 text-xs font-medium text-marca hover:bg-marca-suave">
        Ver pedido
      </button>
    </div>
  );
}

/**
 * Acompanhamento: etapas concluídas (com o horário real), a atual e as futuras. As futuras são
 * derivadas da máquina de estados só para exibir — não existem no histórico até acontecerem.
 */
export function TimelinePedido({ pedido, visaoCliente = false }: { pedido: Pick<Pedido, "status" | "historico">; visaoCliente?: boolean }) {
  const etapas = montarTimelinePedido(pedido.status, pedido.historico);
  const marca = { concluida: "✓", atual: "●", futura: "○" } as const;
  const rotulos = visaoCliente ? ROTULO_STATUS_PEDIDO_CLIENTE : ROTULO_STATUS_PEDIDO;

  return (
    <ol aria-label="Acompanhamento do pedido" className="flex flex-col gap-0.5 text-xs">
      {etapas.map((etapa) => (
        <li key={etapa.status} data-etapa={etapa.status} data-situacao={etapa.situacao} className={etapa.situacao === "futura" ? "text-conteudo-suave/70" : etapa.situacao === "atual" ? "font-semibold" : ""}>
          <span aria-hidden>{marca[etapa.situacao]} </span>
          {rotulos[etapa.status]}
          {etapa.ocorridoEm && <span className="text-conteudo-suave"> — {formatarHorarioMensagem(etapa.ocorridoEm)}</span>}
        </li>
      ))}
    </ol>
  );
}

/**
 * ENTREGA do pedido: o texto é o SNAPSHOT do que o cliente cadastrou (editar o endereço depois não
 * muda pedido antigo) e o ponto é a coordenada que ele confirmou no mapa. Latitude/longitude cruas
 * não são exibidas: quem lê vê o endereço e o selo de ponto confirmado.
 */
export function EnderecoDoPedido({ destino, aoVerNoMapa }: { destino: DestinoPedido | null; aoVerNoMapa?: ((destino: DestinoPedido) => void) | undefined }) {
  if (!destino) {
    return (
      <p data-sem-destino className="text-xs text-conteudo-suave">
        Este pedido é anterior ao ponto de entrega confirmado.
      </p>
    );
  }

  return (
    <div data-destino-pedido className="flex flex-col gap-0.5 text-xs">
      <p className="font-medium">Entregar em</p>
      <p>{formatarEnderecoResumido(destino)}</p>
      <p className="text-conteudo-suave">
        {destino.bairro}, {destino.cidade}/{destino.uf} · CEP {formatarCep(destino.cep)}
      </p>
      {destino.pontoReferencia && <p className="text-conteudo-suave">Referência: {destino.pontoReferencia}</p>}
      <p data-ponto-confirmado className="text-marca">📍 Ponto de entrega confirmado</p>
      {aoVerNoMapa && (
        <button type="button" data-ver-ponto-mapa onClick={() => aoVerNoMapa(destino)} className="self-start rounded-jaa border px-2 py-0.5">
          Ver ponto no mapa
        </button>
      )}
    </div>
  );
}

export function DetalhePedido({
  pedido,
  aoFechar,
  acoes,
  aoVerPontoNoMapa,
  visaoCliente = false,
}: {
  pedido: Pedido;
  aoFechar: () => void;
  acoes?: React.ReactNode;
  aoVerPontoNoMapa?: ((destino: DestinoPedido) => void) | undefined;
  visaoCliente?: boolean;
}) {
  const rotulos = visaoCliente ? ROTULO_STATUS_PEDIDO_CLIENTE : ROTULO_STATUS_PEDIDO;
  return (
    <article aria-label="Detalhe do pedido" className="flex flex-col gap-1 rounded-jaa border border-borda bg-superficie p-3 text-sm">
      <button type="button" onClick={aoFechar} className="self-end text-xs underline">
        Fechar pedido
      </button>
      <h3 className="font-semibold">Pedido #{pedido.numero} — {pedido.empresa.nome}</h3>
      <p className="text-xs text-conteudo-suave">Cliente: {pedido.cliente.nomeExibicao}</p>
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
      <EnderecoDoPedido destino={pedido.destino} aoVerNoMapa={aoVerPontoNoMapa} />
      <LinhaPagamento pedido={pedido} />
      <p data-status-pedido={pedido.status}>Status: {rotulos[pedido.status]}</p>
      {pedido.motivoCancelamento && (
        <p data-motivo-cancelamento className="text-xs text-perigo">
          Motivo do cancelamento: {pedido.motivoCancelamento}
        </p>
      )}
      <TimelinePedido pedido={pedido} visaoCliente={visaoCliente} />
      {acoes}
    </article>
  );
}
