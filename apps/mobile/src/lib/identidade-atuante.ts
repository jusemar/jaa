import { CABECALHO_IDENTIDADE_ATUANTE } from "@jaa/contratos";

/*
 * Identidade em nome de quem esta aba OPERA o mensageiro (null = pessoal). É apenas a INTENÇÃO enviada
 * à API (cabeçalho) e ao realtime (auth do handshake); o servidor autoriza cada uso contra os vínculos
 * da conta. Não é credencial: trocar este valor sem permissão só produz recusas.
 */

type OuvinteIdentidadeAtuante = (identidadeId: string | null) => void;

let identidadeAtuanteId: string | null = null;
const ouvintes = new Set<OuvinteIdentidadeAtuante>();

export function obterIdentidadeAtuante(): string | null {
  return identidadeAtuanteId;
}

export function definirIdentidadeAtuante(identidadeId: string | null): void {
  if (identidadeId === identidadeAtuanteId) return;
  identidadeAtuanteId = identidadeId;
  for (const ouvinte of ouvintes) ouvinte(identidadeId);
}

export function aoMudarIdentidadeAtuante(ouvinte: OuvinteIdentidadeAtuante): () => void {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}

// Cabeçalho para rotas que agem em nome de uma identidade (conversas e mensagens).
export function cabecalhosIdentidadeAtuante(): Record<string, string> {
  return identidadeAtuanteId ? { [CABECALHO_IDENTIDADE_ATUANTE]: identidadeAtuanteId } : {};
}
