"use client";

import {
  EVENTO_PEDIDO_ACOMPANHAMENTO,
  EVENTO_PEDIDO_FILA,
  TEXTO_AVISO_ENTREGA_PROXIMA,
  avisoNoLugarDoMapa,
  formatarDistanciaRota,
  formatarPrevisaoDoTrecho,
  eventoPedidoAcompanhamentoSchema,
  eventoPedidoFilaSchema,
  rotuloFila,
  rotuloUltimaPosicao,
  type AcompanhamentoPedido,
} from "@jaa/contratos";
import { useEffect, useState } from "react";
import { AvatarIdentidade } from "@/components/avatar-identidade";
import { IconeConversa, IconeEntrega, IconeMapa } from "@/components/ui/icones";
import { MapaDaEntregaDoCliente } from "./mapa-entrega-cliente";
import { obterAcompanhamentoDoPedido } from "../lib/api-entregas";
import { obterClienteRealtime } from "@/lib/realtime/cliente-realtime";

/*
 * ACOMPANHAMENTO DO CLIENTE. Ele vê a posição na fila ("Você é o 3º na fila de entregas.") e, SÓ quando a
 * entrega dele vira a atual, o entregador no mapa.
 *
 * Quem decide isso é o SERVIDOR: a posição só chega no payload quando é a vez dele. A tela não
 * "esconde" nada — ela nem recebe. E nunca há destino, coordenada ou id de outro cliente aqui.
 */

// Apresentação pura: a fila e a idade da última posição (posição velha nunca é vendida como atual).
export function ResumoAcompanhamento({ acompanhamento, agora = new Date() }: { acompanhamento: AcompanhamentoPedido; agora?: Date }) {
  const { fila, posicaoEntregador } = acompanhamento;
  if (fila.situacao === "sem_saida" || fila.situacao === "encerrado") return null;

  return (
    <span className="flex flex-col gap-0.5">
      <span data-fila-pedido={fila.situacao} className={`text-xs ${fila.situacao === "indo_ate_voce" ? "font-semibold text-marca" : "text-conteudo-suave"}`}>
        {rotuloFila(fila)}
      </span>
      {fila.situacao === "indo_ate_voce" && <span className="text-xs text-conteudo">{TEXTO_AVISO_ENTREGA_PROXIMA.orientacao}</span>}
      {fila.situacao === "indo_ate_voce" && (
        <span data-posicao-entregador={posicaoEntregador ? "disponivel" : "indisponivel"} className="text-xs text-conteudo-suave">
          {posicaoEntregador ? rotuloUltimaPosicao({ capturadaEm: posicaoEntregador.capturadaEm }, agora) : "Localização temporariamente indisponível"}
        </span>
      )}
    </span>
  );
}

/**
 * AVISO DA ENTREGA dentro do pedido: bloco SÓLIDO, com contraste próprio (não depende do que está
 * atrás). Na vez do cliente: título forte, orientação, PREVISÃO e distância do trecho que falta —
 * só quando o servidor mandou esses dados — e há quanto tempo a posição foi atualizada. Fora da vez
 * dele, a posição na fila em um bloco neutro.
 */
export function AvisoDaEntrega({ acompanhamento, agora = new Date() }: { acompanhamento: AcompanhamentoPedido; agora?: Date }) {
  const { fila, posicaoEntregador, rota } = acompanhamento;
  if (fila.situacao === "sem_saida" || fila.situacao === "encerrado") return null;
  if (fila.situacao !== "indo_ate_voce") {
    return (
      <p data-fila-pedido={fila.situacao} className="rounded-jaa-compacto bg-superficie-suave px-3.5 py-3 text-sm font-medium text-conteudo">
        {rotuloFila(fila)}
      </p>
    );
  }
  return (
    <div data-fila-pedido="indo_ate_voce" data-aviso-da-entrega className="flex flex-col gap-2 rounded-jaa-compacto border border-marca/25 bg-marca-suave px-3.5 py-3">
      <p className="text-[15px] font-bold leading-snug text-marca-suave-conteudo">{TEXTO_AVISO_ENTREGA_PROXIMA.titulo}</p>
      <p className="text-sm text-conteudo">O entregador está a caminho do seu endereço. {TEXTO_AVISO_ENTREGA_PROXIMA.orientacao}</p>
      {rota && (
        <dl data-previsao-da-entrega className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-conteudo">
          <div className="flex items-baseline gap-1.5">
            <dt className="text-conteudo-suave">Previsão:</dt>
            <dd className="font-bold">{formatarPrevisaoDoTrecho(rota.duracaoSegundos)}</dd>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dt className="text-conteudo-suave">Distância:</dt>
            <dd className="font-bold">{formatarDistanciaRota(rota.distanciaMetros)}</dd>
          </div>
        </dl>
      )}
      <p data-posicao-entregador={posicaoEntregador ? "disponivel" : "indisponivel"} className="text-xs text-conteudo-suave">
        {posicaoEntregador ? rotuloUltimaPosicao({ capturadaEm: posicaoEntregador.capturadaEm }, agora) : "Aguardando a localização do entregador…"}
      </p>
    </div>
  );
}

