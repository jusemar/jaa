import {
  entregadorDaEmpresaSchema,
  listaConvitesEntregadorSchema,
  listaEntregasSchema,
  listaSaidasSchema,
  listaSituacoesOperacionaisSchema,
  listaVinculosEntregadorSchema,
  saidaEntregaSchema,
  situacaoOperacionalSchema,
  type EnviarLocalizacaoEntrada,
  type EnviarPosicaoEntrada,
  type ListaSaidas,
  type PosicaoEntregador,
  type SaidaEntrega,
} from "@jaa/contratos";
import * as z from "zod";
import { requisitar, requisitarApi, type ResultadoApi } from "@/lib/api";

// API de entregas do entregador. O cliente HTTP (sessão no cabeçalho `Cookie`) é o de `@/lib/api`.
export type { ResultadoApi };

/** Saídas do entregador autenticado. A saída EM ANDAMENTO é o que liga (ou não) o rastreamento. */
export async function listarMinhasSaidas(): Promise<ResultadoApi<ListaSaidas>> {
  return requisitar<ListaSaidas>("/entregas/saidas");
}

export function saidaEmAndamento(saidas: SaidaEntrega[]): SaidaEntrega | null {
  return saidas.find((saida) => saida.status === "em_andamento") ?? null;
}

/**
 * Envia UMA leitura. O aparelho informa o que mediu; o servidor decide se aceita, e devolve 409
 * quando a saída não está mais em andamento — o sinal de que o rastreamento deve parar.
 */
export function enviarPosicao(saidaId: string, leitura: EnviarPosicaoEntrada): Promise<ResultadoApi<PosicaoEntregador | { aplicada: false }>> {
  return requisitar(`/entregas/saidas/${encodeURIComponent(saidaId)}/posicao`, { method: "POST", body: JSON.stringify(leitura) });
}

/*
 * OPERAÇÃO DO ENTREGADOR — as MESMAS rotas da área "Minhas entregas" da Web (identidade pessoal da
 * sessão; a API confere que a saída é dele e que o estado permite a ação). Respostas validadas pelos
 * schemas de `@jaa/contratos`, como na Web.
 */
const caminhoSaida = (saidaId: string, sufixo = "") => `/entregas/saidas/${encodeURIComponent(saidaId)}${sufixo}`;

export const listarSaidas = () => requisitarApi("/entregas/saidas", listaSaidasSchema);
export const listarMinhasEntregas = () => requisitarApi("/entregas", listaEntregasSchema);
export const listarMeusVinculos = () => requisitarApi("/entregas/vinculos", listaVinculosEntregadorSchema);
export const listarMeusConvites = () => requisitarApi("/entregas/convites", listaConvitesEntregadorSchema);
export const listarMinhasSituacoes = () => requisitarApi("/entregas/situacao", listaSituacoesOperacionaisSchema);

export function responderConvite(entregadorId: string, resposta: "aceitar" | "recusar") {
  return requisitarApi(`/entregas/convites/${encodeURIComponent(entregadorId)}`, z.object({ status: z.string() }), { method: "POST", body: JSON.stringify({ resposta }) });
}

// Disponibilidade é decisão do entregador, por empresa; não mexe no que já está atribuído.
export function alterarMinhaDisponibilidade(entregadorId: string, disponivel: boolean) {
  return requisitarApi(`/entregas/vinculos/${encodeURIComponent(entregadorId)}`, entregadorDaEmpresaSchema, { method: "PATCH", body: JSON.stringify({ disponivel }) });
}

// PRESENÇA NA BASE: o aparelho informa só o que MEDIU; quem decide se ele está na base é o servidor.
export function enviarLocalizacaoDaBase(entregadorId: string, leitura: EnviarLocalizacaoEntrada) {
  return requisitarApi(`/entregas/vinculos/${encodeURIComponent(entregadorId)}/localizacao`, situacaoOperacionalSchema, { method: "POST", body: JSON.stringify(leitura) });
}

// SAIR PARA ENTREGA: só em `liberada_retirada`; a saída vira `em_andamento` e cada pedido pronto, `saiu_para_entrega`.
export const iniciarMinhaSaida = (saidaId: string) => requisitarApi(caminhoSaida(saidaId, "/iniciar"), saidaEntregaSchema, { method: "POST" });

// RECUSAR ROTA: só em `liberada_retirada`; ela volta para a fila e o despacho tenta o próximo.
export const recusarMinhaSaida = (saidaId: string) => requisitarApi(caminhoSaida(saidaId, "/recusar"), z.object({ status: z.literal("recusada") }), { method: "POST" });

// Só a PRIMEIRA parada ativa de uma saída em andamento: o pedido vira `entregue` pela máquina de estados.
export function concluirMinhaProximaParada(saidaId: string, pedidoId: string) {
  return requisitarApi(caminhoSaida(saidaId, `/paradas/${encodeURIComponent(pedidoId)}/concluir`), saidaEntregaSchema, { method: "POST" });
}

// A ordem inteira, com a versão que a tela viu: se alguém mudou antes, 409 `SEQUENCIA_DESATUALIZADA`.
export function reordenarSequencia(saidaId: string, versaoSequencia: number, pedidoIds: string[]) {
  return requisitarApi(caminhoSaida(saidaId, "/sequencia"), saidaEntregaSchema, { method: "PATCH", body: JSON.stringify({ versaoSequencia, pedidoIds }) });
}

// "Recalcular melhor rota": pedido explícito; o Jaa escolhe de novo a ordem das pendentes.
export function recalcularRota(saidaId: string, versaoSequencia: number) {
  return requisitarApi(caminhoSaida(saidaId, "/recalcular-rota"), saidaEntregaSchema, { method: "POST", body: JSON.stringify({ versaoSequencia }) });
}
