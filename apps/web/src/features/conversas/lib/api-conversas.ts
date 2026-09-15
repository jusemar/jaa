import {
  conversaDiretaSchema,
  mensagemSchema,
  paginaConversasSchema,
  paginaMensagensSchema,
  type ConversaDireta,
  type EnviarMensagemTextoEntrada,
  type Mensagem,
  type PaginaConversas,
  type PaginaMensagens,
} from "@jaa/contratos";
import { requisitarApi, type ResultadoApi } from "@/lib/api";

export function abrirConversaDireta(nomeUsuario: string): Promise<ResultadoApi<ConversaDireta>> {
  return requisitarApi("/conversas/diretas", conversaDiretaSchema, {
    method: "POST",
    body: JSON.stringify({ nomeUsuario }),
  });
}

// Conversas da identidade da sessão (a API não aceita escolher outra), por atividade mais recente.
export function listarConversas(antesDe?: string): Promise<ResultadoApi<PaginaConversas>> {
  const consulta = antesDe ? `?antesDe=${encodeURIComponent(antesDe)}` : "";
  return requisitarApi(`/conversas${consulta}`, paginaConversasSchema);
}

export function listarMensagens(conversaId: string, antesDe?: string): Promise<ResultadoApi<PaginaMensagens>> {
  const consulta = antesDe ? `?antesDe=${encodeURIComponent(antesDe)}` : "";
  return requisitarApi(`/conversas/${conversaId}/mensagens${consulta}`, paginaMensagensSchema);
}

// Reenviar com o MESMO idCliente é seguro: a API devolve a mensagem já salva, sem duplicar.
export function enviarMensagem(conversaId: string, entrada: EnviarMensagemTextoEntrada): Promise<ResultadoApi<Mensagem>> {
  return requisitarApi(`/conversas/${conversaId}/mensagens`, mensagemSchema, {
    method: "POST",
    body: JSON.stringify(entrada),
  });
}
