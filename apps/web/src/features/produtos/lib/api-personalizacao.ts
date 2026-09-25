import {
  listaGruposOpcoesSchema,
  type AtualizarGrupoOpcoesEntrada,
  type AtualizarOpcaoEntrada,
  type CriarGrupoOpcoesEntrada,
  type CriarOpcaoEntrada,
  type ListaGruposOpcoes,
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
