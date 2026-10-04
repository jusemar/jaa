import {
  confirmacaoRecebimentoSchema,
  conversaDiretaSchema,
  exclusaoParaMimSchema,
  leituraConversaSchema,
  mensagemSchema,
  paginaConversasSchema,
  paginaMensagensSchema,
  urlsAudiosSchema,
  urlsImagensSchema,
  CAMPO_ARQUIVO_AUDIO,
  CAMPO_ARQUIVO_IMAGEM,
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
  type PedirUrlsAudiosEntrada,
  type PedirUrlsImagensEntrada,
  type UrlsAudios,
  type UrlsImagens,
} from "@jaa/contratos";
import { enviarMultipart, requisitarApi, type ResultadoApi } from "@/lib/api";
import { camposDoEnvioDeAudio, nomeDoArquivoDeAudio, type TentativaAudio } from "./audio-conversa";
import { camposDoEnvioDeImagem, type TentativaImagem } from "./imagem-conversa";
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

/**
 * IMAGEM: multipart com os campos NA ORDEM do contrato e o arquivo por último. Reenviar a MESMA
 * tentativa (mesmo idCliente) é seguro: a API devolve a mensagem já salva (200) sem gravar de novo.
 */
export function enviarMensagemImagem(conversaId: string, tentativa: Pick<TentativaImagem, "idCliente" | "legenda" | "mensagemRespondidaId" | "arquivo">): Promise<ResultadoApi<Mensagem>> {
  return enviarMultipart(`/conversas/${conversaId}/mensagens/imagem`, mensagemSchema, {
    campos: camposDoEnvioDeImagem(tentativa),
    arquivo: tentativa.arquivo,
    campoArquivo: CAMPO_ARQUIVO_IMAGEM,
    headers: cabecalhosIdentidadeAtuante(),
    mensagemFalha: "Não foi possível enviar a foto.",
  });
}

/*
 * MENSAGEM DE VOZ: multipart com os campos NA ORDEM do contrato (idCliente, resposta, duracaoMs) e o
 * arquivo por último. Reenviar a MESMA tentativa é seguro: a API devolve 200 com a mensagem já salva.
 */
export function enviarMensagemAudio(conversaId: string, tentativa: Pick<TentativaAudio, "idCliente" | "duracaoMs" | "mensagemRespondidaId" | "arquivo">): Promise<ResultadoApi<Mensagem>> {
  return enviarMultipart(`/conversas/${conversaId}/mensagens/audio`, mensagemSchema, {
    campos: camposDoEnvioDeAudio(tentativa),
    arquivo: tentativa.arquivo,
    nomeArquivo: nomeDoArquivoDeAudio(tentativa.arquivo.type),
    campoArquivo: CAMPO_ARQUIVO_AUDIO,
    headers: cabecalhosIdentidadeAtuante(),
    mensagemFalha: "Não foi possível enviar o áudio.",
  });
}

// URLs PRIVADAS temporárias dos áudios (mesmas regras das imagens).
export function pedirUrlsAudios(conversaId: string, mensagemIds: string[]): Promise<ResultadoApi<UrlsAudios>> {
  return requisitarApi(`/conversas/${conversaId}/audios/urls`, urlsAudiosSchema, {
    headers: cabecalhosIdentidadeAtuante(),
    method: "POST",
    body: JSON.stringify({ mensagemIds } satisfies PedirUrlsAudiosEntrada),
  });
}

// URLs PRIVADAS temporárias das imagens (até 100 ids por chamada); só o que a identidade pode ver volta.
export function pedirUrlsImagens(conversaId: string, mensagemIds: string[]): Promise<ResultadoApi<UrlsImagens>> {
  return requisitarApi(`/conversas/${conversaId}/imagens/urls`, urlsImagensSchema, {
    headers: cabecalhosIdentidadeAtuante(),
    method: "POST",
    body: JSON.stringify({ mensagemIds } satisfies PedirUrlsImagensEntrada),
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

// LIMPAR / APAGAR conversa: só para a identidade atuante (o outro participante não perde nada).
function estadoPessoal(conversaId: string, acao: "limpar" | "apagar"): Promise<ResultadoApi<null>> {
  return requisitarApi(`/conversas/${encodeURIComponent(conversaId)}/${acao}`, { parse: () => null }, { method: "POST", headers: cabecalhosIdentidadeAtuante() });
}

export const limparConversa = (conversaId: string) => estadoPessoal(conversaId, "limpar");
export const apagarConversa = (conversaId: string) => estadoPessoal(conversaId, "apagar");
