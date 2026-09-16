import {
  enderecoClienteSchema,
  listaEnderecosSchema,
  sugestaoLocalizacaoSchema,
  type Coordenadas,
  type CriarEnderecoEntrada,
  type EnderecoCliente,
  type ListaEnderecos,
  type SugestaoLocalizacao,
} from "@jaa/contratos";
import * as z from "zod";
import { requisitarApi, type ResultadoApi } from "@/lib/api";
import { cabecalhosIdentidadeAtuante } from "@/lib/identidade-atuante";

// Agenda PRIVADA do cliente: a API responde sempre para a identidade pessoal da sessão.
const caminho = (sufixo = "") => `/enderecos${sufixo}`;
const comIdentidade = () => cabecalhosIdentidadeAtuante();

export function listarEnderecos(): Promise<ResultadoApi<ListaEnderecos>> {
  return requisitarApi(caminho(), listaEnderecosSchema, { headers: comIdentidade() });
}

export function criarEndereco(entrada: CriarEnderecoEntrada): Promise<ResultadoApi<EnderecoCliente>> {
  return requisitarApi(caminho(), enderecoClienteSchema, { method: "POST", headers: comIdentidade(), body: JSON.stringify(entrada) });
}

export function atualizarEndereco(enderecoId: string, entrada: CriarEnderecoEntrada): Promise<ResultadoApi<EnderecoCliente>> {
  return requisitarApi(caminho(`/${encodeURIComponent(enderecoId)}`), enderecoClienteSchema, { method: "PATCH", headers: comIdentidade(), body: JSON.stringify(entrada) });
}

export function arquivarEndereco(enderecoId: string): Promise<ResultadoApi<null>> {
  // 204 sem corpo: o schema apenas aceita a resposta vazia.
  return requisitarApi(caminho(`/${encodeURIComponent(enderecoId)}`), z.null(), { method: "DELETE", headers: comIdentidade() });
}

// Confirmação/ajuste do PONTO: só acontece por ação explícita do cliente no mapa.
export function confirmarLocalizacao(enderecoId: string, coordenadas: Coordenadas): Promise<ResultadoApi<EnderecoCliente>> {
  return requisitarApi(caminho(`/${encodeURIComponent(enderecoId)}/localizacao`), enderecoClienteSchema, {
    method: "POST",
    headers: comIdentidade(),
    body: JSON.stringify(coordenadas),
  });
}

// Palpite para abrir o mapa perto do lugar provável; nunca altera o endereço nem confirma o ponto.
export function obterSugestaoLocalizacao(enderecoId: string): Promise<ResultadoApi<SugestaoLocalizacao>> {
  return requisitarApi(caminho(`/${encodeURIComponent(enderecoId)}/sugestao-localizacao`), sugestaoLocalizacaoSchema, { headers: comIdentidade() });
}
