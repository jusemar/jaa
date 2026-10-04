import {
  listaExcecoesPrivacidadeSchema,
  meuPerfilSchema,
  perfilPublicoSchema,
  situacaoSenhaSchema,
  type ArquivoEnviado,
  type AtualizarPerfilEntrada,
  type AtualizarPrivacidadeEntrada,
  type DecisaoPrivacidade,
  type ListaExcecoesPrivacidade,
  type MeuPerfil,
  type PerfilPublico,
  type SituacaoSenha,
} from "@jaa/contratos";
import * as z from "zod";
import { enviarArquivo, requisitarApi, type ResultadoApi } from "@/lib/api";
import { cabecalhosIdentidadeAtuante } from "@/lib/identidade-atuante";

/*
 * Perfil da identidade ATUANTE. O cabeçalho de identidade vai em tudo: agindo como a empresa, "meu
 * perfil" é o perfil DA EMPRESA — e quem decide isso é o servidor, não esta camada.
 */

const comIdentidade = () => ({ headers: cabecalhosIdentidadeAtuante() });

export function buscarMeuPerfil(): Promise<ResultadoApi<MeuPerfil>> {
  return requisitarApi("/perfil", meuPerfilSchema, comIdentidade());
}

export function salvarPerfil(entrada: AtualizarPerfilEntrada): Promise<ResultadoApi<MeuPerfil>> {
  return requisitarApi("/perfil", meuPerfilSchema, { method: "PATCH", body: JSON.stringify(entrada), ...comIdentidade() });
}

export function salvarPrivacidade(entrada: AtualizarPrivacidadeEntrada): Promise<ResultadoApi<MeuPerfil>> {
  return requisitarApi("/perfil/privacidade", meuPerfilSchema, { method: "PATCH", body: JSON.stringify(entrada), ...comIdentidade() });
}

export function buscarPerfilDe(identidadeId: string): Promise<ResultadoApi<PerfilPublico>> {
  return requisitarApi(`/identidades/${encodeURIComponent(identidadeId)}/perfil`, perfilPublicoSchema, comIdentidade());
}

export function listarExcecoes(): Promise<ResultadoApi<ListaExcecoesPrivacidade>> {
  return requisitarApi("/perfil/excecoes", listaExcecoesPrivacidadeSchema, comIdentidade());
}

export function salvarExcecao(identidadeId: string, decisao: DecisaoPrivacidade): Promise<ResultadoApi<{ salva: boolean }>> {
  return requisitarApi("/perfil/excecoes", z.object({ salva: z.boolean() }), {
    method: "PUT",
    body: JSON.stringify({ identidadeId, decisao }),
    ...comIdentidade(),
  });
}

export function removerExcecao(identidadeId: string): Promise<ResultadoApi<{ removida: boolean }>> {
  return requisitarApi(`/perfil/excecoes/${encodeURIComponent(identidadeId)}`, z.object({ removida: z.boolean() }), { method: "DELETE", ...comIdentidade() });
}

export function removerFoto(): Promise<ResultadoApi<{ removida: boolean }>> {
  return requisitarApi("/perfil/foto", z.object({ removida: z.boolean() }), { method: "DELETE", ...comIdentidade() });
}

// Foto da identidade ATUANTE (avatar ou logo). O multipart compartilhado vive em `@/lib/api`.
export function enviarFotoPerfil(arquivo: File): Promise<ResultadoApi<ArquivoEnviado>> {
  return enviarArquivo("/perfil/foto", arquivo, cabecalhosIdentidadeAtuante());
}

export function buscarSituacaoSenha(): Promise<ResultadoApi<SituacaoSenha>> {
  return requisitarApi("/conta/senha", situacaoSenhaSchema, comIdentidade());
}

export function salvarSenha(senha: string, senhaAtual?: string): Promise<ResultadoApi<unknown>> {
  return requisitarApi("/conta/senha", z.unknown(), {
    method: "POST",
    body: JSON.stringify({ senha, ...(senhaAtual ? { senhaAtual } : {}) }),
    ...comIdentidade(),
  });
}
