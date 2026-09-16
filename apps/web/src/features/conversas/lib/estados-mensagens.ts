import {
  estadoMaisAvancado,
  type EventoMensagensEntregues,
  type EventoMensagensLidas,
  type Mensagem,
} from "@jaa/contratos";
import { resumirConteudoParaPrevia } from "./respostas";
import { versaoMaisRecente } from "./versoes-mensagem";

// Reconciliação das mensagens da conversa aberta entre histórico HTTP, resposta do envio e realtime.
// Regras: nunca duplica (chave = id), ordena pelo id (UUIDv7) e o estado NUNCA regride.
// Fatos de estado que chegam antes da própria mensagem (ex.: "entregue" antes da resposta HTTP do
// envio) ficam guardados e são aplicados quando ela aparecer.

export type ConversaReconciliada = {
  mensagens: Mensagem[];
  entreguesIds: ReadonlySet<string>;
  // Maior marcador de leitura conhecido por leitor.
  lidaAtePorLeitor: Readonly<Record<string, string>>;
  // Excluídas "para mim" nesta sessão: uma página HTTP atrasada não pode trazê-las de volta.
  ocultasIds: ReadonlySet<string>;
};

export const conversaVazia: ConversaReconciliada = { mensagens: [], entreguesIds: new Set(), lidaAtePorLeitor: {}, ocultasIds: new Set() };

function aplicarFatos(mensagem: Mensagem, fatos: Omit<ConversaReconciliada, "mensagens" | "ocultasIds">): Mensagem {
  let estado = mensagem.estado;
  if (fatos.entreguesIds.has(mensagem.id)) estado = estadoMaisAvancado(estado, "entregue");
  for (const [leitor, ate] of Object.entries(fatos.lidaAtePorLeitor)) {
    if (mensagem.remetenteIdentidadeId !== leitor && mensagem.id <= ate) estado = estadoMaisAvancado(estado, "lida");
  }
  return estado === mensagem.estado ? mensagem : { ...mensagem, estado };
}

function reaplicar(conversa: ConversaReconciliada, porId: Map<string, Mensagem>): ConversaReconciliada {
  const mensagens = [...porId.values()]
    .map((mensagem) => aplicarFatos(mensagem, conversa))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { ...conversa, mensagens };
}

export function receberMensagens(conversa: ConversaReconciliada, novas: Mensagem[]): ConversaReconciliada {
  const porId = new Map(conversa.mensagens.map((mensagem) => [mensagem.id, mensagem]));
  for (const nova of novas) {
    if (conversa.ocultasIds.has(nova.id)) continue;
    const atual = porId.get(nova.id);
    porId.set(nova.id, atual ? { ...versaoMaisRecente(atual, nova), estado: estadoMaisAvancado(atual.estado, nova.estado) } : nova);
  }
  return reaplicar(conversa, porId);
}

/**
 * Mensagem existente alterada (evento `mensagem:atualizada` ou resposta da edição): substitui pelo id
 * sem mudar a ordem, e atualiza a prévia das respostas carregadas que citam essa mensagem.
 * Mensagem ainda não carregada não é inserida (ela virá no histórico quando for carregada).
 */
export function receberAtualizacao(conversa: ConversaReconciliada, atualizada: Mensagem): ConversaReconciliada {
  const porId = new Map(conversa.mensagens.map((mensagem) => [mensagem.id, mensagem]));
  const atual = porId.get(atualizada.id);
  const vigente = atual ? versaoMaisRecente(atual, atualizada) : atualizada;
  if (atual) porId.set(atual.id, { ...vigente, estado: estadoMaisAvancado(atual.estado, atualizada.estado) });

  for (const mensagem of porId.values()) {
    const referencia = mensagem.mensagemRespondida;
    if (referencia?.id !== vigente.id) continue;
    const previa = vigente.excluidaEm
      ? { previaConteudo: "", conteudoTruncado: false, excluida: true }
      : { ...resumirConteudoParaPrevia(vigente.conteudo), excluida: false };
    porId.set(mensagem.id, { ...mensagem, mensagemRespondida: { ...referencia, ...previa } });
  }
  return reaplicar(conversa, porId);
}

// "Excluir para mim" (resposta HTTP ou evento de outra aba): remove e impede que volte.
export function ocultarMensagem(conversa: ConversaReconciliada, mensagemId: string): ConversaReconciliada {
  return {
    ...conversa,
    ocultasIds: new Set([...conversa.ocultasIds, mensagemId]),
    mensagens: conversa.mensagens.filter((mensagem) => mensagem.id !== mensagemId),
  };
}

// Numa conversa direta existe um único destinatário: a confirmação dele basta para "entregue".
export function receberEntrega(conversa: ConversaReconciliada, evento: EventoMensagensEntregues): ConversaReconciliada {
  const entreguesIds = new Set([...conversa.entreguesIds, ...evento.mensagemIds]);
  return reaplicar({ ...conversa, entreguesIds }, new Map(conversa.mensagens.map((m) => [m.id, m])));
}

export function receberLeitura(conversa: ConversaReconciliada, evento: EventoMensagensLidas): ConversaReconciliada {
  const atual = conversa.lidaAtePorLeitor[evento.leitorIdentidadeId];
  if (atual && atual >= evento.ateMensagemId) return conversa;
  const lidaAtePorLeitor = { ...conversa.lidaAtePorLeitor, [evento.leitorIdentidadeId]: evento.ateMensagemId };
  return reaplicar({ ...conversa, lidaAtePorLeitor }, new Map(conversa.mensagens.map((m) => [m.id, m])));
}

// Mensagem mais recente recebida de outra identidade: o marcador de leitura a confirmar.
export function ultimaMensagemRecebida(mensagens: Mensagem[], identidadeId: string): Mensagem | undefined {
  return mensagens.findLast((mensagem) => mensagem.remetenteIdentidadeId !== identidadeId);
}
