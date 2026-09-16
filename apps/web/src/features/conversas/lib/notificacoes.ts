import type { EventoNotificacaoNovaMensagem } from "@jaa/contratos";

// Regras de EXIBIÇÃO do aviso in-app. Quem deve ser notificado já foi decidido pelo servidor;
// o cliente só evita incômodo desnecessário e duplicidade local.

export const MAXIMO_AVISOS_VISIVEIS = 3;
const MAXIMO_IDS_LEMBRADOS = 200;

export function deveExibirNotificacao({
  notificacao,
  identidadeId,
  conversaEmLeituraId,
  jaExibidas,
}: {
  notificacao: EventoNotificacaoNovaMensagem;
  identidadeId: string;
  // Conversa aberta com a aba visível: a mensagem já aparece na tela, não precisa de aviso.
  conversaEmLeituraId: string | null;
  jaExibidas: ReadonlySet<string>;
}): boolean {
  if (notificacao.remetente.identidadeId === identidadeId) return false;
  if (notificacao.conversaId === conversaEmLeituraId) return false;
  return !jaExibidas.has(notificacao.mensagemId);
}

// Mantém só os avisos mais recentes e um conjunto limitado de ids já exibidos (evento repetido não duplica).
export function registrarAviso(
  avisos: EventoNotificacaoNovaMensagem[],
  jaExibidas: Set<string>,
  notificacao: EventoNotificacaoNovaMensagem,
): EventoNotificacaoNovaMensagem[] {
  jaExibidas.add(notificacao.mensagemId);
  if (jaExibidas.size > MAXIMO_IDS_LEMBRADOS) {
    const maisAntigo = jaExibidas.values().next().value;
    if (maisAntigo !== undefined) jaExibidas.delete(maisAntigo);
  }
  return [...avisos.filter((aviso) => aviso.conversaId !== notificacao.conversaId), notificacao].slice(-MAXIMO_AVISOS_VISIVEIS);
}
