import type { Banco } from "@jaa/banco";
import { POLITICA_RASTREAMENTO, type Coordenadas } from "@jaa/contratos";
import { criarMotorDeRotas, type MotorDeRotas, type ParadaDeRota } from "../lib/motor-rotas.js";
import { buscarSaida, reordenarParadas, type SaidaComParadasRegistro } from "../repositorios/repositorio-saidas.js";
import { buscarPosicaoDaSaida } from "../repositorios/repositorio-rastreamento.js";
import { gravarRota, registrarConsumos, resolverOrigemDaSaida } from "../repositorios/repositorio-rotas.js";

/*
 * PLANEJAMENTO DA ROTA de uma saída.
 *
 * Duas entradas, uma para cada momento operacional REAL — e só essas duas. Ler a saída, atualizar a
 * tela, receber evento de realtime ou recarregar a página NUNCA chama o provedor: rota custa dinheiro
 * e só é recalculada quando há motivo (a saída foi planejada, ou o entregador mudou a ordem).
 */

export interface DependenciasRota {
  banco: Banco;
  motorRotas?: MotorDeRotas | undefined;
  agora?: (() => Date) | undefined;
}

// Sem motor injetado, o padrão é o motor sem provedor: aproximação local, nenhuma chamada externa.
const motorPadrao = criarMotorDeRotas(null);

const paradasParaRota = (saida: SaidaComParadasRegistro): ParadaDeRota[] =>
  saida.paradas
    .filter((parada) => parada.encerradaEm === null)
    .sort((a, b) => a.posicao - b.posicao)
    // Ponto SNAPSHOT do pedido: o que o cliente confirmou, nunca geocodificado de novo.
    .map((parada) => ({ pedidoId: parada.pedidoId, coordenadas: { latitude: parada.destino.latitude, longitude: parada.destino.longitude } }));

/**
 * Saída FECHADA e pronta para seguir: pede a ordem sugerida e o percurso real ao motor, grava a
 * sequência resultante e a rota. Se alguém mexer na sequência no meio do caminho, nada é sobrescrito.
 */
export async function planejarRotaDaSaida({ banco, motorRotas = motorPadrao, agora = () => new Date() }: DependenciasRota, saidaId: string): Promise<void> {
  const saida = await buscarSaida(banco, saidaId);
  if (!saida) return;
  const paradas = paradasParaRota(saida);
  if (paradas.length === 0) return;

  const origem = await resolverOrigemDaSaida(banco, saida.saida);
  // Saída que exige retorno: a volta à base faz parte da otimização e do percurso.
  const { rota, consumos } = await motorRotas.planejar(origem, paradas, { retorno: saida.saida.exigeRetornoBase ? origem : null });

  let versao = saida.saida.versaoSequencia;
  const ordemAtual = paradas.map((parada) => parada.pedidoId);
  const mudouOrdem = rota.ordem.length === ordemAtual.length && rota.ordem.some((pedidoId, indice) => ordemAtual[indice] !== pedidoId);
  if (mudouOrdem) {
    const resultado = await reordenarParadas(banco, { saidaId, versaoEsperada: versao, ordem: rota.ordem });
    // Versão velha = alguém reordenou agora há pouco: a escolha mais recente prevalece.
    if (resultado !== "reordenada") return;
    versao += 1;
  }

  await gravarRota(banco, saidaId, rota, versao, agora());
  await registrarConsumos(banco, { empresaId: saida.saida.empresaId, saidaId, consumos });
}

/**
 * O ENTREGADOR reordenou: a ordem dele PREVALECE. O motor só recalcula o caminho real daquela ordem —
 * jamais reotimiza (isso desfaria a escolha de quem conhece a região e está na rua).
 */
export async function recalcularPercursoDaSaida(
  { banco, motorRotas = motorPadrao, agora = () => new Date() }: DependenciasRota,
  saidaId: string,
): Promise<void> {
  const saida = await buscarSaida(banco, saidaId);
  if (!saida) return;
  const paradas = paradasParaRota(saida);
  if (paradas.length === 0) return;

  const origem = await resolverOrigemDaSaida(banco, saida.saida);
  const { rota, consumos } = await motorRotas.recalcularPercurso(origem, paradas, { retorno: saida.saida.exigeRetornoBase ? origem : null });

  await gravarRota(banco, saidaId, rota, saida.saida.versaoSequencia, agora());
  await registrarConsumos(banco, { empresaId: saida.saida.empresaId, saidaId, consumos });
}

