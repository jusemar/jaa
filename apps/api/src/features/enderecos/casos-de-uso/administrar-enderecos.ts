import type { Banco } from "@jaa/banco";
import { MAXIMO_ENDERECOS_POR_IDENTIDADE, alteracaoInvalidaLocalizacao, type Coordenadas } from "@jaa/contratos";
import {
  arquivarEndereco,
  atualizarEndereco,
  buscarEndereco,
  confirmarLocalizacao,
  contarEnderecos,
  inserirEndereco,
  listarEnderecos,
  type DadosEndereco,
  type EnderecoRegistro,
} from "../repositorios/repositorio-enderecos.js";

/*
 * AGENDA DE ENDEREÇOS do cliente. A identidade dona vem SEMPRE da sessão (identidade atuante já
 * validada na rota, que também exige que seja pessoal): nenhum `identidadeId` do corpo é aceito.
 * Endereço de outra pessoa é indistinguível de inexistente.
 */

type Resultado<T> = { tipo: "ok"; dados: T } | { tipo: "endereco-nao-encontrado" } | { tipo: "limite-de-enderecos" };

export function listarEnderecosDoCliente(banco: Banco, identidadeId: string): Promise<EnderecoRegistro[]> {
  return listarEnderecos(banco, identidadeId);
}

export async function obterEnderecoDoCliente(banco: Banco, identidadeId: string, enderecoId: string): Promise<Resultado<EnderecoRegistro>> {
  const endereco = await buscarEndereco(banco, identidadeId, enderecoId);
  return endereco ? { tipo: "ok", dados: endereco } : { tipo: "endereco-nao-encontrado" };
}

export async function cadastrarEndereco(banco: Banco, identidadeId: string, dados: DadosEndereco): Promise<Resultado<EnderecoRegistro>> {
  if ((await contarEnderecos(banco, identidadeId)) >= MAXIMO_ENDERECOS_POR_IDENTIDADE) return { tipo: "limite-de-enderecos" };
  // Nasce sem ponto: a primeira utilização passa pela confirmação no mapa.
  return { tipo: "ok", dados: await inserirEndereco(banco, identidadeId, dados) };
}

/**
 * Editar o texto NUNCA mexe nas coordenadas por conta própria — mas, se algum campo ESTRUTURAL mudou
 * (pode ser outro destino físico), a confirmação anterior deixa de valer e o ponto é limpo: a próxima
 * utilização pede nova confirmação no mapa. Apelido não invalida nada.
 */
export async function editarEndereco(banco: Banco, identidadeId: string, enderecoId: string, dados: DadosEndereco): Promise<Resultado<EnderecoRegistro>> {
  const atual = await buscarEndereco(banco, identidadeId, enderecoId);
  if (!atual) return { tipo: "endereco-nao-encontrado" };

  const manterLocalizacao = !alteracaoInvalidaLocalizacao(atual, dados);
  const atualizado = await atualizarEndereco(banco, identidadeId, enderecoId, dados, manterLocalizacao);
  return atualizado ? { tipo: "ok", dados: atualizado } : { tipo: "endereco-nao-encontrado" };
}

// Confirmar ou reajustar o pin: ação explícita do cliente, que substitui o ponto e a data.
export async function confirmarPontoDeEntrega(banco: Banco, identidadeId: string, enderecoId: string, coordenadas: Coordenadas): Promise<Resultado<EnderecoRegistro>> {
  const confirmado = await confirmarLocalizacao(banco, identidadeId, enderecoId, coordenadas);
  return confirmado ? { tipo: "ok", dados: confirmado } : { tipo: "endereco-nao-encontrado" };
}

// Remoção lógica: pedidos antigos continuam com o snapshot e a referência ao endereço de origem.
export async function arquivarEnderecoDoCliente(banco: Banco, identidadeId: string, enderecoId: string): Promise<Resultado<null>> {
  return (await arquivarEndereco(banco, identidadeId, enderecoId)) ? { tipo: "ok", dados: null } : { tipo: "endereco-nao-encontrado" };
}
