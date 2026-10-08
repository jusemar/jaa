import {
  enderecoDoCepSchema,
  type EnderecoDoCep,
  enderecoClienteSchema,
  coberturaEntregaSchema,
  listaEnderecosSchema,
  sugestaoLocalizacaoSchema,
  type Coordenadas,
  type CoberturaEntrega,
  type CriarEnderecoEntrada,
  type EnderecoCliente,
  type ListaEnderecos,
  type SugestaoLocalizacao,
} from "@jaa/contratos";
import * as z from "zod";
import { requisitarApi, type RespostaApi } from "@/lib/api";
import { cabecalhosIdentidadeAtuante } from "@/lib/identidade-atuante";

// Agenda PRIVADA do cliente: a API responde sempre para a identidade pessoal da sessão.
const caminho = (sufixo = "") => `/enderecos${sufixo}`;
const comIdentidade = () => cabecalhosIdentidadeAtuante();

export function listarEnderecos(): Promise<RespostaApi<ListaEnderecos>> {
  return requisitarApi(caminho(), listaEnderecosSchema, {
    headers: comIdentidade(),
  });
}

export function criarEndereco(
  entrada: CriarEnderecoEntrada,
): Promise<RespostaApi<EnderecoCliente>> {
  return requisitarApi(caminho(), enderecoClienteSchema, {
    method: "POST",
    headers: comIdentidade(),
    body: JSON.stringify(entrada),
  });
}

export function atualizarEndereco(
  enderecoId: string,
  entrada: CriarEnderecoEntrada,
): Promise<RespostaApi<EnderecoCliente>> {
  return requisitarApi(
    caminho(`/${encodeURIComponent(enderecoId)}`),
    enderecoClienteSchema,
    {
      method: "PATCH",
      headers: comIdentidade(),
      body: JSON.stringify(entrada),
    },
  );
}

export function arquivarEndereco(
  enderecoId: string,
): Promise<RespostaApi<null>> {
  // 204 sem corpo: o schema apenas aceita a resposta vazia.
  return requisitarApi(
    caminho(`/${encodeURIComponent(enderecoId)}`),
    z.null(),
    { method: "DELETE", headers: comIdentidade() },
  );
}

// Confirmação/ajuste do PONTO: só acontece por ação explícita do cliente no mapa.
export function confirmarLocalizacao(
  enderecoId: string,
  coordenadas: Coordenadas,
): Promise<RespostaApi<EnderecoCliente>> {
  return requisitarApi(
    caminho(`/${encodeURIComponent(enderecoId)}/localizacao`),
    enderecoClienteSchema,
    {
      method: "POST",
      headers: comIdentidade(),
      body: JSON.stringify(coordenadas),
    },
  );
}

export function validarCoberturaEntrega(
  empresaIdentidadeId: string,
  coordenadas: Coordenadas,
): Promise<RespostaApi<CoberturaEntrega>> {
  return requisitarApi(
    `/empresas/${encodeURIComponent(empresaIdentidadeId)}/cobertura-entrega`,
    coberturaEntregaSchema,
    {
      method: "POST",
      headers: comIdentidade(),
      body: JSON.stringify(coordenadas),
    },
  );
}

export function confirmarLocalizacaoParaEmpresa(
  enderecoId: string,
  empresaIdentidadeId: string,
  coordenadas: Coordenadas,
): Promise<RespostaApi<EnderecoCliente>> {
  return requisitarApi(
    caminho(
      `/${encodeURIComponent(enderecoId)}/localizacao/empresas/${encodeURIComponent(empresaIdentidadeId)}`,
    ),
    enderecoClienteSchema,
    {
      method: "POST",
      headers: comIdentidade(),
      body: JSON.stringify(coordenadas),
    },
  );
}

// Palpite para abrir o mapa perto do lugar provável; nunca altera o endereço nem confirma o ponto.
export function obterSugestaoLocalizacao(
  enderecoId: string,
): Promise<RespostaApi<SugestaoLocalizacao>> {
  return requisitarApi(
    caminho(`/${encodeURIComponent(enderecoId)}/sugestao-localizacao`),
    sugestaoLocalizacaoSchema,
    { headers: comIdentidade() },
  );
}

export function obterSugestaoLocalizacaoDoRascunho(
  empresaIdentidadeId: string,
  endereco: CriarEnderecoEntrada,
): Promise<RespostaApi<SugestaoLocalizacao>> {
  return requisitarApi(
    `/empresas/${encodeURIComponent(empresaIdentidadeId)}/enderecos/sugestao-localizacao`,
    sugestaoLocalizacaoSchema,
    {
      method: "POST",
      headers: comIdentidade(),
      body: JSON.stringify(endereco),
    },
  );
}

export function criarEnderecoParaEmpresa(
  empresaIdentidadeId: string,
  endereco: CriarEnderecoEntrada,
  coordenadas: Coordenadas,
): Promise<RespostaApi<EnderecoCliente>> {
  return requisitarApi(
    `/empresas/${encodeURIComponent(empresaIdentidadeId)}/enderecos`,
    enderecoClienteSchema,
    {
      method: "POST",
      headers: comIdentidade(),
      body: JSON.stringify({ endereco, coordenadas }),
    },
  );
}

export function atualizarEnderecoParaEmpresa(
  enderecoId: string,
  empresaIdentidadeId: string,
  endereco: CriarEnderecoEntrada,
  coordenadas: Coordenadas,
): Promise<RespostaApi<EnderecoCliente>> {
  return requisitarApi(
    caminho(
      `/${encodeURIComponent(enderecoId)}/empresas/${encodeURIComponent(empresaIdentidadeId)}`,
    ),
    enderecoClienteSchema,
    {
      method: "PATCH",
      headers: comIdentidade(),
      body: JSON.stringify({ endereco, coordenadas }),
    },
  );
}

// CEP → texto do endereço. O servidor consulta o provedor; o app nunca fala com ele direto.
export function consultarCepNaApi(digitos: string): Promise<RespostaApi<EnderecoDoCep>> {
  return requisitarApi(`/enderecos/cep/${encodeURIComponent(digitos)}`, enderecoDoCepSchema, {});
}
