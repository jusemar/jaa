import {
  entregaEstaAtiva,
  formatarDistanciaRota,
  formatarDuracaoPercurso,
  paradasAtivas,
  rotaCobreSequenciaAtual,
  rotaTemPercursoReal,
  rotuloRota,
  type ConviteEntregador,
  type Coordenadas,
  type EntregaAtribuida,
  type SaidaEntrega,
  type SituacaoOperacional,
  type VinculoEntregador,
} from "@jaa/contratos";

/*
 * "MINHAS ENTREGAS" no app: o MESMO estado da área da Web (saídas, entregas, vínculos, convites e
 * situação na base) e a MESMA reconciliação com os eventos em tempo real. Aqui só há apresentação e
 * estado local — sem React e sem rede, testável sem aparelho. Nenhuma regra de negócio: quem decide o
 * que pode ser feito é a API; estas funções só refletem o que ela devolveu ou avisou.
 */

export interface MinhasEntregas {
  saidas: SaidaEntrega[];
  entregas: EntregaAtribuida[];
  vinculos: VinculoEntregador[];
  convites: ConviteEntregador[];
  situacoes: SituacaoOperacional[];
}

export const SEM_ENTREGAS: MinhasEntregas = { saidas: [], entregas: [], vinculos: [], convites: [], situacoes: [] };

/** A saída mudou. Sem entregador = deixou de ser minha (recusada, transferida): sai da lista. */
export function aplicarSaida(saidas: SaidaEntrega[], atualizada: SaidaEntrega): SaidaEntrega[] {
  if (!atualizada.entregador) return saidas.filter((item) => item.id !== atualizada.id);
  return saidas.some((item) => item.id === atualizada.id) ? saidas.map((item) => (item.id === atualizada.id ? atualizada : item)) : [atualizada, ...saidas];
}

/** `entrega: null` = saiu da minha lista (reatribuída, cancelada, entregue): some na hora. */
export function aplicarEntrega(entregas: EntregaAtribuida[], pedidoId: string, entrega: EntregaAtribuida | null): EntregaAtribuida[] {
  const semEla = entregas.filter((item) => item.pedidoId !== pedidoId);
  return entrega && entregaEstaAtiva(entrega.status) ? [entrega, ...semEla] : semEla;
}

export function aplicarSituacao(situacoes: SituacaoOperacional[], situacao: SituacaoOperacional): SituacaoOperacional[] {
  return situacoes.some((item) => item.entregadorId === situacao.entregadorId) ? situacoes.map((item) => (item.entregadorId === situacao.entregadorId ? situacao : item)) : [...situacoes, situacao];
}

export function aplicarVinculo(estado: Pick<MinhasEntregas, "convites" | "vinculos">, convite: ConviteEntregador | null, vinculo: VinculoEntregador | null) {
  const id = convite?.id ?? vinculo?.id;
  const convites = estado.convites.filter((item) => item.id !== id);
  const vinculos = estado.vinculos.filter((item) => item.id !== vinculo?.id);
  return { convites: convite ? [convite, ...convites] : convites, vinculos: vinculo ? [vinculo, ...vinculos] : vinculos };
}

/** Entregas atribuídas fora de qualquer saída (atribuição avulsa da empresa). */
export function entregasForaDasSaidas(entregas: EntregaAtribuida[], saidas: SaidaEntrega[]): EntregaAtribuida[] {
  const emSaidas = new Set(saidas.flatMap((saida) => saida.paradas.map((parada) => parada.pedidoId)));
  return entregas.filter((entrega) => !emSaidas.has(entrega.pedidoId));
}

/** A rota que está NA RUA vem primeiro; depois a liberada para retirada; depois as demais. */
const PESO_DO_STATUS: Partial<Record<SaidaEntrega["status"], number>> = { em_andamento: 0, liberada_retirada: 1, preparada: 2 };
export function ordenarSaidas(saidas: SaidaEntrega[]): SaidaEntrega[] {
  return [...saidas].sort((a, b) => (PESO_DO_STATUS[a.status] ?? 9) - (PESO_DO_STATUS[b.status] ?? 9));
}

export function tituloDaRota(saida: SaidaEntrega): string {
  return saida.zonaPrincipal ? `Rota ${[saida.zonaPrincipal.nome, ...saida.zonasCombinadas.map((zona) => zona.nome)].join(" + ")}` : "Rota manual";
}

export function quantidadeDeEntregas(saida: SaidaEntrega): string {
  const total = paradasAtivas(saida).length;
  return `${total} ${total === 1 ? "entrega" : "entregas"}`;
}

/**
 * Distância e tempo do TRAJETO, como a Web diz: só quando há percurso real para a ordem atual. Sem
 * isso, o texto honesto do contrato ("Sequência sugerida pelo Jaa…") — nunca um número inventado.
 */
