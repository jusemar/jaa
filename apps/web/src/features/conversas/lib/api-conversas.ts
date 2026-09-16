import {
  confirmacaoRecebimentoSchema,
  conversaDiretaSchema,
  exclusaoParaMimSchema,
  leituraConversaSchema,
  mensagemSchema,
  paginaConversasSchema,
  paginaMensagensSchema,
  type ConfirmacaoRecebimento,
  type ConfirmarLeituraEntrada,
  type ConfirmarRecebimentoEntrada,
  type ConversaDireta,
  type EditarMensagemEntrada,
  type ExclusaoParaMim,
  type LeituraConversa,
  type EnviarMensagemTextoEntrada,
  type Mensagem,
  type PaginaConversas,
  type PaginaMensagens,
} from "@jaa/contratos";
import { requisitarApi, type ResultadoApi } from "@/lib/api";
import { cabecalhosIdentidadeAtuante } from "@/lib/identidade-atuante";

// Todas as operações do mensageiro vão em nome da identidade ATUANTE (intenção validada pela API).

export function abrirConversaDireta(nomeUsuario: string): Promise<ResultadoApi<ConversaDireta>> {
  return requisitarApi("/conversas/diretas", conversaDiretaSchema, {
    headers: cabecalhosIdentidadeAtuante(),
    method: "POST",
    body: JSON.stringify({ nomeUsuario }),
  });
}

// Conversas da identidade da sessão (a API não aceita escolher outra), por atividade mais recente.
export function listarConversas(antesDe?: string): Promise<ResultadoApi<PaginaConversas>> {
  const consulta = antesDe ? `?antesDe=${encodeURIComponent(antesDe)}` : "";
  return requisitarApi(`/conversas${consulta}`, paginaConversasSchema, { headers: cabecalhosIdentidadeAtuante() });
}

export function listarMensagens(conversaId: string, antesDe?: string): Promise<ResultadoApi<PaginaMensagens>> {
  const consulta = antesDe ? `?antesDe=${encodeURIComponent(antesDe)}` : "";
  return requisitarApi(`/conversas/${conversaId}/mensagens${consulta}`, paginaMensagensSchema, { headers: cabecalhosIdentidadeAtuante() });
}

// Reenviar com o MESMO idCliente é seguro: a API devolve a mensagem já salva, sem duplicar.
export function enviarMensagem(conversaId: string, entrada: EnviarMensagemTextoEntrada): Promise<ResultadoApi<Mensagem>> {
  return requisitarApi(`/conversas/${conversaId}/mensagens`, mensagemSchema, {
    headers: cabecalhosIdentidadeAtuante(),
    method: "POST",
    body: JSON.stringify(entrada),
  });
}

// ENTREGUE: este cliente recebeu as mensagens. Quem confirma é a identidade da sessão.
export function confirmarRecebimentoMensagens(mensagemIds: string[]): Promise<ResultadoApi<ConfirmacaoRecebimento>> {
  return requisitarApi("/mensagens/recebimentos", confirmacaoRecebimentoSchema, {
    headers: cabecalhosIdentidadeAtuante(),
    method: "POST",
    body: JSON.stringify({ mensagemIds } satisfies ConfirmarRecebimentoEntrada),
  });
}

// LIDA: marcador de leitura da identidade da sessão nesta conversa. Nunca volta.
export function confirmarLeituraConversa(conversaId: string, ateMensagemId: string): Promise<ResultadoApi<LeituraConversa>> {
  return requisitarApi(`/conversas/${conversaId}/leitura`, leituraConversaSchema, {
    headers: cabecalhosIdentidadeAtuante(),
    method: "POST",
    body: JSON.stringify({ ateMensagemId } satisfies ConfirmarLeituraEntrada),
  });
}

// Edição pelo autor; a API impõe autoria, validação e preserva id/criadoEm/estado/referência.
export function editarMensagem(conversaId: string, mensagemId: string, conteudo: string): Promise<ResultadoApi<Mensagem>> {
  return requisitarApi(`/conversas/${conversaId}/mensagens/${mensagemId}`, mensagemSchema, {
    headers: cabecalhosIdentidadeAtuante(),
    method: "PATCH",
    body: JSON.stringify({ conteudo } satisfies EditarMensagemEntrada),
  });
}

// Só a identidade da sessão deixa de ver; devolve a nova última mensagem visível da conversa.
export function excluirMensagemParaMim(conversaId: string, mensagemId: string): Promise<ResultadoApi<ExclusaoParaMim>> {
  return requisitarApi(`/conversas/${conversaId}/mensagens/${mensagemId}?escopo=mim`, exclusaoParaMimSchema, { method: "DELETE", headers: cabecalhosIdentidadeAtuante() });
}

// Só o autor; devolve o tombstone (sem conteúdo).
export function excluirMensagemParaTodos(conversaId: string, mensagemId: string): Promise<ResultadoApi<Mensagem>> {
  return requisitarApi(`/conversas/${conversaId}/mensagens/${mensagemId}?escopo=todos`, mensagemSchema, { method: "DELETE", headers: cabecalhosIdentidadeAtuante() });
}
