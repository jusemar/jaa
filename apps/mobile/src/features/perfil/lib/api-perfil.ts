import { meuPerfilSchema, perfilPublicoSchema, situacaoSenhaSchema, type SituacaoSenha, type ArquivoEnviado, type PerfilPublico, type AtualizarPerfilEntrada, type AtualizarPrivacidadeEntrada, type MeuPerfil } from "@jaa/contratos";
import * as z from "zod";
import { enviarArquivo, requisitarApi, type RespostaApi } from "@/lib/api";
import type { ArquivoLocal } from "@/lib/envio-arquivo";
import { cabecalhosIdentidadeAtuante } from "@/lib/identidade-atuante";

/*
 * Perfil da identidade ATUANTE. O cabeçalho de identidade vai em tudo: agindo como a empresa, "meu
 * perfil" é o perfil DA EMPRESA — e quem decide isso é o servidor, não esta camada.
 */
const comIdentidade = () => ({ headers: cabecalhosIdentidadeAtuante() });

export function buscarMeuPerfil(): Promise<RespostaApi<MeuPerfil>> {
  return requisitarApi("/perfil", meuPerfilSchema, comIdentidade());
}

export function salvarPerfil(entrada: AtualizarPerfilEntrada): Promise<RespostaApi<MeuPerfil>> {
  return requisitarApi("/perfil", meuPerfilSchema, { method: "PATCH", body: JSON.stringify(entrada), ...comIdentidade() });
}

export function salvarPrivacidade(entrada: AtualizarPrivacidadeEntrada): Promise<RespostaApi<MeuPerfil>> {
  return requisitarApi("/perfil/privacidade", meuPerfilSchema, { method: "PATCH", body: JSON.stringify(entrada), ...comIdentidade() });
}

/** Foto da identidade ATUANTE (avatar da pessoa ou logo da empresa): a mesma rota da Web. */
export function enviarFotoPerfil(arquivo: ArquivoLocal): Promise<RespostaApi<ArquivoEnviado>> {
  return enviarArquivo("/perfil/foto", arquivo, cabecalhosIdentidadeAtuante());
}

export function removerFotoPerfil(): Promise<RespostaApi<{ removida: boolean }>> {
  return requisitarApi("/perfil/foto", z.object({ removida: z.boolean() }), { method: "DELETE", ...comIdentidade() });
}

/**
 * Perfil PÚBLICO de outra identidade, visto pela identidade atuante: a foto já vem decidida pela
 * privacidade do dono no servidor (`null` = sem foto ou não é para você ver).
 */
export function buscarPerfilPublico(identidadeId: string): Promise<RespostaApi<PerfilPublico>> {
  return requisitarApi(`/identidades/${encodeURIComponent(identidadeId)}/perfil`, perfilPublicoSchema, comIdentidade());
}

/*
 * SENHA da conta (Better Auth, as mesmas rotas da Web): saber se já existe, criar a primeira ou trocar
 * informando a atual. É da CONTA, não da identidade — por isso sem cabeçalho de identidade atuante.
 */
export function buscarSituacaoSenha(): Promise<RespostaApi<SituacaoSenha>> {
  return requisitarApi("/conta/senha", situacaoSenhaSchema);
}

export function salvarSenha(senha: string, senhaAtual?: string): Promise<RespostaApi<unknown>> {
  return requisitarApi("/conta/senha", z.unknown(), { method: "POST", body: JSON.stringify({ senha, ...(senhaAtual ? { senhaAtual } : {}) }) });
}

