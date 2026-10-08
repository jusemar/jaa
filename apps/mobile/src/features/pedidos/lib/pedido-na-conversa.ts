import { ROTULO_STATUS_PEDIDO_CLIENTE, statusPedidoTerminal, type AcompanhamentoPedido, type ResumoPedido, type StatusPedido } from "@jaa/contratos";

/*
 * O PEDIDO DO CLIENTE DENTRO DA CONVERSA — as regras, sem tela (o componente está em
 * `components/pedido-na-conversa.tsx`). As mesmas da Web:
 * - pedido ATIVO fica sempre aberto (o acompanhamento completo, direto na conversa);
 * - pedido ENTREGUE ou CANCELADO fica compacto; "Ver detalhes" abre ali mesmo e "Recolher" fecha;
 * - a escolha de abrir/recolher vale para o estado em que foi feita: ao finalizar, recolhe sozinho.
 */

export type ApresentacaoDoPedido = "completa" | "compacta";

/** O que a pessoa escolheu (abrir/recolher) e em que estado o pedido estava quando escolheu. */
export interface EscolhaDeExibicao {
  terminal: boolean;
  aberto: boolean;
}

export function apresentacaoDoPedido(status: StatusPedido, escolha: EscolhaDeExibicao | null): ApresentacaoDoPedido {
  const terminal = statusPedidoTerminal(status);
  if (!terminal) return "completa";
  return escolha?.terminal === true && escolha.aberto ? "completa" : "compacta";
}

export function alternarExibicao(status: StatusPedido, escolha: EscolhaDeExibicao | null): EscolhaDeExibicao {
  return { terminal: statusPedidoTerminal(status), aberto: apresentacaoDoPedido(status, escolha) === "compacta" };
}

export const totalDeItens = (resumo: Pick<ResumoPedido, "itens">) => resumo.itens.reduce((total, item) => total + item.quantidade, 0);

export const rotuloDeItens = (quantidade: number) => `${quantidade} ${quantidade === 1 ? "item" : "itens"}`;

/** "1x Fanta uva, 1x Monte seu prato" — a linha de apoio do resumo. */
export const principaisItens = (resumo: Pick<ResumoPedido, "itens">) => resumo.itens.map((item) => `${item.quantidade}x ${item.nomeProduto}`).join(", ");

/** Na linha compacta: "Entregue" / "Cancelado" (o rótulo completo repetiria a palavra "pedido"). */
export const rotuloCompacto = (status: StatusPedido) => (status === "cancelado" ? "Cancelado" : ROTULO_STATUS_PEDIDO_CLIENTE[status]);

// Criados a cada uso: um formatador guardado no módulo manteria o fuso antigo do aparelho.
export const dataDoPedido = (iso: string) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
export const horaDoPedido = (iso: string) => new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/**
 * A seção "Entrega" só ocupa espaço quando há o que acompanhar: o pedido já está numa rota, ou já tem
 * entregador. Antes disso, nada — o status e a linha do tempo dizem o que está acontecendo.
 */
export function temEntregaParaMostrar(acompanhamento: AcompanhamentoPedido | null): boolean {
  if (!acompanhamento) return false;
  const { fila, entregador } = acompanhamento;
  if (fila.situacao === "encerrado") return false;
  return fila.situacao !== "sem_saida" || entregador !== null;
}

/** MAPA: só quando a entrega DELE é a atual e o servidor mandou a posição do entregador. */
export function temMapaParaMostrar(acompanhamento: AcompanhamentoPedido | null): boolean {
  return acompanhamento !== null && acompanhamento.fila.situacao === "indo_ate_voce" && acompanhamento.posicaoEntregador !== null;
}

/* ---------- Mapa do cliente: o que desenhar (puro; quem desenha é o Mapbox nativo) ---------- */

export type PosicaoNoMapa = [longitude: number, latitude: number];

/** A linha do trecho, na ordem recebida do servidor. Sem trecho, lista vazia: nenhuma linha é inventada. */
export function pontosDoTrecho(geometria: readonly { latitude: number; longitude: number }[] | null): PosicaoNoMapa[] {
  return (geometria ?? []).map((ponto) => [ponto.longitude, ponto.latitude]);
}

/** Caixa que contém tudo o que está no mapa (entregador, destino e trecho). null = um ponto só. */
export function limitesDoMapa(pontos: readonly PosicaoNoMapa[]): { ne: PosicaoNoMapa; sw: PosicaoNoMapa } | null {
  if (pontos.length < 2) return null;
  let [oeste, sul] = pontos[0] as PosicaoNoMapa;
  let [leste, norte] = pontos[0] as PosicaoNoMapa;
  for (const [longitude, latitude] of pontos) {
    oeste = Math.min(oeste, longitude);
    leste = Math.max(leste, longitude);
    sul = Math.min(sul, latitude);
    norte = Math.max(norte, latitude);
  }
  return { ne: [leste, norte], sw: [oeste, sul] };
}
