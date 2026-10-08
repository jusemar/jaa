"use client";

import {
  EXPLICACAO_STATUS_PEDIDO_CLIENTE,
  ROTULO_PAGAMENTO_ENTREGA,
  ROTULO_STATUS_PEDIDO_CLIENTE,
  formatarCep,
  formatarEnderecoResumido,
  statusPedidoTerminal,
  trocoEsperadoCentavos,
  type Pedido,
  type ResumoPedido,
} from "@jaa/contratos";
import { useEffect, useState, type ReactNode } from "react";
import { IconeCheck, IconeDinheiro, IconeEntrega, IconeFechar, IconeLocal, IconePedidos, IconeRelogio, IconeSetaBaixo } from "@/components/ui/icones";
import { AcompanhamentoDoPedido } from "@/features/entregas/components/acompanhamento-cliente";
import { formatarPrecoCentavos } from "@/features/produtos/lib/precos";
import { obterPedido } from "../lib/api-pedidos";
import { TimelinePedido } from "./apresentacao-pedido";

/*
 * O PEDIDO DO CLIENTE DENTRO DA CONVERSA. A mensagem de pedido não é um balão: é o próprio
 * acompanhamento, no lugar onde antes ficava o card com "Acompanhar pedido".
 *
 * - pedido ATIVO: aberto sempre — status em destaque, o que está acontecendo, linha do tempo, resumo,
 *   itens (abrem e fecham ali mesmo), endereço, entrega (fila, entregador e mapa quando é a vez dele);
 * - pedido ENTREGUE ou CANCELADO: uma linha compacta, para o histórico da conversa não virar uma
 *   pilha de painéis; "Ver detalhes" abre o mesmo conteúdo ali mesmo e "Recolher" fecha.
 *
 * Nada de outra tela, painel, modal ou rota. O status vem do resumo que a conversa já mantém em tempo
 * real (`pedido:status-atualizado`); horários, endereço e motivo são relidos da API quando ele muda.
 */

const data = (iso: string) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
const hora = (iso: string) => new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

const totalDeItens = (resumo: ResumoPedido) => resumo.itens.reduce((total, item) => total + item.quantidade, 0);
const rotuloDeItens = (quantidade: number) => `${quantidade} ${quantidade === 1 ? "item" : "itens"}`;

function Cartao({ titulo, Icone, acao, children }: { titulo: string; Icone: (propriedades: { className?: string }) => ReactNode; acao?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-jaa border border-borda bg-superficie p-3.5 shadow-suave @[30rem]:p-4">
      <h4 className="flex items-center gap-2.5 text-sm font-semibold text-conteudo">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-marca-suave text-marca">
          <Icone className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{titulo}</span>
        {acao}
      </h4>
      {children}
    </section>
  );
}

// Rótulo à esquerda e valor à direita; em largura apertada o valor quebra, nunca sai do cartão.
function Linha({ rotulo, valor, forte = false }: { rotulo: ReactNode; valor: ReactNode; forte?: boolean }) {
  return (
    <div className={`flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 ${forte ? "fonte-display text-lg font-bold text-conteudo" : "text-[13px] text-conteudo-suave"}`}>
      <dt className="min-w-0">{rotulo}</dt>
      <dd className={`ml-auto min-w-0 text-right [overflow-wrap:anywhere] ${forte ? "" : "text-conteudo"}`}>{valor}</dd>
    </div>
  );
}

function ResumoDoPedido({ resumo }: { resumo: ResumoPedido }) {
  const troco = trocoEsperadoCentavos(resumo);
  return (
    <Cartao titulo="Resumo do pedido" Icone={IconePedidos}>
      <p className="text-[13px] text-conteudo">
        <span className="font-semibold">{rotuloDeItens(totalDeItens(resumo))}</span>
        <span className="line-clamp-2 text-conteudo-suave [overflow-wrap:anywhere]">{resumo.itens.map((item) => `${item.quantidade}x ${item.nomeProduto}`).join(", ")}</span>
      </p>
      <dl className="flex flex-col gap-1.5 border-t border-borda pt-3">
        <Linha rotulo="Subtotal" valor={formatarPrecoCentavos(resumo.subtotalCentavos)} />
        <Linha rotulo="Taxa de entrega" valor={resumo.freteFinalCentavos === 0 ? "Grátis" : formatarPrecoCentavos(resumo.freteFinalCentavos)} />
        <div data-total-pedido className="mt-1 border-t border-borda pt-2.5">
          <Linha rotulo="Total" valor={formatarPrecoCentavos(resumo.totalCentavos)} forte />
        </div>
        <Linha
          rotulo={
            <span className="flex items-center gap-1.5">
              <IconeDinheiro className="h-4 w-4" />
              Pagamento
            </span>
          }
          valor={ROTULO_PAGAMENTO_ENTREGA[resumo.formaPagamentoNaEntrega]}
        />
        {resumo.trocoParaCentavos !== null && (
          <Linha rotulo="Troco para" valor={`${formatarPrecoCentavos(resumo.trocoParaCentavos)}${troco !== null && troco > 0 ? ` (levar ${formatarPrecoCentavos(troco)})` : ""}`} />
        )}
      </dl>
    </Cartao>
  );
}

