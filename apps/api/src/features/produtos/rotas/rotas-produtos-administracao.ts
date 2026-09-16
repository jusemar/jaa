import type { Banco } from "@jaa/banco";
import {
  alterarDisponibilidadeProdutoEntradaSchema,
  atualizarProdutoEntradaSchema,
  criarProdutoEntradaSchema,
  type ErroApi,
  type ListaProdutos,
} from "@jaa/contratos";
import type { FastifyInstance, FastifyReply } from "fastify";
import * as z from "zod";
import type { Autenticacao } from "../../autenticacao/autenticacao.js";
import { exigirIdentidadeAutenticada, obterIdentidadeExigida } from "../../autenticacao/lib/exigir-identidade-autenticada.js";
import {
  alterarDisponibilidadeProduto,
  atualizarProduto,
  criarProduto,
  listarProdutosAdministrados,
  obterProdutoAdministrado,
} from "../casos-de-uso/administrar-produtos.js";
import { serializarProduto } from "../lib/serializar-produto.js";

const parametrosEmpresaSchema = z.object({ empresaId: z.uuid() });
const parametrosProdutoSchema = z.object({ empresaId: z.uuid(), produtoId: z.uuid() });

function responderDadosInvalidos(resposta: FastifyReply, mensagem: string | undefined) {
  const erro: ErroApi = { codigo: "DADOS_INVALIDOS", mensagem: mensagem ?? "Dados inválidos." };
  return resposta.code(400).send(erro);
}

function responderNaoEncontrado(resposta: FastifyReply, tipo: "empresa-nao-encontrada" | "produto-nao-encontrado") {
  const erro: ErroApi =
    tipo === "empresa-nao-encontrada"
      ? { codigo: "EMPRESA_NAO_ENCONTRADA", mensagem: "Empresa não encontrada." }
      : { codigo: "PRODUTO_NAO_ENCONTRADO", mensagem: "Produto não encontrado." };
  return resposta.code(404).send(erro);
}

/**
 * API ADMINISTRATIVA de produtos (membros autorizados). Não é pública: a futura consulta pública da
 * loja/app terá rotas e contrato próprios, só com dados permitidos e produtos disponíveis.
 * Handlers finos: validam, chamam o caso de uso (que autoriza) e serializam.
 */
export function registrarRotasProdutosAdministracao(servidor: FastifyInstance, dependencias: { banco: Banco; autenticacao: Autenticacao }) {
  const preHandler = exigirIdentidadeAutenticada(dependencias);
  const { banco } = dependencias;

  servidor.get("/empresas/:empresaId/produtos", { preHandler }, async (requisicao, resposta) => {
    const { usuarioId } = obterIdentidadeExigida(requisicao);
    const parametros = parametrosEmpresaSchema.safeParse(requisicao.params);
    if (!parametros.success) return responderDadosInvalidos(resposta, "Empresa inválida.");

    const resultado = await listarProdutosAdministrados(banco, usuarioId, parametros.data.empresaId);
    if (resultado.tipo !== "lista") return responderNaoEncontrado(resposta, resultado.tipo);
    const lista: ListaProdutos = { produtos: resultado.produtos.map(serializarProduto) };
    return lista;
  });

  servidor.post("/empresas/:empresaId/produtos", { preHandler }, async (requisicao, resposta) => {
    const { usuarioId } = obterIdentidadeExigida(requisicao);
    const parametros = parametrosEmpresaSchema.safeParse(requisicao.params);
    const entrada = criarProdutoEntradaSchema.safeParse(requisicao.body);
    if (!parametros.success) return responderDadosInvalidos(resposta, "Empresa inválida.");
    if (!entrada.success) return responderDadosInvalidos(resposta, entrada.error.issues[0]?.message);

    const resultado = await criarProduto(banco, usuarioId, parametros.data.empresaId, entrada.data);
    if (resultado.tipo !== "criado") return responderNaoEncontrado(resposta, resultado.tipo);
    return resposta.code(201).send(serializarProduto(resultado.produto));
  });

  servidor.get("/empresas/:empresaId/produtos/:produtoId", { preHandler }, async (requisicao, resposta) => {
    const { usuarioId } = obterIdentidadeExigida(requisicao);
    const parametros = parametrosProdutoSchema.safeParse(requisicao.params);
    if (!parametros.success) return responderDadosInvalidos(resposta, "Produto inválido.");

    const { empresaId, produtoId } = parametros.data;
    const resultado = await obterProdutoAdministrado(banco, usuarioId, empresaId, produtoId);
    if (resultado.tipo !== "produto") return responderNaoEncontrado(resposta, resultado.tipo);
    return serializarProduto(resultado.produto);
  });

  servidor.patch("/empresas/:empresaId/produtos/:produtoId", { preHandler }, async (requisicao, resposta) => {
    const { usuarioId } = obterIdentidadeExigida(requisicao);
    const parametros = parametrosProdutoSchema.safeParse(requisicao.params);
    const entrada = atualizarProdutoEntradaSchema.safeParse(requisicao.body);
    if (!parametros.success) return responderDadosInvalidos(resposta, "Produto inválido.");
    if (!entrada.success) return responderDadosInvalidos(resposta, entrada.error.issues[0]?.message);

    const { empresaId, produtoId } = parametros.data;
    const resultado = await atualizarProduto(banco, usuarioId, empresaId, produtoId, entrada.data);
    if (resultado.tipo !== "atualizado") return responderNaoEncontrado(resposta, resultado.tipo);
    return serializarProduto(resultado.produto);
  });

  servidor.patch("/empresas/:empresaId/produtos/:produtoId/disponibilidade", { preHandler }, async (requisicao, resposta) => {
    const { usuarioId } = obterIdentidadeExigida(requisicao);
    const parametros = parametrosProdutoSchema.safeParse(requisicao.params);
    const entrada = alterarDisponibilidadeProdutoEntradaSchema.safeParse(requisicao.body);
    if (!parametros.success) return responderDadosInvalidos(resposta, "Produto inválido.");
    if (!entrada.success) return responderDadosInvalidos(resposta, entrada.error.issues[0]?.message);

    const { empresaId, produtoId } = parametros.data;
    const resultado = await alterarDisponibilidadeProduto(banco, usuarioId, empresaId, produtoId, entrada.data.disponibilidade);
    if (resultado.tipo !== "atualizado") return responderNaoEncontrado(resposta, resultado.tipo);
    return serializarProduto(resultado.produto);
  });
}
