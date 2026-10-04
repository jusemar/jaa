/*
 * Qual conversa está ABERTA NA TELA agora. Na Web a lista e a conversa são o mesmo componente; no app a
 * conversa é uma tela empilhada sobre a lista, então essa informação vive aqui para a lista continuar
 * sabendo que não deve mostrar o contador de não lidas da conversa que a pessoa está lendo.
 */
let conversaId: string | null = null;
const ouvintes = new Set<() => void>();

export function definirConversaEmLeitura(id: string | null): void {
  if (id === conversaId) return;
  conversaId = id;
  for (const ouvinte of ouvintes) ouvinte();
}

export const obterConversaEmLeitura = () => conversaId;

export function assinarConversaEmLeitura(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}