/*
 * ORIGEM DO RECÁLCULO. Na rua, o ponto certo de partida é onde o entregador ESTÁ — mas só com leitura
 * confiável: saída em andamento, capturada há no máximo `validadeMs` (60 s) e com precisão INFORMADA de
 * até 50 m (mais conservador que os 100 m aceitos para o mapa). Qualquer outra coisa: a base da saída.
 */
export const PRECISAO_MAXIMA_ORIGEM_RECALCULO_METROS = 50;

export async function origemDoRecalculo(
  banco: Banco,
  saida: SaidaComParadasRegistro,
  agora: Date,
): Promise<{ origem: Coordenadas | null; fonte: "posicao_entregador" | "base" }> {
  if (saida.saida.status === "em_andamento") {
    const posicao = await buscarPosicaoDaSaida(banco, saida.saida.id);
    const recente = posicao !== null && agora.getTime() - posicao.capturadaEm.getTime() <= POLITICA_RASTREAMENTO.validadeMs;
    const precisa = posicao?.precisaoMetros != null && posicao.precisaoMetros <= PRECISAO_MAXIMA_ORIGEM_RECALCULO_METROS;
    if (posicao && recente && precisa) return { origem: { latitude: posicao.latitude, longitude: posicao.longitude }, fonte: "posicao_entregador" };
  }
  return { origem: await resolverOrigemDaSaida(banco, saida.saida), fonte: "base" };
}

export type ResultadoRecalculoRota = { tipo: "recalculada" } | { tipo: "versao-desatualizada" };

/**
 * "RECALCULAR MELHOR ROTA" — pedido EXPLÍCITO do entregador: o Jaa escolhe de novo a ordem das paradas
 * ATIVAS (concluídas e canceladas ficam no histórico, fora do cálculo), a partir de onde ele está, e
 * substitui a sequência atual — inclusive a que ele tinha montado à mão. A versão é conferida ANTES de
 * pagar pelo provedor e de novo ao gravar: tela velha ou mudança concorrente = nada sobrescrito.
 */
export async function recalcularMelhorRota(
  { banco, motorRotas = motorPadrao, agora = () => new Date() }: DependenciasRota,
  saida: SaidaComParadasRegistro,
  versaoEsperada: number,
): Promise<ResultadoRecalculoRota> {
  if (saida.saida.versaoSequencia !== versaoEsperada) return { tipo: "versao-desatualizada" };
  const paradas = paradasParaRota(saida);
  const instante = agora();
  const { origem } = await origemDoRecalculo(banco, saida, instante);
  // A volta, quando exigida, é sempre à BASE (o snapshot da saída), nunca ao ponto de onde recalculou.
  const base = await resolverOrigemDaSaida(banco, saida.saida);
  const { rota, consumos } = await motorRotas.planejar(origem, paradas, { retorno: saida.saida.exigeRetornoBase ? base : null });
  await registrarConsumos(banco, { empresaId: saida.saida.empresaId, saidaId: saida.saida.id, consumos });

  let versao = versaoEsperada;
  const ordemAtual = paradas.map((parada) => parada.pedidoId);
  const mudouOrdem = rota.ordem.length === ordemAtual.length && rota.ordem.some((pedidoId, indice) => ordemAtual[indice] !== pedidoId);
  if (mudouOrdem) {
    const resultado = await reordenarParadas(banco, { saidaId: saida.saida.id, versaoEsperada, ordem: rota.ordem });
    if (resultado !== "reordenada") return { tipo: "versao-desatualizada" };
    versao += 1;
  } else {
    // Mesma ordem: ainda assim confere que ninguém mudou a sequência enquanto o provedor calculava.
    const atual = await buscarSaida(banco, saida.saida.id);
    if (!atual || atual.saida.versaoSequencia !== versaoEsperada) return { tipo: "versao-desatualizada" };
  }
  await gravarRota(banco, saida.saida.id, rota, versao, instante);
  return { tipo: "recalculada" };
}