/**
 * QUEM ESTÁ COM A ENTREGA: identidade pública do Jaa (nome e @usuario). Aparece mesmo se houver
 * bloqueio de mensagens entre os dois — bloqueio corta a conversa, nunca a operação. "Conversar" abre
 * a conversa direta de sempre; se estiver bloqueada, ela abre com o envio desabilitado.
 */
export function EntregadorDaEntrega({
  acompanhamento,
  aoConversarCom,
  emDestaque = false,
}: {
  acompanhamento: AcompanhamentoPedido;
  aoConversarCom?: ((nomeUsuario: string) => void) | undefined;
  // Dentro do pedido na conversa: avatar, nome e @usuario, com "Conversar" como botão de verdade.
  emDestaque?: boolean;
}) {
  const { entregador, fila } = acompanhamento;
  if (!entregador || fila.situacao === "encerrado") return null;
  if (emDestaque) {
    return (
      <div data-entregador-da-entrega={entregador.nomeUsuario} className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
        {/* O acompanhamento traz só a identidade pública (sem foto): o avatar usa as iniciais, como no resto do Jaa. */}
        <AvatarIdentidade identidade={entregador} />
        <p className="min-w-[7.5rem] flex-1 text-[13px] text-conteudo-suave [overflow-wrap:anywhere]">
          <span className="block text-sm font-semibold text-conteudo">{entregador.nomeExibicao}</span>@{entregador.nomeUsuario}
        </p>
        {aoConversarCom && (
          <button
            type="button"
            data-conversar-entregador={entregador.nomeUsuario}
            onClick={() => aoConversarCom(entregador.nomeUsuario)}
            className="flex min-h-11 items-center gap-2 rounded-full border border-borda bg-superficie px-4 text-[13px] font-semibold text-marca transition-colors hover:bg-marca-suave focus-visible:outline-2 sm:min-h-10"
          >
            <IconeConversa className="h-4 w-4" />
            Conversar
          </button>
        )}
      </div>
    );
  }
  return (
    <span data-entregador-da-entrega={entregador.nomeUsuario} className="flex flex-wrap items-center gap-2 text-xs text-conteudo-suave">
      Entregador: <strong className="font-semibold text-conteudo">{entregador.nomeExibicao}</strong> @{entregador.nomeUsuario}
      {aoConversarCom && (
        <button
          type="button"
          data-conversar-entregador={entregador.nomeUsuario}
          onClick={() => aoConversarCom(entregador.nomeUsuario)}
          className="rounded-full border border-borda px-2 py-0.5 text-[11px] font-medium text-marca"
        >
          Conversar
        </button>
      )}
    </span>
  );
}

/**
 * Container do cliente: busca o estado atual (é isto que resolve a RECONEXÃO, sem depender do último
 * evento) e acompanha o realtime do próprio pedido.
 */
