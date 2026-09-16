import {
  listaProdutosSchema,
  produtoSchema,
  type AtualizarProdutoEntrada,
  type CriarProdutoEntrada,
  type DisponibilidadeProduto,
  type ListaProdutos,
  type Produto,
} from "@jaa/contratos";
import { requisitarApi, type ResultadoApi } from "@/lib/api";

// API administrativa; a empresa é autorizada no servidor a partir da sessão (a rota não é credencial).
const rotaProdutos = (empresaId: string) => `/empresas/${encodeURIComponent(empresaId)}/produtos`;

export function listarProdutos(empresaId: string): Promise<ResultadoApi<ListaProdutos>> {
  return requisitarApi(rotaProdutos(empresaId), listaProdutosSchema);
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
