import {
  categoriaProdutoSchema,
  listaCategoriasSchema,
  listaProdutosSchema,
  produtoSchema,
  type ArquivoEnviado,
  type AtualizarCategoriaEntrada,
  type AtualizarProdutoEntrada,
  type CategoriaProduto,
  type ConsultaProdutos,
  type CriarCategoriaEntrada,
  type CriarProdutoEntrada,
  type DisponibilidadeProduto,
  type ListaCategorias,
  type ListaProdutos,
  type Produto,
} from "@jaa/contratos";
import * as z from "zod";
import { requisitarApi, type ResultadoApi } from "@/lib/api";
import { enviarArquivo } from "@/features/perfil/lib/api-perfil";

// API administrativa; a empresa é autorizada no servidor a partir da sessão (a rota não é credencial).
const rotaProdutos = (empresaId: string) => `/empresas/${encodeURIComponent(empresaId)}/produtos`;
const rotaCategorias = (empresaId: string) => `/empresas/${encodeURIComponent(empresaId)}/categorias`;

/** A paginação e os filtros são do SERVIDOR: a tela só pede a página que está mostrando. */
export function listarProdutos(empresaId: string, consulta: ConsultaProdutos = {}): Promise<ResultadoApi<ListaProdutos>> {
  const parametros = new URLSearchParams();
  for (const [chave, valor] of Object.entries(consulta)) {
    if (valor !== undefined && valor !== "") parametros.set(chave, String(valor));
  }
  const busca = parametros.toString();
  return requisitarApi(`${rotaProdutos(empresaId)}${busca ? `?${busca}` : ""}`, listaProdutosSchema);
}

export function obterProduto(empresaId: string, produtoId: string): Promise<ResultadoApi<Produto>> {
  return requisitarApi(`${rotaProdutos(empresaId)}/${encodeURIComponent(produtoId)}`, produtoSchema);
}

export function criarProduto(empresaId: string, entrada: CriarProdutoEntrada): Promise<ResultadoApi<Produto>> {
  return requisitarApi(rotaProdutos(empresaId), produtoSchema, { method: "POST", body: JSON.stringify(entrada) });
}

export function atualizarProduto(empresaId: string, produtoId: string, entrada: AtualizarProdutoEntrada): Promise<ResultadoApi<Produto>> {
  return requisitarApi(`${rotaProdutos(empresaId)}/${encodeURIComponent(produtoId)}`, produtoSchema, { method: "PATCH", body: JSON.stringify(entrada) });
}

export function alterarDisponibilidade(empresaId: string, produtoId: string, disponibilidade: DisponibilidadeProduto): Promise<ResultadoApi<Produto>> {
  return requisitarApi(`${rotaProdutos(empresaId)}/${encodeURIComponent(produtoId)}/disponibilidade`, produtoSchema, {
    method: "PATCH",
    body: JSON.stringify({ disponibilidade }),
  });
}

export function enviarImagemProduto(empresaId: string, produtoId: string, arquivo: File): Promise<ResultadoApi<ArquivoEnviado>> {
  return enviarArquivo(`${rotaProdutos(empresaId)}/${encodeURIComponent(produtoId)}/imagem`, arquivo);
}

export function removerImagemProduto(empresaId: string, produtoId: string): Promise<ResultadoApi<{ removida: boolean }>> {
  return requisitarApi(`${rotaProdutos(empresaId)}/${encodeURIComponent(produtoId)}/imagem`, z.object({ removida: z.boolean() }), { method: "DELETE" });
}

export function listarCategorias(empresaId: string): Promise<ResultadoApi<ListaCategorias>> {
  return requisitarApi(rotaCategorias(empresaId), listaCategoriasSchema);
}

export function criarCategoria(empresaId: string, entrada: CriarCategoriaEntrada): Promise<ResultadoApi<CategoriaProduto>> {
  return requisitarApi(rotaCategorias(empresaId), categoriaProdutoSchema, { method: "POST", body: JSON.stringify(entrada) });
}

export function atualizarCategoria(empresaId: string, categoriaId: string, entrada: AtualizarCategoriaEntrada): Promise<ResultadoApi<CategoriaProduto>> {
  return requisitarApi(`${rotaCategorias(empresaId)}/${encodeURIComponent(categoriaId)}`, categoriaProdutoSchema, { method: "PATCH", body: JSON.stringify(entrada) });
}

export function removerCategoria(empresaId: string, categoriaId: string): Promise<ResultadoApi<{ removida: boolean }>> {
  return requisitarApi(`${rotaCategorias(empresaId)}/${encodeURIComponent(categoriaId)}`, z.object({ removida: z.boolean() }), { method: "DELETE" });
}
