import type { Banco } from "@jaa/banco";
import { criarMotorDeRotas, type MotorDeRotas, type ParadaDeRota } from "../lib/motor-rotas.js";
import { buscarSaida, reordenarParadas, type SaidaComParadasRegistro } from "../repositorios/repositorio-saidas.js";
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
  const { rota, consumos } = await motorRotas.planejar(origem, paradas);

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
  const { rota, consumos } = await motorRotas.recalcularPercurso(origem, paradas);

  await gravarRota(banco, saidaId, rota, saida.saida.versaoSequencia, agora());
  await registrarConsumos(banco, { empresaId: saida.saida.empresaId, saidaId, consumos });
}