/** Itens com a montagem gravada no pedido (snapshot). Abre e fecha no próprio lugar. */
function ItensDoPedido({ resumo, abertosInicialmente }: { resumo: ResumoPedido; abertosInicialmente: boolean }) {
  return (
    <details data-itens-do-pedido open={abertosInicialmente} className="group rounded-jaa border border-borda bg-superficie shadow-suave">
      <summary className="flex min-h-12 cursor-pointer select-none list-none flex-wrap items-center gap-x-2.5 gap-y-1 rounded-jaa px-3.5 py-2 text-sm font-semibold text-conteudo transition-colors hover:bg-superficie-suave focus-visible:outline-2 focus-visible:outline-marca @[30rem]:px-4 [&::-webkit-details-marker]:hidden">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-marca-suave text-marca">
          <IconePedidos className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">Itens do pedido</span>
        <span className="flex items-center gap-1 rounded-full bg-marca-suave px-2.5 py-1 text-xs font-semibold text-marca-suave-conteudo">
          Ver itens ({totalDeItens(resumo)})
          <IconeSetaBaixo className="h-4 w-4 transition-transform group-open:rotate-180" />
        </span>
      </summary>
      <ul className="flex flex-col divide-y divide-borda border-t border-borda px-3.5 @[30rem]:px-4">
        {resumo.itens.map((item, indice) => (
          // O mesmo produto pode aparecer duas vezes com montagens diferentes: a chave leva o índice.
          <li key={`${item.nomeProduto}-${indice}`} className="flex items-start gap-3 py-3 text-[13px]">
            <span className="grid h-6 min-w-6 shrink-0 place-items-center rounded-jaa-compacto bg-superficie-suave px-1 text-xs font-semibold text-conteudo">{item.quantidade}x</span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium text-conteudo [overflow-wrap:anywhere]">{item.nomeProduto}</span>
              {item.escolhas.length > 0 && <span className="block text-conteudo-suave [overflow-wrap:anywhere]">{item.escolhas.join(" · ")}</span>}
              {item.observacao && <span className="block italic text-conteudo-suave [overflow-wrap:anywhere]">“{item.observacao}”</span>}
            </span>
            <span className="shrink-0 font-medium text-conteudo">{formatarPrecoCentavos(item.subtotalCentavos)}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function EnderecoDeEntrega({ destino }: { destino: NonNullable<Pedido["destino"]> }) {
  return (
    <Cartao titulo="Endereço de entrega" Icone={IconeLocal}>
      <p data-destino-pedido className="text-[13px] leading-relaxed text-conteudo [overflow-wrap:anywhere]">
        <span className="font-medium">{formatarEnderecoResumido(destino)}</span>
        <span className="block text-conteudo-suave">{destino.bairro}</span>
        <span className="block text-conteudo-suave">
          {destino.cidade}/{destino.uf} · CEP {formatarCep(destino.cep)}
        </span>
        {destino.pontoReferencia && <span className="block text-conteudo-suave">Referência: {destino.pontoReferencia}</span>}
      </p>
      <p data-ponto-confirmado className="flex items-center gap-1.5 self-start rounded-full bg-marca-suave px-3 py-1.5 text-xs font-medium text-marca-suave-conteudo">
        <IconeLocal className="h-3.5 w-3.5 shrink-0" />
        Ponto de entrega confirmado
      </p>
    </Cartao>
  );
}

export function PedidoNaConversaApresentacao({
  resumo,
  criadoEm,
  pedido,
  aberto,
  aoAlternar,
  entrega,
  itensAbertosInicialmente = false,
}: {
  // O resumo que a conversa mantém em tempo real: status, itens, total e pagamento.
  resumo: ResumoPedido;
  // Quando o pedido foi feito (a hora da própria mensagem).
  criadoEm: string;
  // O pedido completo (horários das etapas, endereço, motivo), quando já foi lido.
  pedido: Pedido | null;
  // Finalizado: recolhido até a pessoa pedir os detalhes. Ativo: sempre aberto.
  aberto: boolean;
  aoAlternar?: (() => void) | undefined;
  // Fila, entregador e mapa (componente próprio, com o realtime dele). Só em pedido ativo.
  entrega?: ReactNode;
  itensAbertosInicialmente?: boolean;
}) {
  const terminal = statusPedidoTerminal(resumo.status);
  const cancelado = resumo.status === "cancelado";
  const rotulo = ROTULO_STATUS_PEDIDO_CLIENTE[resumo.status];
  // Na linha compacta, "Pedido #19 · Cancelado" (o rótulo completo repetiria a palavra "pedido").
  const rotuloCurto = cancelado ? "Cancelado" : rotulo;

  if (terminal && !aberto) {
    return (
      <article data-pedido-na-conversa={resumo.id} data-apresentacao="compacta" data-status-pedido={resumo.status} className="flex flex-wrap items-center gap-x-3 gap-y-2.5 rounded-jaa border border-borda bg-superficie p-3.5 shadow-suave">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${cancelado ? "bg-perigo/10 text-perigo" : "bg-marca-suave text-marca"}`}>
          {cancelado ? <IconeFechar className="h-4 w-4" /> : <IconeCheck className="h-4 w-4" />}
        </span>
        <p className="min-w-[9rem] flex-1 text-[13px] text-conteudo-suave [overflow-wrap:anywhere]">
          <span className="block text-sm font-semibold text-conteudo">
            Pedido #{resumo.numero} · <span className={cancelado ? "text-perigo" : "text-marca"}>{rotuloCurto}</span>
          </span>
          {rotuloDeItens(totalDeItens(resumo))} · {formatarPrecoCentavos(resumo.totalCentavos)} · {data(criadoEm)}
        </p>
        <button
          type="button"
          data-ver-detalhes-do-pedido
          aria-expanded={false}
          onClick={aoAlternar}
          className="flex min-h-11 items-center gap-1 rounded-jaa-compacto bg-marca-suave px-3.5 text-[13px] font-medium text-marca-suave-conteudo transition-colors hover:bg-marca-suave/80 sm:min-h-9"
        >
          Ver detalhes
          <IconeSetaBaixo className="h-3.5 w-3.5" />
        </button>
      </article>
    );
  }

  return (
    /*
     * Superfície BRANCA, com as seções em cartões de borda discreta (nenhuma placa colorida: uma coluna
     * mais curta que a outra não deixa uma área vazia pintada); o verde fica para o status, a
     * linha do tempo, os ícones e as confirmações. A altura é SEMPRE a do conteúdo: as duas colunas são
     * pilhas independentes alinhadas pelo topo (`items-start`) — nada é esticado para igualar alturas. O componente mede a PRÓPRIA largura (`@container`): duas colunas internas só
     * quando cabem com folga (a partir de 34rem de componente — não da janela); abaixo disso, uma.
     */
    <article
      data-pedido-na-conversa={resumo.id}
      data-apresentacao="completa"
      data-status-pedido={resumo.status}
      aria-label={`Pedido número ${resumo.numero}, ${rotulo}`}
      className="@container rounded-jaa border border-borda bg-superficie shadow-cartao"
    >
      <div className="flex flex-col gap-3 p-3 @[30rem]:gap-4 @[30rem]:p-4">
        <header className="flex flex-col gap-2 px-0.5">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
            <div className="min-w-0">
              <h3 className="fonte-display text-xl font-bold leading-tight text-conteudo @[30rem]:text-2xl">Pedido #{resumo.numero}</h3>
              <p className="text-[13px] text-conteudo-suave">
                {data(criadoEm)} às {hora(criadoEm)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <p
                data-status-atual
                className={`flex items-center gap-2 rounded-full px-4 py-2 text-[15px] font-bold ring-1 ${cancelado ? "bg-perigo/10 text-perigo ring-perigo/20" : "bg-marca-suave text-marca-suave-conteudo ring-marca/25"}`}
              >
                {cancelado ? <IconeFechar className="h-[18px] w-[18px] shrink-0" /> : resumo.status === "entregue" ? <IconeCheck className="h-[18px] w-[18px] shrink-0" /> : resumo.status === "saiu_para_entrega" || resumo.status === "em_rota" ? <IconeEntrega className="h-[18px] w-[18px] shrink-0" /> : <IconeRelogio className="h-[18px] w-[18px] shrink-0" />}
                {rotulo}
              </p>
              {terminal && (
                <button type="button" data-recolher-pedido aria-expanded onClick={aoAlternar} className="flex min-h-11 items-center gap-1 rounded-jaa-compacto px-2.5 text-[13px] font-medium text-marca transition-colors hover:bg-marca-suave sm:min-h-9">
                  Recolher
                  <IconeSetaBaixo className="h-4 w-4 rotate-180" />
                </button>
              )}
            </div>
          </div>
          <p data-explicacao-status className="text-sm text-conteudo [overflow-wrap:anywhere]">
            {EXPLICACAO_STATUS_PEDIDO_CLIENTE[resumo.status]}
          </p>
          {pedido?.motivoCancelamento && (
            <p data-motivo-cancelamento className="text-[13px] text-perigo [overflow-wrap:anywhere]">
              Motivo: {pedido.motivoCancelamento}
            </p>
          )}
        </header>

        <div data-colunas-do-pedido className="grid gap-3 @[30rem]:gap-4 @[34rem]:grid-cols-[minmax(0,9fr)_minmax(0,11fr)] @[34rem]:items-start">
          <div className="flex min-w-0 flex-col gap-3 @[30rem]:gap-4">
            <Cartao titulo="Acompanhamento" Icone={IconeRelogio}>
              {/* Os horários vêm do histórico real; enquanto o pedido completo carrega, as etapas já aparecem. */}
              <TimelinePedido pedido={{ status: resumo.status, historico: pedido?.historico ?? [] }} visaoCliente />
            </Cartao>
            {!terminal && entrega}
          </div>
          <div className="flex min-w-0 flex-col gap-3 @[30rem]:gap-4">
            <ResumoDoPedido resumo={resumo} />
            <ItensDoPedido resumo={resumo} abertosInicialmente={itensAbertosInicialmente} />
            {pedido?.destino && <EnderecoDeEntrega destino={pedido.destino} />}
          </div>
        </div>
      </div>
    </article>
  );
}

export function PedidoNaConversa({ resumo, criadoEm, aoConversarCom }: { resumo: ResumoPedido; criadoEm: string; aoConversarCom?: ((nomeUsuario: string) => void) | undefined }) {
  const terminal = statusPedidoTerminal(resumo.status);
  // A escolha de abrir/recolher vale para o estado em que foi feita: ao FINALIZAR, o pedido recolhe sozinho.
  const [escolha, setEscolha] = useState<{ terminal: boolean; aberto: boolean } | null>(null);
  const aberto = !terminal || (escolha?.terminal === terminal && escolha.aberto);
  const [pedido, setPedido] = useState<Pedido | null>(null);

  // Detalhe relido quando o status muda (o evento avisa; o banco é a verdade) — só se estiver à mostra.
  useEffect(() => {
    if (!aberto) return;
    let ativo = true;
    void obterPedido(resumo.id).then((resultado) => {
      if (ativo && resultado.ok) setPedido(resultado.dados);
    });
    return () => {
      ativo = false;
    };
  }, [resumo.id, resumo.status, aberto]);

  const destino = pedido?.destino ? { latitude: pedido.destino.latitude, longitude: pedido.destino.longitude } : undefined;

  return (
    <PedidoNaConversaApresentacao
      resumo={resumo}
      criadoEm={criadoEm}
      pedido={pedido}
      aberto={aberto}
      aoAlternar={() => setEscolha({ terminal, aberto: !aberto })}
      entrega={<AcompanhamentoDoPedido pedidoId={resumo.id} emCartao {...(destino ? { destino } : {})} {...(aoConversarCom ? { aoConversarCom } : {})} />}
    />
  );
}
