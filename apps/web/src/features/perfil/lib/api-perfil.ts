import {
  identidadePublicaSchema,
  listaExcecoesPrivacidadeSchema,
  meuPerfilSchema,
  perfilPublicoSchema,
  codigoTelefoneEnviadoSchema,
  situacaoEmailContaSchema,
  situacaoSenhaSchema,
  situacaoTelefoneContaSchema,
  type ArquivoEnviado,
  type AtualizarPerfilEntrada,
  type AtualizarPrivacidadeEntrada,
  type DecisaoPrivacidade,
  type IdentidadePublica,
  type ListaExcecoesPrivacidade,
  type MeuPerfil,
  type PerfilPublico,
  type SituacaoEmailConta,
  type SituacaoSenha,
  type SituacaoTelefoneConta,
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

/** Identidade pelo @usuario do Link do Jaa — consulta PÚBLICA, funciona sem sessão. */
export function buscarIdentidadePublica(nomeUsuario: string): Promise<ResultadoApi<IdentidadePublica>> {
  return requisitarApi(`/publico/identidades/${encodeURIComponent(nomeUsuario)}`, identidadePublicaSchema);
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

/*
 * TELEFONE da conta: o número como a pessoa o lê (ou null). Cadastrar/alterar é em dois passos — pedir
 * o código (SMS no número NOVO; o servidor recusa antes do envio se o número já é de outra conta) e
 * confirmar.
 */
export function buscarSituacaoTelefone(): Promise<ResultadoApi<SituacaoTelefoneConta>> {
  return requisitarApi("/conta/telefone", situacaoTelefoneContaSchema, comIdentidade());
}

export function pedirCodigoTelefone(telefone: string): Promise<ResultadoApi<unknown>> {
  return requisitarApi("/conta/telefone/codigo", codigoTelefoneEnviadoSchema, { method: "POST", body: JSON.stringify({ telefone }), ...comIdentidade() });
}

export function confirmarTelefone(telefone: string, codigo: string): Promise<ResultadoApi<SituacaoTelefoneConta>> {
  return requisitarApi("/conta/telefone", situacaoTelefoneContaSchema, { method: "POST", body: JSON.stringify({ telefone, codigo }), ...comIdentidade() });
}

/*
 * E-MAIL da conta: o endereço REAL e verificado (ou null) e se o código por e-mail está ligado no
 * servidor. Cadastrar/alterar é do Better Auth (pedido de código + confirmação), em `formulario-email`.
 */
export function buscarSituacaoEmail(): Promise<ResultadoApi<SituacaoEmailConta>> {
  return requisitarApi("/conta/email", situacaoEmailContaSchema, comIdentidade());
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
