import {
  listaGruposOpcoesSchema,
  programacaoSemanalGrupoSchema,
  type AtualizarGrupoOpcoesEntrada,
  type AtualizarOpcaoEntrada,
  type CriarGrupoOpcoesEntrada,
  type CriarOpcaoEntrada,
  type DiaSemana,
  type ListaGruposOpcoes,
  type ProgramacaoSemanalGrupo,
} from "@jaa/contratos";
import { requisitarApi, type ResultadoApi } from "@/lib/api";

/*
 * API administrativa da PERSONALIZAÇÃO (grupos de opções do produto). A empresa é autorizada no
 * servidor a partir da sessão — a rota não é credencial.
 *
 * Toda operação devolve a lista COMPLETA de grupos do produto: a tela de administração precisa da
 * ordem e das opções atualizadas, e isso evita uma segunda requisição a cada passo.
 */
const rotaGrupos = (empresaId: string, produtoId: string) =>
  `/empresas/${encodeURIComponent(empresaId)}/produtos/${encodeURIComponent(produtoId)}/grupos-opcoes`;

export function listarGruposOpcoes(empresaId: string, produtoId: string): Promise<ResultadoApi<ListaGruposOpcoes>> {
  return requisitarApi(rotaGrupos(empresaId, produtoId), listaGruposOpcoesSchema);
}

export function criarGrupoOpcoes(empresaId: string, produtoId: string, entrada: CriarGrupoOpcoesEntrada): Promise<ResultadoApi<ListaGruposOpcoes>> {
  return requisitarApi(rotaGrupos(empresaId, produtoId), listaGruposOpcoesSchema, { method: "POST", body: JSON.stringify(entrada) });
}

export function atualizarGrupoOpcoes(
  empresaId: string,
  produtoId: string,
  grupoId: string,
  entrada: AtualizarGrupoOpcoesEntrada,
): Promise<ResultadoApi<ListaGruposOpcoes>> {
  return requisitarApi(`${rotaGrupos(empresaId, produtoId)}/${encodeURIComponent(grupoId)}`, listaGruposOpcoesSchema, {
    method: "PATCH",
    body: JSON.stringify(entrada),
  });
}

export function removerGrupoOpcoes(empresaId: string, produtoId: string, grupoId: string): Promise<ResultadoApi<ListaGruposOpcoes>> {
  return requisitarApi(`${rotaGrupos(empresaId, produtoId)}/${encodeURIComponent(grupoId)}`, listaGruposOpcoesSchema, { method: "DELETE" });
}

export function criarOpcao(empresaId: string, produtoId: string, grupoId: string, entrada: CriarOpcaoEntrada): Promise<ResultadoApi<ListaGruposOpcoes>> {
  return requisitarApi(`${rotaGrupos(empresaId, produtoId)}/${encodeURIComponent(grupoId)}/opcoes`, listaGruposOpcoesSchema, {
    method: "POST",
    body: JSON.stringify(entrada),
  });
}

export function atualizarOpcao(
  empresaId: string,
  produtoId: string,
  grupoId: string,
  opcaoId: string,
  entrada: AtualizarOpcaoEntrada,
): Promise<ResultadoApi<ListaGruposOpcoes>> {
  return requisitarApi(`${rotaGrupos(empresaId, produtoId)}/${encodeURIComponent(grupoId)}/opcoes/${encodeURIComponent(opcaoId)}`, listaGruposOpcoesSchema, {
    method: "PATCH",
    body: JSON.stringify(entrada),
  });
}

export function removerOpcao(empresaId: string, produtoId: string, grupoId: string, opcaoId: string): Promise<ResultadoApi<ListaGruposOpcoes>> {
  return requisitarApi(`${rotaGrupos(empresaId, produtoId)}/${encodeURIComponent(grupoId)}/opcoes/${encodeURIComponent(opcaoId)}`, listaGruposOpcoesSchema, {
    method: "DELETE",
  });
}

/*
 * PROGRAMAÇÃO SEMANAL do grupo: em que dias cada opção JÁ CADASTRADA é oferecida. Não cria opção
 * nenhuma. Toda operação devolve a programação completa (os sete dias), lida do banco.
 */
const rotaProgramacao = (empresaId: string, produtoId: string, grupoId: string) => `${rotaGrupos(empresaId, produtoId)}/${encodeURIComponent(grupoId)}/programacao`;

export function consultarProgramacaoSemanal(empresaId: string, produtoId: string, grupoId: string): Promise<ResultadoApi<ProgramacaoSemanalGrupo>> {
  return requisitarApi(rotaProgramacao(empresaId, produtoId, grupoId), programacaoSemanalGrupoSchema);
}

/** Liga/desliga. Ligar pela primeira vez preenche a semana; desligar não apaga os dias. */
export function definirProgramacaoSemanal(empresaId: string, produtoId: string, grupoId: string, programacaoSemanal: boolean): Promise<ResultadoApi<ProgramacaoSemanalGrupo>> {
  return requisitarApi(rotaProgramacao(empresaId, produtoId, grupoId), programacaoSemanalGrupoSchema, { method: "PUT", body: JSON.stringify({ programacaoSemanal }) });
}

/** Substitui as opções de UM dia; os outros dias não mudam. */
export function definirOpcoesDoDia(empresaId: string, produtoId: string, grupoId: string, dia: DiaSemana, opcaoIds: string[]): Promise<ResultadoApi<ProgramacaoSemanalGrupo>> {
  return requisitarApi(`${rotaProgramacao(empresaId, produtoId, grupoId)}/dias/${dia}`, programacaoSemanalGrupoSchema, { method: "PUT", body: JSON.stringify({ opcaoIds }) });
}
