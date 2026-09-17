import { listaContatosSchema, respostaBuscaSchema, contatoSchema, type Contato, type ListaContatos, type RespostaBusca } from "@jaa/contratos";
import * as z from "zod";
import { requisitarApi, type ResultadoApi } from "@/lib/api";
import { cabecalhosIdentidadeAtuante } from "@/lib/identidade-atuante";

/*
 * Agenda e busca da identidade ATUANTE. O cabeçalho de identidade vai em todas: a agenda pessoal e a
 * da empresa são diferentes, e quem decide qual é o servidor.
 */

const comIdentidade = () => ({ headers: cabecalhosIdentidadeAtuante() });

export function listarContatos(): Promise<ResultadoApi<ListaContatos>> {
  return requisitarApi("/contatos", listaContatosSchema, comIdentidade());
}

export function salvarContato(identidadeId: string, apelido?: string): Promise<ResultadoApi<Contato>> {
  return requisitarApi("/contatos", contatoSchema, {
    method: "POST",
    body: JSON.stringify({ identidadeId, ...(apelido ? { apelido } : {}) }),
    ...comIdentidade(),
  });
}

export function removerContato(identidadeId: string): Promise<ResultadoApi<{ removido: boolean }>> {
  return requisitarApi(`/contatos/${encodeURIComponent(identidadeId)}`, z.object({ removido: z.boolean() }), { method: "DELETE", ...comIdentidade() });
}

/** Busca única: meus contatos primeiro, depois descoberta limitada no Jaa. */
export function pesquisarNoJaa(termo: string): Promise<ResultadoApi<RespostaBusca>> {
  return requisitarApi(`/busca?termo=${encodeURIComponent(termo)}`, respostaBuscaSchema, comIdentidade());
}
