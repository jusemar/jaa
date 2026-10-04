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
  type UrlsAudios,
  type UrlsImagens,
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
import { enviarMultipartApi, requisitarApi, type RespostaApi } from "@/lib/api";
import { cabecalhosIdentidadeAtuante } from "@/lib/identidade-atuante";
import { arquivoDoAudio, camposDoEnvioDeAudio, type TentativaAudio } from "./audio-conversa";
import { arquivoDaImagem, camposDoEnvioDeImagem, type TentativaImagem } from "./imagem-conversa";

// Todas as operações do mensageiro vão em nome da identidade ATUANTE (intenção validada pela API).

export function abrirConversaDireta(nomeUsuario: string): Promise<RespostaApi<ConversaDireta>> {
  return requisitarApi("/conversas/diretas", conversaDiretaSchema, {
    headers: cabecalhosIdentidadeAtuante(),
    method: "POST",
    body: JSON.stringify({ nomeUsuario }),
  });
}

// Conversas da identidade da sessão (a API não aceita escolher outra), por atividade mais recente.
export function listarConversas(antesDe?: string): Promise<RespostaApi<PaginaConversas>> {
  const consulta = antesDe ? `?antesDe=${encodeURIComponent(antesDe)}` : "";
  return requisitarApi(`/conversas${consulta}`, paginaConversasSchema, { headers: cabecalhosIdentidadeAtuante() });
}

export function listarMensagens(conversaId: string, antesDe?: string): Promise<RespostaApi<PaginaMensagens>> {
  const consulta = antesDe ? `?antesDe=${encodeURIComponent(antesDe)}` : "";
  return requisitarApi(`/conversas/${conversaId}/mensagens${consulta}`, paginaMensagensSchema, { headers: cabecalhosIdentidadeAtuante() });
}

// Reenviar com o MESMO idCliente é seguro: a API devolve a mensagem já salva, sem duplicar.
export function enviarMensagem(conversaId: string, entrada: EnviarMensagemTextoEntrada): Promise<RespostaApi<Mensagem>> {
  return requisitarApi(`/conversas/${conversaId}/mensagens`, mensagemSchema, {
    headers: cabecalhosIdentidadeAtuante(),
    method: "POST",
    body: JSON.stringify(entrada),
  });
}

// ENTREGUE: este cliente recebeu as mensagens. Quem confirma é a identidade da sessão.
export function confirmarRecebimentoMensagens(mensagemIds: string[]): Promise<RespostaApi<ConfirmacaoRecebimento>> {
  return requisitarApi("/mensagens/recebimentos", confirmacaoRecebimentoSchema, {
    headers: cabecalhosIdentidadeAtuante(),
    method: "POST",
    body: JSON.stringify({ mensagemIds } satisfies ConfirmarRecebimentoEntrada),
  });
}

// LIDA: marcador de leitura da identidade da sessão nesta conversa. Nunca volta.
export function confirmarLeituraConversa(conversaId: string, ateMensagemId: string): Promise<RespostaApi<LeituraConversa>> {
  return requisitarApi(`/conversas/${conversaId}/leitura`, leituraConversaSchema, {
    headers: cabecalhosIdentidadeAtuante(),
    method: "POST",
    body: JSON.stringify({ ateMensagemId } satisfies ConfirmarLeituraEntrada),
  });
}

// Edição pelo autor; a API impõe autoria, validação e preserva id/criadoEm/estado/referência.
export function editarMensagem(conversaId: string, mensagemId: string, conteudo: string): Promise<RespostaApi<Mensagem>> {
  return requisitarApi(`/conversas/${conversaId}/mensagens/${mensagemId}`, mensagemSchema, {
    headers: cabecalhosIdentidadeAtuante(),
    method: "PATCH",
    body: JSON.stringify({ conteudo } satisfies EditarMensagemEntrada),
  });
}

