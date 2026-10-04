import { listaContatosSchema, respostaBuscaSchema, contatoSchema, type Contato, type ListaContatos, type RespostaBusca } from "@jaa/contratos";
import * as z from "zod";
import { requisitarApi, type RespostaApi } from "@/lib/api";
import { cabecalhosIdentidadeAtuante } from "@/lib/identidade-atuante";

/*
 * Agenda e busca da identidade ATUANTE. O cabeçalho de identidade vai em todas: a agenda pessoal e a
 * da empresa são diferentes, e quem decide qual é o servidor.
 */

const comIdentidade = () => ({ headers: cabecalhosIdentidadeAtuante() });

export function listarContatos(): Promise<RespostaApi<ListaContatos>> {
  return requisitarApi("/contatos", listaContatosSchema, comIdentidade());
}

export function salvarContato(identidadeId: string, apelido?: string): Promise<RespostaApi<Contato>> {
  return requisitarApi("/contatos", contatoSchema, {
    method: "POST",
    body: JSON.stringify({ identidadeId, ...(apelido ? { apelido } : {}) }),
    ...comIdentidade(),
  });
}

export function removerContato(identidadeId: string): Promise<RespostaApi<{ removido: boolean }>> {
  return requisitarApi(`/contatos/${encodeURIComponent(identidadeId)}`, z.object({ removido: z.boolean() }), { method: "DELETE", ...comIdentidade() });
}

/** Busca única: meus contatos primeiro, depois descoberta limitada no Jaa. */
export function pesquisarNoJaa(termo: string): Promise<RespostaApi<RespostaBusca>> {
  return requisitarApi(`/busca?termo=${encodeURIComponent(termo)}`, respostaBuscaSchema, comIdentidade());
}
