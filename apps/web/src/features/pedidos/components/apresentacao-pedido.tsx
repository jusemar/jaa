import {
  ROTULO_PAGAMENTO_ENTREGA,
  ROTULO_STATUS_PEDIDO,
  ROTULO_STATUS_PEDIDO_CLIENTE,
  formatarCep,
  formatarEnderecoResumido,
  montarTimelineAcompanhamento,
  montarTimelinePedido,
  trocoEsperadoCentavos,
  type DestinoPedido,
  type Pedido,
  type ResumoPedido,
} from "@jaa/contratos";
import { formatarHorarioMensagem } from "@/features/conversas/lib/horarios";
import { IconeCheck, IconeFechar } from "@/components/ui/icones";
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

/**
 * Subtotal e taxa de entrega do SNAPSHOT do pedido (o que valeu na compra). Nada é recalculado:
 * mudar o frete da zona depois não altera o que um pedido antigo mostra.
 */
function ValoresPedido({ pedido }: { pedido: Pick<ResumoPedido, "subtotalCentavos" | "freteFinalCentavos"> }) {
  return (
    <dl data-valores-pedido className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 text-xs text-conteudo-suave">
      <dt>Subtotal</dt>
      <dd className="text-right">{formatarPrecoCentavos(pedido.subtotalCentavos)}</dd>
      <dt>Taxa de entrega</dt>
      <dd data-taxa-entrega-pedido={pedido.freteFinalCentavos} className="text-right">
        {pedido.freteFinalCentavos === 0 ? "Grátis" : formatarPrecoCentavos(pedido.freteFinalCentavos)}
      </dd>
    </dl>
  );
}

/**
 * Acompanhamento: etapas concluídas (com o horário real), a atual e as futuras. As futuras são
 * derivadas da máquina de estados só para exibir — não existem no histórico até acontecerem.
 */
