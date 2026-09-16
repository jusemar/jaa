import { LIMITE_CONTAGEM_NAO_LIDAS, type EventoConversaNaoLidas, type ExclusaoParaMim, type ItemListaConversas, type Mensagem } from "@jaa/contratos";
import { versaoMaisRecente } from "./versoes-mensagem";

// Reconciliação da lista entre respostas HTTP (páginas) e eventos realtime.
// Chave = id da conversa (nunca duplica); ordem = id da última mensagem (UUIDv7), igual à da API.
// Nunca regride: um dado mais antigo (ex.: resposta HTTP atrasada) não sobrescreve um mais novo.

const maisRecentePrimeiro = (a: ItemListaConversas, b: ItemListaConversas) =>
  a.ultimaMensagem.id < b.ultimaMensagem.id ? 1 : a.ultimaMensagem.id > b.ultimaMensagem.id ? -1 : 0;

export function mesclarConversas(atuais: ItemListaConversas[], novas: ItemListaConversas[]): ItemListaConversas[] {
  const porId = new Map(atuais.map((item) => [item.id, item]));
  for (const item of novas) {
    const existente = porId.get(item.id);
    if (!existente || item.ultimaMensagem.id > existente.ultimaMensagem.id) {
      porId.set(item.id, item);
    } else if (item.ultimaMensagem.id === existente.ultimaMensagem.id) {
      // Mesma última mensagem: dados da página mais nova, mas nunca uma versão mais antiga do conteúdo.
      porId.set(item.id, { ...item, ultimaMensagem: versaoMaisRecente(existente.ultimaMensagem, item.ultimaMensagem) });
    }
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

// Mensagem existente alterada: só muda a prévia se ela for a última da conversa; nunca reordena.
export function aplicarAtualizacaoNaLista(atuais: ItemListaConversas[], atualizada: Mensagem): ItemListaConversas[] {
  return atuais.map((item) =>
    item.ultimaMensagem.id === atualizada.id ? { ...item, ultimaMensagem: versaoMaisRecente(item.ultimaMensagem, atualizada) } : item,
  );
}

// "Excluir para mim": se a excluída era a última da conversa, a prévia passa a ser a nova última visível
// informada pela API (ou a conversa sai da lista, se não sobrou nenhuma). Nunca reordena para cima.
export function aplicarExclusaoParaMimNaLista(atuais: ItemListaConversas[], exclusao: ExclusaoParaMim): ItemListaConversas[] {
  const item = atuais.find((atual) => atual.id === exclusao.conversaId);
  if (!item || item.ultimaMensagem.id !== exclusao.mensagemId) return atuais;
  const restantes = atuais.filter((atual) => atual.id !== exclusao.conversaId);
  if (!exclusao.ultimaMensagem) return restantes;
  return mesclarConversas(restantes, [{ ...item, ultimaMensagem: exclusao.ultimaMensagem }]);
}

// Contagem vinda do servidor é absoluta: substitui (nunca soma). Conversa não carregada é ignorada;
// ela virá com a contagem certa quando a página for (re)carregada.
export function aplicarNaoLidasNaLista(atuais: ItemListaConversas[], evento: EventoConversaNaoLidas): ItemListaConversas[] {
  return atuais.map((item) => (item.id === evento.conversaId && item.naoLidas !== evento.naoLidas ? { ...item, naoLidas: evento.naoLidas } : item));
}

export function rotuloNaoLidas(naoLidas: number): string {
  return naoLidas >= LIMITE_CONTAGEM_NAO_LIDAS || naoLidas > 99 ? "99+" : String(naoLidas);
}
