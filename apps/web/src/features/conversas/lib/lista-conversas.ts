import type { ItemListaConversas, Mensagem } from "@jaa/contratos";

// Reconciliação da lista entre respostas HTTP (páginas) e eventos realtime.
// Chave = id da conversa (nunca duplica); ordem = id da última mensagem (UUIDv7), igual à da API.
// Nunca regride: um dado mais antigo (ex.: resposta HTTP atrasada) não sobrescreve um mais novo.

const maisRecentePrimeiro = (a: ItemListaConversas, b: ItemListaConversas) =>
  a.ultimaMensagem.id < b.ultimaMensagem.id ? 1 : a.ultimaMensagem.id > b.ultimaMensagem.id ? -1 : 0;

export function mesclarConversas(atuais: ItemListaConversas[], novas: ItemListaConversas[]): ItemListaConversas[] {
  const porId = new Map(atuais.map((item) => [item.id, item]));
  for (const item of novas) {
    const existente = porId.get(item.id);
    if (!existente || item.ultimaMensagem.id > existente.ultimaMensagem.id) porId.set(item.id, item);
  }
  return [...porId.values()].sort(maisRecentePrimeiro);
}

/**
 * Aplica uma mensagem (evento realtime ou resposta do envio) à lista.
 * `conhecida: false` → a conversa ainda não está carregada e o evento não traz os dados da outra
 * identidade: quem chama deve recarregar a primeira página, onde ela estará no topo.
 */
export function aplicarMensagemNaLista(
  atuais: ItemListaConversas[],
  mensagem: Mensagem,
): { lista: ItemListaConversas[]; conhecida: boolean } {
  const existente = atuais.find((item) => item.id === mensagem.conversaId);
  if (!existente) return { lista: atuais, conhecida: false };
  return { lista: mesclarConversas(atuais, [{ ...existente, ultimaMensagem: mensagem }]), conhecida: true };
}
