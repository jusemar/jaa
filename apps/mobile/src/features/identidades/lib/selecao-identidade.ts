import type { IdentidadeOperavelRecebida } from "@jaa/contratos";
import * as SecureStore from "expo-secure-store";

/*
 * A identidade "Agindo como" é PREFERÊNCIA DE INTERFACE (mesma regra da Web): só vale se estiver na
 * lista operável que o servidor devolveu, e nunca é credencial — a API autoriza cada chamada de novo.
 */

// Ativa = a preferida, se ainda for operável; senão, a pessoal.
export function resolverIdentidadeAtiva(operaveis: readonly IdentidadeOperavelRecebida[], preferidaId: string | null): IdentidadeOperavelRecebida | null {
  const pessoal = operaveis.find((identidade) => identidade.tipo === "pessoal") ?? null;
  return operaveis.find((identidade) => identidade.identidadeId === preferidaId) ?? pessoal;
}

// Por identidade pessoal: trocar de conta no mesmo aparelho não herda a escolha da conta anterior.
const chavePreferencia = (identidadePessoalId: string) => `jaa.identidade-ativa.${identidadePessoalId}`;

export async function lerPreferenciaIdentidade(identidadePessoalId: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(chavePreferencia(identidadePessoalId));
  } catch {
    return null;
  }
}

export async function gravarPreferenciaIdentidade(identidadePessoalId: string, identidadeId: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(chavePreferencia(identidadePessoalId), identidadeId);
  } catch {
    // Sem armazenamento a seleção vale só para esta abertura do app.
  }
}