export function resumoDoPercurso(saida: SaidaEntrega): { texto: string; ehTrajeto: boolean } {
  const { rota } = saida;
  if (rota && rotaTemPercursoReal(rota) && rotaCobreSequenciaAtual(rota, saida.versaoSequencia) && rota.distanciaMetros !== null && rota.duracaoSegundos !== null) {
    return { texto: `${formatarDistanciaRota(rota.distanciaMetros)} · aprox. ${formatarDuracaoPercurso(rota.duracaoSegundos)} de trajeto${rota.comRetorno ? " (com retorno à base)" : ""}`, ehTrajeto: true };
  }
  return { texto: rotuloRota(rota, saida.versaoSequencia), ehTrajeto: false };
}

/** Move um pedido uma posição no RASCUNHO da ordem (fora dos limites, nada muda). */
export function moverNoRascunho(ordem: readonly string[], pedidoId: string, direcao: -1 | 1): string[] {
  const nova = [...ordem];
  const de = nova.indexOf(pedidoId);
  const para = de + direcao;
  if (de < 0 || para < 0 || para >= nova.length) return nova;
  [nova[de], nova[para]] = [nova[para] as string, nova[de] as string];
  return nova;
}

export const ordemMudou = (rascunho: readonly string[], atual: readonly string[]) => rascunho.some((pedidoId, indice) => atual[indice] !== pedidoId);

export function totalDeItens(entrega: EntregaAtribuida): string {
  const total = entrega.itens.reduce((soma, item) => soma + item.quantidade, 0);
  return `${total} ${total === 1 ? "item" : "itens"}`;
}

/**
 * Abre o ponto de entrega no aplicativo de mapas do aparelho, para navegar. A coordenada é a do
 * SNAPSHOT do pedido (a que o cliente confirmou) — o app não geocodifica nem escolhe outro ponto.
 */
export function urlDeNavegacao(destino: Coordenadas, rotulo: string): string {
  const ponto = `${destino.latitude},${destino.longitude}`;
  return `geo:${ponto}?q=${ponto}(${encodeURIComponent(rotulo)})`;
}

// Quem pode iniciar/recusar e quando concluir: espelho do que a Web mostra; a API confere de novo.
export const podeSairParaEntrega = (saida: SaidaEntrega) => saida.status === "liberada_retirada";
export const podeConcluirParada = (saida: SaidaEntrega, indiceDaParada: number) => saida.status === "em_andamento" && indiceDaParada === 0;
export const podeReordenar = (saida: SaidaEntrega) => paradasAtivas(saida).length > 1;

/*
 * UMA linha para o estado do entregador numa empresa — em vez de "Disponibilidade: Disponível",
 * "Disponível na base" e "Na base" ao mesmo tempo. O estado derivado do servidor já diz as duas
 * coisas (aceitando ou não, na base ou fora); a posição na fila entra como complemento curto.
 */
export function estadoEmUmaLinha(vinculo: Pick<VinculoEntregador, "status" | "disponivel">, situacao: SituacaoOperacional | undefined): { texto: string; tom: "ativo" | "atencao" | "neutro" } {
  if (vinculo.status !== "ativo") return { texto: vinculo.status === "convidado" ? "Convite pendente" : "Vínculo inativo", tom: "neutro" };
  if (!situacao) return { texto: vinculo.disponivel ? "Disponível" : "Indisponível", tom: vinculo.disponivel ? "ativo" : "neutro" };
  switch (situacao.estado) {
    case "em_entrega":
      return { texto: "Em entrega", tom: "ativo" };
    case "disponivel_na_base":
      return { texto: situacao.posicaoFila !== null ? `Disponível · Na base · ${situacao.posicaoFila}º da fila` : "Disponível · Na base", tom: "ativo" };
    case "disponivel_fora_base":
      return { texto: "Disponível · Fora da base", tom: "atencao" };
    case "inapto":
      return { texto: "Com pendência operacional", tom: "atencao" };
    default:
      return { texto: "Indisponível", tom: "neutro" };
  }
}

/** Resumo curto do trajeto para o cartão ("1,8 km · ~4 min"); null quando não há percurso real. */
export function trajetoCurto(saida: SaidaEntrega): string | null {
  const { rota } = saida;
  if (!rota || !rotaTemPercursoReal(rota) || !rotaCobreSequenciaAtual(rota, saida.versaoSequencia) || rota.distanciaMetros === null || rota.duracaoSegundos === null) return null;
  return `${formatarDistanciaRota(rota.distanciaMetros)} · ~${formatarDuracaoPercurso(rota.duracaoSegundos)}${rota.comRetorno ? " · com retorno" : ""}`;
}
