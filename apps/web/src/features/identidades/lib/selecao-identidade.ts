import type { IdentidadeOperavel } from "@jaa/contratos";

/*
 * Identidade "ativa" no Web = PREFERÊNCIA de interface, nunca credencial. O id guardado no navegador
 * só é usado se ainda estiver na lista que o SERVIDOR informou como operável; senão vale a pessoal.
 * Qualquer ação em nome de uma identidade é autorizada de novo no servidor.
 */

export function resolverIdentidadeAtiva(operaveis: IdentidadeOperavel[], preferidaId: string | null): IdentidadeOperavel | null {
  const pessoal = operaveis.find((identidade) => identidade.tipo === "pessoal") ?? null;
  return operaveis.find((identidade) => identidade.identidadeId === preferidaId) ?? pessoal;
}

// Preferência separada por identidade pessoal: outra conta no mesmo navegador não herda a escolha.
const chavePreferencia = (identidadePessoalId: string) => `jaa:identidade-ativa:${identidadePessoalId}`;

export function lerPreferenciaIdentidade(identidadePessoalId: string): string | null {
  try {
    return window.localStorage.getItem(chavePreferencia(identidadePessoalId));
  } catch {
    return null;
  }
}

export function gravarPreferenciaIdentidade(identidadePessoalId: string, identidadeId: string): void {
  try {
    window.localStorage.setItem(chavePreferencia(identidadePessoalId), identidadeId);
  } catch {
    // Sem armazenamento disponível: a escolha vale só nesta sessão da página.
  }
}
