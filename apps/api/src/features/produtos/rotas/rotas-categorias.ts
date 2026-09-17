import type { Banco } from "@jaa/banco";
import { atualizarCategoriaEntradaSchema, criarCategoriaEntradaSchema, type CategoriaProduto, type ErroApi, type ListaCategorias } from "@jaa/contratos";
import type { FastifyInstance, FastifyReply } from "fastify";
import * as z from "zod";
import type { Autenticacao } from "../../autenticacao/autenticacao.js";
import { exigirIdentidadeAutenticada, obterIdentidadeExigida } from "../../autenticacao/lib/exigir-identidade-autenticada.js";
import { criarCategoria, editarCategoria, excluirCategoria, listarCategoriasDaEmpresa } from "../casos-de-uso/administrar-categorias.js";
import type { CategoriaRegistro } from "../repositorios/repositorio-categorias.js";

const parametrosEmpresaSchema = z.object({ empresaId: z.uuid() });
const parametrosCategoriaSchema = z.object({ empresaId: z.uuid(), categoriaId: z.uuid() });

function responder(resposta: FastifyReply, status: number, erro: ErroApi) {
  return resposta.code(status).send(erro);
}

function responderResultado(resposta: FastifyReply, tipo: "empresa-nao-encontrada" | "categoria-nao-encontrada" | "nome-em-uso") {
  if (tipo === "nome-em-uso") return responder(resposta, 409, { codigo: "CATEGORIA_NOME_EM_USO", mensagem: "Já existe uma categoria com esse nome." });
  if (tipo === "categoria-nao-encontrada") return responder(resposta, 404, { codigo: "CATEGORIA_NAO_ENCONTRADA", mensagem: "Categoria não encontrada." });
  return responder(resposta, 404, { codigo: "EMPRESA_NAO_ENCONTRADA", mensagem: "Empresa não encontrada." });
}

const serializar = (categoria: CategoriaRegistro, produtos = 0): CategoriaProduto => ({
  id: categoria.id,
  nome: categoria.nome,
  posicao: categoria.posicao,
  produtos,
});

/** Categorias do catálogo da empresa. Sempre por empresa: não existe categoria global no Jaa. */
export function registrarRotasCategorias(servidor: FastifyInstance, dependencias: { banco: Banco; autenticacao: Autenticacao }) {
  const preHandler = exigirIdentidadeAutenticada(dependencias);
  const { banco } = dependencias;

  servidor.get("/empresas/:empresaId/categorias", { preHandler }, async (requisicao, resposta) => {
    const { usuarioId } = obterIdentidadeExigida(requisicao);
    const parametros = parametrosEmpresaSchema.safeParse(requisicao.params);
    if (!parametros.success) return responder(resposta, 400, { codigo: "DADOS_INVALIDOS", mensagem: "Empresa inválida." });

    const resultado = await listarCategoriasDaEmpresa(banco, usuarioId, parametros.data.empresaId);
    if (resultado.tipo !== "lista") return responderResultado(resposta, resultado.tipo);
    const lista: ListaCategorias = { categorias: resultado.categorias.map((categoria) => serializar(categoria, categoria.produtos)) };
    return lista;
  });

  servidor.post("/empresas/:empresaId/categorias", { preHandler }, async (requisicao, resposta) => {
    const { usuarioId } = obterIdentidadeExigida(requisicao);
    const parametros = parametrosEmpresaSchema.safeParse(requisicao.params);
    const entrada = criarCategoriaEntradaSchema.safeParse(requisicao.body);
    if (!parametros.success) return responder(resposta, 400, { codigo: "DADOS_INVALIDOS", mensagem: "Empresa inválida." });
    if (!entrada.success) return responder(resposta, 400, { codigo: "DADOS_INVALIDOS", mensagem: entrada.error.issues[0]?.message ?? "Dados inválidos." });

    const resultado = await criarCategoria(banco, usuarioId, parametros.data.empresaId, entrada.data);
    if (resultado.tipo !== "criada") return responderResultado(resposta, resultado.tipo);
    return resposta.code(201).send(serializar(resultado.categoria));
  });

  servidor.patch("/empresas/:empresaId/categorias/:categoriaId", { preHandler }, async (requisicao, resposta) => {
    const { usuarioId } = obterIdentidadeExigida(requisicao);
    const parametros = parametrosCategoriaSchema.safeParse(requisicao.params);
    const entrada = atualizarCategoriaEntradaSchema.safeParse(requisicao.body);
    if (!parametros.success) return responder(resposta, 400, { codigo: "DADOS_INVALIDOS", mensagem: "Categoria inválida." });
    if (!entrada.success) return responder(resposta, 400, { codigo: "DADOS_INVALIDOS", mensagem: entrada.error.issues[0]?.message ?? "Dados inválidos." });

    const { empresaId, categoriaId } = parametros.data;
    const resultado = await editarCategoria(banco, usuarioId, empresaId, categoriaId, entrada.data);
    if (resultado.tipo !== "atualizada") return responderResultado(resposta, resultado.tipo);
    return serializar(resultado.categoria);
  });

  /** Apagar organiza, não destrói: os produtos da categoria voltam para "Sem categoria". */
  servidor.delete("/empresas/:empresaId/categorias/:categoriaId", { preHandler }, async (requisicao, resposta) => {
    const { usuarioId } = obterIdentidadeExigida(requisicao);
    const parametros = parametrosCategoriaSchema.safeParse(requisicao.params);
    if (!parametros.success) return responder(resposta, 400, { codigo: "DADOS_INVALIDOS", mensagem: "Categoria inválida." });

    const { empresaId, categoriaId } = parametros.data;
    const resultado = await excluirCategoria(banco, usuarioId, empresaId, categoriaId);
    if (resultado.tipo !== "removida") return responderResultado(resposta, resultado.tipo);
    return { removida: true };
  });
}
