import { PRESENCA_VALIDADE_MAXIMA_MS, type SituacaoOperacional } from "@jaa/contratos";

/*
 * PRESENÇA NA BASE EM SEGUNDO PLANO — as regras, sem aparelho (o que fala com o sistema está em
 * `presenca-segundo-plano.ts`).
 *
 * A presença só vale no servidor com confirmação recente (`PRESENCA_VALIDADE_MAXIMA_MS`). Para o
 * entregador não perder o lugar na fila ao bloquear a tela, o app continua confirmando em segundo
 * plano — mas SÓ enquanto ele aceita entregas de alguma empresa e não está numa entrega (aí quem usa
 * a localização é o rastreamento da saída: nunca as duas tarefas ao mesmo tempo).
 *
 * Não é rastreamento: uma leitura por minuto, só para o servidor decidir "continua na base?". Nada é
 * guardado no aparelho além de QUAIS vínculos confirmar.
 */

export const TAREFA_PRESENCA = "jaa-presenca-base";

/*
 * Uma leitura por minuto: a validade no servidor é de 3 minutos, então cabem DUAS leituras perdidas
 * (pausa do Android, GPS demorado, rede ruim) antes de a presença vencer. Não se mexe na validade para
 * compensar falta de leitura — se as leituras param de verdade, a presença vence, como deve.
 */
export const INTERVALO_PRESENCA_SEGUNDO_PLANO_MS = 60_000;
export const LEITURAS_QUE_PODEM_FALHAR = Math.floor(PRESENCA_VALIDADE_MAXIMA_MS / INTERVALO_PRESENCA_SEGUNDO_PLANO_MS) - 1;

/** Vínculos pelos quais o aparelho confirma presença: ativo E aceitando entregas agora. */
export function vinculosAceitando(situacoes: readonly Pick<SituacaoOperacional, "entregadorId" | "status" | "disponivel">[]): string[] {
  return situacoes.filter((situacao) => situacao.status === "ativo" && situacao.disponivel).map((situacao) => situacao.entregadorId);
}

export interface CondicoesDaPresenca {
  // Vínculos em que ele está aceitando entregas.
  vinculos: readonly string[];
  // Saída em andamento: a localização é do rastreamento da entrega.
  emEntrega: boolean;
  // "Permitir o tempo todo" concedido pela pessoa.
  permissaoSegundoPlano: boolean;
  // O binário instalado consegue manter tarefa em segundo plano (ver `binarioSuportaSegundoPlano`).
  binarioSuporta: boolean;
}

export type SituacaoPresencaSegundoPlano = "ativa" | "somente_primeiro_plano" | "parada";

/**
 * A tarefa em segundo plano deve estar LIGADA? Só com alguém para confirmar, fora de entrega e com a
 * permissão. Indisponível, sem vínculo ativo ou sem permissão: nada roda em segundo plano.
 */
export function situacaoDaPresenca(condicoes: CondicoesDaPresenca): SituacaoPresencaSegundoPlano {
  if (condicoes.vinculos.length === 0 || condicoes.emEntrega) return "parada";
  return condicoes.permissaoSegundoPlano && condicoes.binarioSuporta ? "ativa" : "somente_primeiro_plano";
}

export type RespostaDaPresenca =
  | { ok: true; dados: Pick<SituacaoOperacional, "status" | "disponivel" | "estado"> }
  | { ok: false; status: number };

/**
 * O que a tarefa faz com a resposta do servidor a UMA leitura — é ele quem diz se ainda há o que
 * confirmar. A tarefa se desliga sozinha quando deixa de fazer sentido, mesmo sem a tela aberta.
 */
export function aposResposta(vinculos: readonly string[], vinculoId: string, resposta: RespostaDaPresenca): { vinculos: string[]; emEntrega: boolean } {
  const semEle = vinculos.filter((id) => id !== vinculoId);
  if (resposta.ok) {
    // Deixou de aceitar (ou o vínculo foi desativado) por outro aparelho/pela empresa.
    if (resposta.dados.status !== "ativo" || !resposta.dados.disponivel) return { vinculos: semEle, emEntrega: false };
    return { vinculos: [...vinculos], emEntrega: resposta.dados.estado === "em_entrega" };
  }
  // Sessão encerrada: não há mais quem confirmar.
  if (resposta.status === 401) return { vinculos: [], emEntrega: false };
  // Vínculo inexistente/inativo ou de outra conta.
  if (resposta.status === 403 || resposta.status === 404) return { vinculos: semEle, emEntrega: false };
  // Sem rede, leitura imprecisa, base sem ponto, erro do servidor: a próxima leitura tenta de novo.
  return { vinculos: [...vinculos], emEntrega: false };
}

/** A leitura que vai ao servidor: só o que o aparelho MEDIU. */
export function leituraDaPosicao(posicao: { coords: { latitude: number; longitude: number; accuracy: number | null }; timestamp: number }) {
  return {
    latitude: Number(posicao.coords.latitude.toFixed(6)),
    longitude: Number(posicao.coords.longitude.toFixed(6)),
    precisaoMetros: posicao.coords.accuracy ?? null,
    medidaEm: new Date(posicao.timestamp).toISOString(),
  };
}

/** Lista de vínculos guardada no aparelho (texto): tolera valor ausente ou corrompido. */
export function lerVinculosGuardados(texto: string | null): string[] {
  if (!texto) return [];
  try {
    const valor: unknown = JSON.parse(texto);
    return Array.isArray(valor) ? valor.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}
