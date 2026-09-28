import {
  LIMITE_CONTAGEM_NAO_LIDAS,
  type EventoConversaEstadoPessoal,
  type EventoConversaNaoLidas,
  type ExclusaoParaMim,
  type ItemListaConversas,
  type Mensagem,
} from "@jaa/contratos";
import { versaoMaisRecente } from "./versoes-mensagem";

// Reconciliação da lista entre respostas HTTP (páginas) e eventos realtime.
// Chave = id da conversa (nunca duplica); ordem = ATIVIDADE (UUIDv7), igual à da API: a última mensagem
// visível ou, na conversa LIMPA sem nada novo, até onde ela foi limpa.
// Nunca regride: um dado mais antigo (ex.: resposta HTTP atrasada) não sobrescreve um mais novo.

export const atividadeDe = (item: ItemListaConversas) => item.ultimaMensagem?.id ?? item.atividadeId;

const maisRecentePrimeiro = (a: ItemListaConversas, b: ItemListaConversas) =>
  atividadeDe(a) < atividadeDe(b) ? 1 : atividadeDe(a) > atividadeDe(b) ? -1 : 0;

export function mesclarConversas(atuais: ItemListaConversas[], novas: ItemListaConversas[]): ItemListaConversas[] {
  const porId = new Map(atuais.map((item) => [item.id, item]));
  for (const item of novas) {
    const existente = porId.get(item.id);
    if (!existente || atividadeDe(item) > atividadeDe(existente)) {
      porId.set(item.id, item);
    } else if (atividadeDe(item) === atividadeDe(existente)) {
      // Mesma atividade: dados da página mais nova, mas nunca uma versão mais antiga do conteúdo.
      const ultimaMensagem = item.ultimaMensagem && existente.ultimaMensagem ? versaoMaisRecente(existente.ultimaMensagem, item.ultimaMensagem) : item.ultimaMensagem;
      porId.set(item.id, { ...item, ultimaMensagem });
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
  return { lista: mesclarConversas(atuais, [{ ...existente, ultimaMensagem: mensagem, atividadeId: mensagem.id }]), conhecida: true };
}

// Mensagem existente alterada: só muda a prévia se ela for a última da conversa; nunca reordena.
export function aplicarAtualizacaoNaLista(atuais: ItemListaConversas[], atualizada: Mensagem): ItemListaConversas[] {
  return atuais.map((item) =>
    item.ultimaMensagem?.id === atualizada.id ? { ...item, ultimaMensagem: versaoMaisRecente(item.ultimaMensagem, atualizada) } : item,
  );
}

// "Excluir para mim": se a excluída era a última da conversa, a prévia passa a ser a nova última visível
// informada pela API (ou a conversa sai da lista, se não sobrou nenhuma). Nunca reordena para cima.
export function aplicarExclusaoParaMimNaLista(atuais: ItemListaConversas[], exclusao: ExclusaoParaMim): ItemListaConversas[] {
  const item = atuais.find((atual) => atual.id === exclusao.conversaId);
  if (!item || item.ultimaMensagem?.id !== exclusao.mensagemId) return atuais;
  const restantes = atuais.filter((atual) => atual.id !== exclusao.conversaId);
  if (!exclusao.ultimaMensagem) return restantes;
  return mesclarConversas(restantes, [{ ...item, ultimaMensagem: exclusao.ultimaMensagem, atividadeId: exclusao.ultimaMensagem.id }]);
}

/** A conversa com não lidas ainda não está na lista: quem ouve o evento deve (re)carregar a página. */
export function precisaCarregarConversa(atuais: ItemListaConversas[], evento: EventoConversaNaoLidas): boolean {
  return evento.naoLidas > 0 && !atuais.some((item) => item.id === evento.conversaId);
}

// Contagem vinda do servidor é absoluta: substitui (nunca soma). Conversa não carregada é ignorada
// aqui; `precisaCarregarConversa` diz a quem ouve o evento que a página deve ser recarregada.
export function aplicarNaoLidasNaLista(atuais: ItemListaConversas[], evento: EventoConversaNaoLidas): ItemListaConversas[] {
  return atuais.map((item) => (item.id === evento.conversaId && item.naoLidas !== evento.naoLidas ? { ...item, naoLidas: evento.naoLidas } : item));
}

export function rotuloNaoLidas(naoLidas: number): string {
  return naoLidas >= LIMITE_CONTAGEM_NAO_LIDAS || naoLidas > 99 ? "99+" : String(naoLidas);
}

/*
 * FILTROS DA INBOX — recorte de LEITURA, nunca de autorização: a lista já veio do servidor para a
 * identidade atuante, e aqui a pessoa só escolhe o que quer enxergar agora.
 *
 * Tudo é derivado do que a lista já tem (`naoLidas` e o tipo da outra identidade); nada é inventado
 * nem pedido de novo à API. "Não lidas" ignora a conversa que está aberta e sendo lida, para o item
 * não sumir debaixo do dedo enquanto se lê.
 */
export const FILTROS_CONVERSAS = ["todas", "nao-lidas", "empresas"] as const;

export type FiltroConversas = (typeof FILTROS_CONVERSAS)[number];

export const ROTULO_FILTRO_CONVERSAS: Record<FiltroConversas, string> = {
  todas: "Todas",
  "nao-lidas": "Não lidas",
  empresas: "Empresas",
};

export function filtrarConversas(
  itens: ItemListaConversas[],
  filtro: FiltroConversas,
  conversaEmLeituraId: string | null = null,
): ItemListaConversas[] {
  if (filtro === "empresas") return itens.filter((item) => item.outraIdentidade.tipo === "empresarial");
  if (filtro === "nao-lidas") return itens.filter((item) => item.naoLidas > 0 && item.id !== conversaEmLeituraId);
  return itens;
}

/** Quantas conversas têm mensagem por ler — o número que acompanha o filtro "Não lidas". */
export function contarConversasNaoLidas(itens: ItemListaConversas[], conversaEmLeituraId: string | null = null): number {
  return filtrarConversas(itens, "nao-lidas", conversaEmLeituraId).length;
}

/**
 * Limpar/apagar feito por ESTA identidade (em qualquer aba): "limpa" mantém a conversa no mesmo lugar,
 * sem prévia e sem não lidas; "apagada" tira da lista (ela volta quando chegar mensagem nova).
 */
export function aplicarEstadoPessoalNaLista(atuais: ItemListaConversas[], evento: EventoConversaEstadoPessoal): ItemListaConversas[] {
  if (evento.acao === "apagada") return atuais.filter((item) => item.id !== evento.conversaId);
  return atuais.map((item) => (item.id === evento.conversaId ? { ...item, ultimaMensagem: null, atividadeId: atividadeDe(item), naoLidas: 0 } : item));
}
