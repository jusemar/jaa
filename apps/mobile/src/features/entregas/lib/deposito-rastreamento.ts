import type { EnviarPosicaoEntrada } from "@jaa/contratos";
import * as SecureStore from "expo-secure-store";

const CHAVE_SAIDA = "jaa.rastreamento.saida";

/**
 * Estado LOCAL do rastreamento, pequeno de propósito:
 * - qual saída está sendo rastreada (o background não tem tela para perguntar);
 * - a última posição enviada (base da política: "andou o bastante? já passou o intervalo?");
 * - uma fila CURTA de pendentes para sobreviver a um túnel ou a uma região sem sinal.
 *
 * Não é histórico de trajeto e não pode virar um: o que interessa é a posição ATUAL da operação.
 * Em memória no processo do app; o sistema pode encerrar o processo e isso é aceitável — quando ele
 * volta, a próxima leitura vira "primeira" e o servidor recebe a posição atual na hora.
 */

export interface UltimaEnviada {
  latitude: number;
  longitude: number;
  capturadaEm: string;
}

export interface EstadoFilaLocal {
  pendentes: EnviarPosicaoEntrada[];
  ultimaEnviada: UltimaEnviada | null;
}

let estado: EstadoFilaLocal = { pendentes: [], ultimaEnviada: null };
let saidaRastreada: string | null = null;

export async function lerFilaLocal(): Promise<EstadoFilaLocal> {
  return { pendentes: [...estado.pendentes], ultimaEnviada: estado.ultimaEnviada };
}

export async function gravarFilaLocal(novo: EstadoFilaLocal): Promise<void> {
  estado = { pendentes: [...novo.pendentes], ultimaEnviada: novo.ultimaEnviada };
}

export async function lerSaidaRastreada(): Promise<string | null> {
  // O sistema pode encerrar o processo e acordar só a tarefa de localização: a memória volta vazia,
  // então a saída rastreada também fica no armazenamento seguro do aparelho (só o id, nenhuma posição).
  if (saidaRastreada === null) saidaRastreada = await SecureStore.getItemAsync(CHAVE_SAIDA).catch(() => null);
  return saidaRastreada;
}

export async function gravarSaidaRastreada(saidaId: string | null): Promise<void> {
  saidaRastreada = saidaId;
  if (saidaId === null) await SecureStore.deleteItemAsync(CHAVE_SAIDA).catch(() => undefined);
  else await SecureStore.setItemAsync(CHAVE_SAIDA, saidaId).catch(() => undefined);
  // Trocou (ou encerrou) a operação: a fila da anterior não vale mais nada.
  if (saidaId === null) estado = { pendentes: [], ultimaEnviada: null };
}
