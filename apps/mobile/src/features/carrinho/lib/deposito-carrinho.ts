import { gravarCarrinho, lerCarrinho, type Carrinho } from "./carrinho";

/*
 * Depósito do carrinho em memória, espelhando o armazenamento local por identidade. Existe para o
 * React ler um valor estável (useSyncExternalStore) sem recarregar o armazenamento a cada render.
 */

const carrinhos = new Map<string, Carrinho | null>();
const ouvintes = new Set<() => void>();

export function assinarCarrinho(notificar: () => void): () => void {
  ouvintes.add(notificar);
  return () => {
    ouvintes.delete(notificar);
  };
}

export function carrinhoAtual(identidadeId: string): Carrinho | null {
  if (!carrinhos.has(identidadeId)) carrinhos.set(identidadeId, lerCarrinho(identidadeId));
  return carrinhos.get(identidadeId) ?? null;
}

export function guardarCarrinho(identidadeId: string, carrinho: Carrinho | null): void {
  // Carrinho sem itens não existe: some do armazenamento e da interface.
  const limpo = carrinho && carrinho.itens.length > 0 ? carrinho : null;
  gravarCarrinho(identidadeId, limpo);
  carrinhos.set(identidadeId, limpo);
  for (const notificar of ouvintes) notificar();
}