export function TimelinePedido({ pedido, visaoCliente = false }: { pedido: Pick<Pedido, "status" | "historico">; visaoCliente?: boolean }) {
  const etapas = visaoCliente ? montarTimelineAcompanhamento(pedido.status, pedido.historico) : montarTimelinePedido(pedido.status, pedido.historico);
  const rotulos = visaoCliente ? ROTULO_STATUS_PEDIDO_CLIENTE : ROTULO_STATUS_PEDIDO;

  // EMPRESA (gestão): a lista compacta de sempre. O trilho abaixo é a experiência do CLIENTE.
  if (!visaoCliente) {
    const marca = { concluida: "✓", atual: "●", futura: "○" } as const;
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

  return (
    /*
     * Trilho vertical: cada etapa é um marcador ligado ao seguinte. Concluída = marcador cheio com o
     * check e a hora real; ATUAL = marcador com anel e o texto em destaque; futura = marcador vazio e
     * texto apagado. A situação também vai escrita para leitor de tela — a cor nunca é a única pista.
     * O marcador tem largura fixa e o texto quebra ao lado dele: o alinhamento não se desfaz.
     */
    <ol aria-label="Acompanhamento do pedido" className="flex flex-col">
      {etapas.map((etapa, indice) => {
        const ultima = indice === etapas.length - 1;
        const cancelado = etapa.status === "cancelado";
        const atual = etapa.situacao === "atual";
        return (
          <li key={etapa.status} data-etapa={etapa.status} data-situacao={etapa.situacao} aria-current={atual ? "step" : undefined} className="flex gap-3">
            {/* Trilho CONTÍNUO: o conector encosta nos marcadores e fica verde até a etapa atual. */}
            <span aria-hidden className="flex w-6 shrink-0 flex-col items-center">
              <span
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${
                  etapa.situacao === "concluida"
                    ? "bg-marca text-marca-conteudo"
                    : atual
                      ? cancelado
                        ? "bg-perigo text-white shadow-[0_0_0_4px] shadow-perigo/20"
                        : "bg-marca text-marca-conteudo shadow-[0_0_0_4px] shadow-marca/25"
                      : "border-2 border-borda bg-superficie"
                }`}
              >
                {etapa.situacao === "concluida" ? <IconeCheck className="h-3.5 w-3.5" /> : atual ? <span className="h-2 w-2 rounded-full bg-current" /> : null}
              </span>
              {!ultima && <span className={`w-0.5 flex-1 ${etapa.situacao === "concluida" ? "bg-marca" : "bg-borda"}`} />}
            </span>
            <span className={`flex min-w-0 flex-1 flex-col [overflow-wrap:anywhere] ${ultima ? "" : "pb-3.5"}`}>
              {/* A etapa ATUAL ganha uma faixa suave: é o que a pessoa procura primeiro. */}
              <span className={`flex min-h-6 flex-col justify-center ${atual ? `-my-1 rounded-jaa-compacto px-2.5 py-1.5 ${cancelado ? "bg-perigo/10" : "bg-marca-suave/70"}` : ""}`}>
                <span
                  className={
                    atual ? `text-sm font-bold leading-snug ${cancelado ? "text-perigo" : "text-marca-suave-conteudo"}` : etapa.situacao === "futura" ? "text-sm leading-snug text-conteudo-suave/80" : "text-sm font-medium leading-snug text-conteudo"
                  }
                >
                  {rotulos[etapa.status]}
                  <span className="sr-only">{etapa.situacao === "concluida" ? " — concluída" : atual ? " — etapa atual" : " — próxima etapa"}</span>
                </span>
                {etapa.ocorridoEm && <span className="text-xs text-conteudo-suave">{formatarHorarioMensagem(etapa.ocorridoEm)}</span>}
              </span>
            </span>
          </li>
        );
      })}
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

/** Itens com a MONTAGEM gravada no pedido (snapshot): o que a empresa prepara e o cliente confere. */
function ItensDoPedido({ pedido }: { pedido: Pick<Pedido, "itens"> }) {
  return (
    <ol aria-label="Itens do pedido" className="flex flex-col gap-0.5 text-xs">
      {pedido.itens.map((item) => (
        <li key={item.id}>
          {item.quantidade}× {item.nomeProduto} — {formatarPrecoCentavos(item.precoUnitarioCentavos)} cada = {formatarPrecoCentavos(item.subtotalCentavos)}
          {/*
           * SNAPSHOT da montagem: grupo, opção e acréscimo como estavam na compra. Mudar o
           * cardápio depois não altera este pedido — é o que a empresa precisa preparar e o que o
           * cliente precisa conferir.
           */}
          {item.observacao && (
            <span data-observacao-pedido className="ml-4 block italic text-conteudo-suave">
              Observação: {item.observacao}
            </span>
          )}
          {item.escolhas.length > 0 && (
            <ul data-escolhas-pedido className="ml-4 flex flex-col text-conteudo-suave">
              {item.escolhas.map((escolha, indice) => (
                <li key={`${escolha.grupoNome}-${escolha.opcaoNome}-${indice}`}>
                  {escolha.grupoNome}: {escolha.opcaoNome}
                  {escolha.precoAdicionalCentavos > 0 && ` (+${formatarPrecoCentavos(escolha.precoAdicionalCentavos)})`}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}

export function DetalhePedido({
  pedido,
  aoFechar,
  titulo,
  acoes,
  aoVerPontoNoMapa,
  visaoCliente = false,
}: {
  pedido: Pedido;
  // Sem `aoFechar` não há o X: é o caso da tela exclusiva do pedido, que tem o seu "Voltar".
  aoFechar?: (() => void) | undefined;
  // Título próprio de quem usa (a empresa vê o nome do CLIENTE). Ausente: "Pedido #N — <empresa>".
  titulo?: string | undefined;
  acoes?: React.ReactNode;
  aoVerPontoNoMapa?: ((destino: DestinoPedido) => void) | undefined;
  visaoCliente?: boolean;
}) {
  const rotulos = visaoCliente ? ROTULO_STATUS_PEDIDO_CLIENTE : ROTULO_STATUS_PEDIDO;
  return (
    <article aria-label="Detalhe do pedido" className="flex flex-col gap-1.5 rounded-jaa border border-borda bg-superficie p-4 text-sm shadow-cartao">
      {aoFechar && (
        <button
          type="button"
          onClick={aoFechar}
          aria-label="Fechar pedido"
          className="grid h-9 w-9 shrink-0 place-items-center self-end rounded-jaa-compacto text-conteudo-suave transition-colors hover:bg-realce hover:text-conteudo"
        >
          <IconeFechar className="h-4 w-4" />
        </button>
      )}
      <h3 className="fonte-display text-base font-bold [overflow-wrap:anywhere]">{titulo ?? `Pedido #${pedido.numero} — ${pedido.empresa.nome}`}</h3>
      <p className="text-xs text-conteudo-suave">Cliente: {pedido.cliente.nomeExibicao}</p>
      <ItensDoPedido pedido={pedido} />
      <ValoresPedido pedido={pedido} />
      <p data-total-pedido className="fonte-display text-base font-bold">
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