export function AcompanhamentoDoPedido({
  pedidoId,
  destino,
  aoConversarCom,
  emCartao = false,
}: {
  // Dentro do pedido na conversa: vira uma seção "Entrega" e some inteira quando não há o que mostrar.
  emCartao?: boolean;
  pedidoId: string;
  destino?: { latitude: number; longitude: number } | undefined;
  // Abre a conversa DIRETA de sempre com o entregador (nada de chat de entrega).
  aoConversarCom?: ((nomeUsuario: string) => void) | undefined;
}) {
  const [acompanhamento, setAcompanhamento] = useState<AcompanhamentoPedido | null>(null);

  useEffect(() => {
    let ativo = true;
    void obterAcompanhamentoDoPedido(pedidoId).then((resultado) => {
      if (ativo && resultado.ok) setAcompanhamento(resultado.dados);
    });
    return () => {
      ativo = false;
    };
  }, [pedidoId]);

  useEffect(() => {
    const socket = obterClienteRealtime();
    const aoAtualizar = (evento: unknown) => {
      const resultado = eventoPedidoAcompanhamentoSchema.safeParse(evento);
      // Só o próprio pedido: o servidor já filtra, e a tela confere de novo.
      if (resultado.success && resultado.data.pedidoId === pedidoId) setAcompanhamento(resultado.data.acompanhamento);
    };
    /*
     * A FILA muda sem posição de GPS nenhuma (entrega anterior concluída, cancelamento, reordenação):
     * `pedido:fila` traz a posição atual do PRÓPRIO pedido. Virando a vez dele, relê o acompanhamento
     * completo (com o ponto do entregador, se houver).
     */
    const aoMudarFila = (evento: unknown) => {
      const resultado = eventoPedidoFilaSchema.safeParse(evento);
      if (!resultado.success || resultado.data.pedidoId !== pedidoId) return;
      const fila = resultado.data;
      setAcompanhamento((atual) => ({
        fila,
        entregador: atual?.entregador ?? null,
        posicaoEntregador: fila.situacao === "indo_ate_voce" ? (atual?.posicaoEntregador ?? null) : null,
        rota: fila.situacao === "indo_ate_voce" ? (atual?.rota ?? null) : null,
      }));
      // Relê o todo (entregador atual e, se for a vez dele, o ponto): o evento só avisa.
      void obterAcompanhamentoDoPedido(pedidoId).then((relido) => {
        if (relido.ok) setAcompanhamento(relido.dados);
      });
    };
    socket.on(EVENTO_PEDIDO_ACOMPANHAMENTO, aoAtualizar);
    socket.on(EVENTO_PEDIDO_FILA, aoMudarFila);
    return () => {
      socket.off(EVENTO_PEDIDO_ACOMPANHAMENTO, aoAtualizar);
      socket.off(EVENTO_PEDIDO_FILA, aoMudarFila);
    };
  }, [pedidoId]);

  if (!acompanhamento) return null;

  const conteudo = (
    <span className="flex flex-col gap-1">
      <ResumoAcompanhamento acompanhamento={acompanhamento} />
      <EntregadorDaEntrega acompanhamento={acompanhamento} {...(aoConversarCom ? { aoConversarCom } : {})} />
      {acompanhamento.posicaoEntregador && <MapaDaEntregaDoCliente posicao={acompanhamento.posicaoEntregador} destino={destino} geometria={acompanhamento.rota?.geometria ?? null} />}
    </span>
  );
  if (!emCartao) return conteudo;

  const { fila, entregador } = acompanhamento;
  if (fila.situacao === "encerrado") return null;
  const semRota = fila.situacao === "sem_saida";
  const cabecalho = (
    <h4 className="flex flex-wrap items-center gap-x-2.5 gap-y-2 text-sm font-semibold text-conteudo">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-marca-suave text-marca">
        <IconeEntrega className="h-4 w-4" />
      </span>
      {/* O título não encolhe: sem espaço ao lado, "Conversar" desce para a linha de baixo. */}
      <span className="flex-1 whitespace-nowrap">Entrega</span>
      {entregador && aoConversarCom && (
        <button
          type="button"
          data-conversar-entregador={entregador.nomeUsuario}
          onClick={() => aoConversarCom(entregador.nomeUsuario)}
          className="flex min-h-11 items-center gap-1.5 rounded-full border border-borda bg-superficie px-3.5 text-[13px] font-semibold text-marca transition-colors hover:bg-marca-suave focus-visible:outline-2 sm:min-h-9"
        >
          <IconeConversa className="h-4 w-4" />
          Conversar
        </button>
      )}
    </h4>
  );
  const moldura = "flex flex-col gap-3 rounded-jaa border border-borda bg-superficie p-3.5 shadow-suave @[30rem]:p-4";

  /*
   * Ainda sem entrega para acompanhar (sem rota e sem entregador): uma linha só, dizendo onde o
   * acompanhamento vai aparecer. Nada de mapa nem de espaço reservado — o mapa só existe com posição real.
   */
  if (semRota && !entregador) {
    return (
      <section data-entrega-do-pedido="aguardando" className={moldura}>
        {cabecalho}
        <p className="text-[13px] text-conteudo-suave">Quando o pedido sair para entrega, você acompanha o entregador por aqui.</p>
      </section>
    );
  }
  const avisoDoMapa = avisoNoLugarDoMapa(acompanhamento);
  return (
    <section data-entrega-do-pedido className={moldura}>
      {cabecalho}
      <EntregadorDaEntrega acompanhamento={acompanhamento} emDestaque />
      {!semRota && <AvisoDaEntrega acompanhamento={acompanhamento} />}
      {acompanhamento.posicaoEntregador ? (
        <MapaDaEntregaDoCliente posicao={acompanhamento.posicaoEntregador} destino={destino} geometria={acompanhamento.rota?.geometria ?? null} />
      ) : (
        // Ainda sem mapa (não é a vez dele, ou o entregador ainda não mandou posição): uma frase curta.
        avisoDoMapa && (
          <p data-mapa-da-entrega="aguardando" className="flex items-start gap-2 text-[13px] text-conteudo-suave">
            <IconeMapa className="mt-0.5 h-4 w-4 shrink-0" />
            {avisoDoMapa}
          </p>
        )
      )}
    </section>
  );
}
