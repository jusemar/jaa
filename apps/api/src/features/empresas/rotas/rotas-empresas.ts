import type { Banco } from "@jaa/banco";
import {
  atualizarEmpresaEntradaSchema,
  criarEmpresaEntradaSchema,
  type ErroApi,
  type ListaEmpresas,
} from "@jaa/contratos";
import type { FastifyInstance, FastifyReply } from "fastify";
import * as z from "zod";
import type { Autenticacao } from "../../autenticacao/autenticacao.js";
import { exigirIdentidadeAutenticada, obterIdentidadeExigida } from "../../autenticacao/lib/exigir-identidade-autenticada.js";
import { atualizarEmpresa } from "../casos-de-uso/atualizar-empresa.js";
import { criarEmpresa } from "../casos-de-uso/criar-empresa.js";
import { autorizarEmpresa } from "../lib/autorizacao-empresas.js";
import { serializarEmpresa } from "../lib/serializar-empresa.js";
import { buscarEmpresaDoUsuario, listarEmpresasDoUsuario } from "../repositorios/repositorio-empresas.js";

const parametrosEmpresaSchema = z.object({ empresaId: z.uuid() });

function responderDadosInvalidos(resposta: FastifyReply, mensagem: string | undefined) {
  const erro: ErroApi = { codigo: "DADOS_INVALIDOS", mensagem: mensagem ?? "Dados inválidos." };
  return resposta.code(400).send(erro);
}

// Inexistente ou sem vínculo: mesma resposta, nada é revelado sobre empresas de outras contas.
function responderEmpresaNaoEncontrada(resposta: FastifyReply) {
  const erro: ErroApi = { codigo: "EMPRESA_NAO_ENCONTRADA", mensagem: "Empresa não encontrada." };
  return resposta.code(404).send(erro);
}

function responderSlugIndisponivel(resposta: FastifyReply) {
  const erro: ErroApi = { codigo: "SLUG_INDISPONIVEL", mensagem: "Este endereço de loja não está disponível." };
  return resposta.code(409).send(erro);
}

/**
 * Empresas operadas pela CONTA da sessão. Exige cadastro completo (identidade pessoal), mas a empresa
 * nunca é vinculada à identidade pessoal: o vínculo é conta ↔ empresa (membros_empresa).
 */
export function registrarRotasEmpresas(servidor: FastifyInstance, dependencias: { banco: Banco; autenticacao: Autenticacao }) {
  const preHandler = exigirIdentidadeAutenticada(dependencias);

  servidor.post("/empresas", { preHandler }, async (requisicao, resposta) => {
    // Proprietário = conta da sessão. Qualquer dono/papel enviado no corpo é descartado pelo schema.
    const { usuarioId } = obterIdentidadeExigida(requisicao);
    const entrada = criarEmpresaEntradaSchema.safeParse(requisicao.body);
    if (!entrada.success) return responderDadosInvalidos(resposta, entrada.error.issues[0]?.message);

    const resultado = await criarEmpresa(dependencias.banco, usuarioId, entrada.data);
    switch (resultado.tipo) {
      case "criada":
        return resposta.code(201).send(serializarEmpresa(resultado.empresa));
      case "ja-existente":
        return resposta.code(200).send(serializarEmpresa(resultado.empresa));
      case "slug-indisponivel":
        return responderSlugIndisponivel(resposta);
      case "nome-usuario-indisponivel": {
        const erro: ErroApi = { codigo: "NOME_USUARIO_INDISPONIVEL", mensagem: "Este @usuario não está disponível." };
        return resposta.code(409).send(erro);
      }
    }
  });

  servidor.get("/empresas", { preHandler }, async (requisicao) => {
    const { usuarioId } = obterIdentidadeExigida(requisicao);
    const lista: ListaEmpresas = { empresas: (await listarEmpresasDoUsuario(dependencias.banco, usuarioId)).map(serializarEmpresa) };
    return lista;
  });

  servidor.get("/empresas/:empresaId", { preHandler }, async (requisicao, resposta) => {
    const { usuarioId } = obterIdentidadeExigida(requisicao);
    const parametros = parametrosEmpresaSchema.safeParse(requisicao.params);
    if (!parametros.success) return responderDadosInvalidos(resposta, "Empresa inválida.");

    const { empresaId } = parametros.data;
    if (!(await autorizarEmpresa(dependencias.banco, usuarioId, empresaId, "ver-empresa"))) return responderEmpresaNaoEncontrada(resposta);
    const empresa = await buscarEmpresaDoUsuario(dependencias.banco, usuarioId, empresaId);
    return empresa ? serializarEmpresa(empresa) : responderEmpresaNaoEncontrada(resposta);
  });

  servidor.patch("/empresas/:empresaId", { preHandler }, async (requisicao, resposta) => {
    const { usuarioId } = obterIdentidadeExigida(requisicao);
    const parametros = parametrosEmpresaSchema.safeParse(requisicao.params);
    const entrada = atualizarEmpresaEntradaSchema.safeParse(requisicao.body);
    if (!parametros.success) return responderDadosInvalidos(resposta, "Empresa inválida.");
    if (!entrada.success) return responderDadosInvalidos(resposta, entrada.error.issues[0]?.message);

    const resultado = await atualizarEmpresa(dependencias.banco, usuarioId, parametros.data.empresaId, entrada.data);
    switch (resultado.tipo) {
      case "empresa-nao-encontrada":
        return responderEmpresaNaoEncontrada(resposta);
      case "slug-indisponivel":
        return responderSlugIndisponivel(resposta);
      case "atualizada":
        return serializarEmpresa(resultado.empresa);
    }
  });
}