// Só a identidade da sessão deixa de ver; devolve a nova última mensagem visível da conversa.
export function excluirMensagemParaMim(conversaId: string, mensagemId: string): Promise<RespostaApi<ExclusaoParaMim>> {
  return requisitarApi(`/conversas/${conversaId}/mensagens/${mensagemId}?escopo=mim`, exclusaoParaMimSchema, { method: "DELETE", headers: cabecalhosIdentidadeAtuante() });
}

// Só o autor; devolve o tombstone (sem conteúdo).
export function excluirMensagemParaTodos(conversaId: string, mensagemId: string): Promise<RespostaApi<Mensagem>> {
  return requisitarApi(`/conversas/${conversaId}/mensagens/${mensagemId}?escopo=todos`, mensagemSchema, { method: "DELETE", headers: cabecalhosIdentidadeAtuante() });
}

// LIMPAR / APAGAR conversa: só para a identidade atuante (o outro participante não perde nada).
function estadoPessoal(conversaId: string, acao: "limpar" | "apagar"): Promise<RespostaApi<null>> {
  return requisitarApi(`/conversas/${encodeURIComponent(conversaId)}/${acao}`, { parse: () => null }, { method: "POST", headers: cabecalhosIdentidadeAtuante() });
}

export const limparConversa = (conversaId: string) => estadoPessoal(conversaId, "limpar");
export const apagarConversa = (conversaId: string) => estadoPessoal(conversaId, "apagar");

/*
 * IMAGEM na conversa: multipart com os campos NA ORDEM do contrato e o arquivo por último. Reenviar a
 * MESMA tentativa (mesmo idCliente) é seguro: a API devolve 200 com a mensagem já salva.
 */
export function enviarMensagemImagem(conversaId: string, tentativa: TentativaImagem): Promise<RespostaApi<Mensagem>> {
  return enviarMultipartApi(
    `/conversas/${conversaId}/mensagens/imagem`,
    mensagemSchema,
    { campos: camposDoEnvioDeImagem(tentativa), arquivo: arquivoDaImagem(tentativa.imagem), campoArquivo: CAMPO_ARQUIVO_IMAGEM },
    cabecalhosIdentidadeAtuante(),
  );
}

// URLs privadas temporárias (lote de até 100). Só voltam as imagens que a identidade atuante pode ver.
export function pedirUrlsImagens(conversaId: string, mensagemIds: string[]): Promise<RespostaApi<UrlsImagens>> {
  return requisitarApi(`/conversas/${conversaId}/imagens/urls`, urlsImagensSchema, {
    headers: cabecalhosIdentidadeAtuante(),
    method: "POST",
    body: JSON.stringify({ mensagemIds }),
  });
}

/*
 * MENSAGEM DE VOZ: multipart com os campos NA ORDEM do contrato (idCliente, resposta, duracaoMs) e o
 * arquivo por último. Reenviar a MESMA tentativa é seguro: a API devolve 200 com a mensagem já salva.
 */
export function enviarMensagemAudio(conversaId: string, tentativa: TentativaAudio): Promise<RespostaApi<Mensagem>> {
  return enviarMultipartApi(
    `/conversas/${conversaId}/mensagens/audio`,
    mensagemSchema,
    { campos: camposDoEnvioDeAudio(tentativa), arquivo: arquivoDoAudio(tentativa.audio), campoArquivo: CAMPO_ARQUIVO_AUDIO },
    cabecalhosIdentidadeAtuante(),
  );
}

// URLs privadas temporárias dos áudios (mesmas regras das imagens).
export function pedirUrlsAudios(conversaId: string, mensagemIds: string[]): Promise<RespostaApi<UrlsAudios>> {
  return requisitarApi(`/conversas/${conversaId}/audios/urls`, urlsAudiosSchema, {
    headers: cabecalhosIdentidadeAtuante(),
    method: "POST",
    body: JSON.stringify({ mensagemIds }),
  });
}
