import type { Banco } from "@jaa/banco";
import {
  atualizarGrupoOpcoesEntradaSchema,
  atualizarOpcaoEntradaSchema,
  criarGrupoOpcoesEntradaSchema,
  criarOpcaoEntradaSchema,
  definirOpcoesDoDiaEntradaSchema,
  definirProgramacaoSemanalEntradaSchema,
  diaDaProgramacaoSchema,
  MAXIMO_GRUPOS_POR_PRODUTO,
  MAXIMO_OPCOES_POR_GRUPO,
  type ErroApi,
  type ListaGruposOpcoes,
  type ProgramacaoSemanalGrupo,
} from "@jaa/contratos";
import type { FastifyInstance, FastifyReply } from "fastify";
import * as z from "zod";
import type { Autenticacao } from "../../autenticacao/autenticacao.js";
import { exigirIdentidadeAutenticada, obterIdentidadeExigida } from "../../autenticacao/lib/exigir-identidade-autenticada.js";
import {
  atualizarGrupoOpcoes,
  atualizarOpcaoDoGrupo,
  consultarProgramacaoSemanal,
  criarGrupoOpcoes,
  criarOpcao,
  definirOpcoesDoDiaDoGrupo,
  definirProgramacaoSemanal,
  excluirGrupoOpcoes,
  excluirOpcaoDoGrupo,
  listarGruposAdministrados,
} from "../casos-de-uso/administrar-personalizacao.js";
import { serializarGrupoOpcoes } from "../lib/serializar-personalizacao.js";
import { listarGruposDoProduto } from "../repositorios/repositorio-personalizacao.js";

const parametrosProdutoSchema = z.object({ empresaId: z.uuid(), produtoId: z.uuid() });
const parametrosGrupoSchema = parametrosProdutoSchema.extend({ grupoId: z.uuid() });
const parametrosOpcaoSchema = parametrosGrupoSchema.extend({ opcaoId: z.uuid() });
// O dia vem no endereço como texto ("2"): só 1..7 (segunda … domingo) é aceito.
const parametrosDiaSchema = parametrosGrupoSchema.extend({ dia: z.coerce.number().pipe(diaDaProgramacaoSchema) });

function responderDadosInvalidos(resposta: FastifyReply, mensagem: string | undefined) {
  const erro: ErroApi = { codigo: "DADOS_INVALIDOS", mensagem: mensagem ?? "Dados inválidos." };
  return resposta.code(400).send(erro);
}

type Recusa = "empresa-nao-encontrada" | "produto-nao-encontrado" | "grupo-nao-encontrado" | "opcao-nao-encontrada" | "limite-de-grupos" | "limite-de-opcoes";

// Sem acesso e inexistente são indistinguíveis (404): a resposta não revela o que existe.
function responderRecusa(resposta: FastifyReply, tipo: Recusa) {
  const erros: Record<Recusa, { status: number; erro: ErroApi }> = {
    "empresa-nao-encontrada": { status: 404, erro: { codigo: "EMPRESA_NAO_ENCONTRADA", mensagem: "Empresa não encontrada." } },
    "produto-nao-encontrado": { status: 404, erro: { codigo: "PRODUTO_NAO_ENCONTRADO", mensagem: "Produto não encontrado." } },
    "grupo-nao-encontrado": { status: 404, erro: { codigo: "GRUPO_OPCOES_NAO_ENCONTRADO", mensagem: "Grupo de opções não encontrado." } },
    "opcao-nao-encontrada": { status: 404, erro: { codigo: "OPCAO_NAO_ENCONTRADA", mensagem: "Opção não encontrada." } },
    "limite-de-grupos": {
      status: 409,
      erro: { codigo: "LIMITE_DE_GRUPOS_ATINGIDO", mensagem: `Um produto pode ter no máximo ${MAXIMO_GRUPOS_POR_PRODUTO} grupos de opções.` },
    },
    "limite-de-opcoes": {
      status: 409,
      erro: { codigo: "LIMITE_DE_OPCOES_ATINGIDO", mensagem: `Um grupo pode ter no máximo ${MAXIMO_OPCOES_POR_GRUPO} opções.` },
    },
  };
  const { status, erro } = erros[tipo];
  return resposta.code(status).send(erro);
}

/**
 * API ADMINISTRATIVA da PERSONALIZAÇÃO do produto (grupos de opções e opções).
 *
 * Fica sob `/empresas/:empresaId/produtos/:produtoId/...` de propósito: personalização é dado
 * comercial DO PRODUTO, não um domínio paralelo. A consulta do cliente continua em `/publico/...`,
 * com contrato próprio e só o que é público.
 *
 * Toda rota devolve a lista COMPLETA de grupos do produto depois de alterar: a tela de administração
 * precisa da ordem e das opções atualizadas, e isso evita uma segunda requisição a cada passo.
 */
export function registrarRotasPersonalizacao(servidor: FastifyInstance, dependencias: { banco: Banco; autenticacao: Autenticacao }) {
  const preHandler = exigirIdentidadeAutenticada(dependencias);
  const { banco } = dependencias;

  const lista = async (empresaId: string, produtoId: string): Promise<ListaGruposOpcoes> => ({
    grupos: (await listarGruposDoProduto(banco, empresaId, produtoId)).map(serializarGrupoOpcoes),
  });

  servidor.get("/empresas/:empresaId/produtos/:produtoId/grupos-opcoes", { preHandler }, async (requisicao, resposta) => {
    const { usuarioId } = obterIdentidadeExigida(requisicao);
    const parametros = parametrosProdutoSchema.safeParse(requisicao.params);
    if (!parametros.success) return responderDadosInvalidos(resposta, "Produto inválido.");

    const resultado = await listarGruposAdministrados(banco, usuarioId, parametros.data.empresaId, parametros.data.produtoId);
    if (resultado.tipo !== "lista") return responderRecusa(resposta, resultado.tipo);
    const corpo: ListaGruposOpcoes = { grupos: resultado.grupos.map(serializarGrupoOpcoes) };
    return corpo;
  });

  servidor.post("/empresas/:empresaId/produtos/:produtoId/grupos-opcoes", { preHandler }, async (requisicao, resposta) => {
    const { usuarioId } = obterIdentidadeExigida(requisicao);
    const parametros = parametrosProdutoSchema.safeParse(requisicao.params);
    const entrada = criarGrupoOpcoesEntradaSchema.safeParse(requisicao.body);
    if (!parametros.success) return responderDadosInvalidos(resposta, "Produto inválido.");
    if (!entrada.success) return responderDadosInvalidos(resposta, entrada.error.issues[0]?.message);

    const resultado = await criarGrupoOpcoes(banco, usuarioId, parametros.data.empresaId, parametros.data.produtoId, entrada.data);
    if (resultado.tipo !== "criado") return responderRecusa(resposta, resultado.tipo);
    return resposta.code(201).send(await lista(parametros.data.empresaId, parametros.data.produtoId));
  });

  servidor.patch("/empresas/:empresaId/produtos/:produtoId/grupos-opcoes/:grupoId", { preHandler }, async (requisicao, resposta) => {
    const { usuarioId } = obterIdentidadeExigida(requisicao);
    const parametros = parametrosGrupoSchema.safeParse(requisicao.params);
    const entrada = atualizarGrupoOpcoesEntradaSchema.safeParse(requisicao.body);
    if (!parametros.success) return responderDadosInvalidos(resposta, "Grupo inválido.");
    if (!entrada.success) return responderDadosInvalidos(resposta, entrada.error.issues[0]?.message);

    const { empresaId, produtoId, grupoId } = parametros.data;
    const resultado = await atualizarGrupoOpcoes(banco, usuarioId, empresaId, produtoId, grupoId, entrada.data);
    if (resultado.tipo !== "atualizado") return responderRecusa(resposta, resultado.tipo);
    return lista(empresaId, produtoId);
  });

  servidor.delete("/empresas/:empresaId/produtos/:produtoId/grupos-opcoes/:grupoId", { preHandler }, async (requisicao, resposta) => {
    const { usuarioId } = obterIdentidadeExigida(requisicao);
    const parametros = parametrosGrupoSchema.safeParse(requisicao.params);
    if (!parametros.success) return responderDadosInvalidos(resposta, "Grupo inválido.");

    const { empresaId, produtoId, grupoId } = parametros.data;
    const resultado = await excluirGrupoOpcoes(banco, usuarioId, empresaId, produtoId, grupoId);
    if (resultado.tipo !== "excluido") return responderRecusa(resposta, resultado.tipo);
    return lista(empresaId, produtoId);
  });

  servidor.post("/empresas/:empresaId/produtos/:produtoId/grupos-opcoes/:grupoId/opcoes", { preHandler }, async (requisicao, resposta) => {
    const { usuarioId } = obterIdentidadeExigida(requisicao);
    const parametros = parametrosGrupoSchema.safeParse(requisicao.params);
    const entrada = criarOpcaoEntradaSchema.safeParse(requisicao.body);
    if (!parametros.success) return responderDadosInvalidos(resposta, "Grupo inválido.");
    if (!entrada.success) return responderDadosInvalidos(resposta, entrada.error.issues[0]?.message);

    const { empresaId, produtoId, grupoId } = parametros.data;
    const resultado = await criarOpcao(banco, usuarioId, empresaId, produtoId, grupoId, entrada.data);
    if (resultado.tipo !== "criada") return responderRecusa(resposta, resultado.tipo);
    return resposta.code(201).send(await lista(empresaId, produtoId));
  });

  servidor.patch("/empresas/:empresaId/produtos/:produtoId/grupos-opcoes/:grupoId/opcoes/:opcaoId", { preHandler }, async (requisicao, resposta) => {
    const { usuarioId } = obterIdentidadeExigida(requisicao);
    const parametros = parametrosOpcaoSchema.safeParse(requisicao.params);
    const entrada = atualizarOpcaoEntradaSchema.safeParse(requisicao.body);
    if (!parametros.success) return responderDadosInvalidos(resposta, "Opção inválida.");
    if (!entrada.success) return responderDadosInvalidos(resposta, entrada.error.issues[0]?.message);

    const { empresaId, produtoId, grupoId, opcaoId } = parametros.data;
    const resultado = await atualizarOpcaoDoGrupo(banco, usuarioId, empresaId, produtoId, grupoId, opcaoId, entrada.data);
    if (resultado.tipo !== "atualizada") return responderRecusa(resposta, resultado.tipo);
    return lista(empresaId, produtoId);
  });

  servidor.delete("/empresas/:empresaId/produtos/:produtoId/grupos-opcoes/:grupoId/opcoes/:opcaoId", { preHandler }, async (requisicao, resposta) => {
    const { usuarioId } = obterIdentidadeExigida(requisicao);
    const parametros = parametrosOpcaoSchema.safeParse(requisicao.params);
    if (!parametros.success) return responderDadosInvalidos(resposta, "Opção inválida.");

    const { empresaId, produtoId, grupoId, opcaoId } = parametros.data;
    const resultado = await excluirOpcaoDoGrupo(banco, usuarioId, empresaId, produtoId, grupoId, opcaoId);
    if (resultado.tipo !== "excluida") return responderRecusa(resposta, resultado.tipo);
    return lista(empresaId, produtoId);
  });

  /*
   * PROGRAMAÇÃO SEMANAL do grupo (quais opções valem em cada dia). Fica sob o grupo porque é dele:
   * o cadastro de opções continua um só — estas rotas apenas dizem em que dias cada opção aparece.
   * Todas devolvem a programação completa (sete dias) depois de alterar.
   */
  const rotaProgramacao = "/empresas/:empresaId/produtos/:produtoId/grupos-opcoes/:grupoId/programacao";

  servidor.get(rotaProgramacao, { preHandler }, async (requisicao, resposta) => {
    const { usuarioId } = obterIdentidadeExigida(requisicao);
    const parametros = parametrosGrupoSchema.safeParse(requisicao.params);
    if (!parametros.success) return responderDadosInvalidos(resposta, "Grupo inválido.");

    const { empresaId, produtoId, grupoId } = parametros.data;
    const resultado = await consultarProgramacaoSemanal(banco, usuarioId, empresaId, produtoId, grupoId);
    if (resultado.tipo !== "programacao") return responderRecusa(resposta, resultado.tipo);
    const corpo: ProgramacaoSemanalGrupo = resultado.programacao;
    return corpo;
  });

  // Liga/desliga. Ligar pela 1ª vez preenche a semana; desligar não apaga; religar retoma.
  servidor.put(rotaProgramacao, { preHandler }, async (requisicao, resposta) => {
    const { usuarioId } = obterIdentidadeExigida(requisicao);
    const parametros = parametrosGrupoSchema.safeParse(requisicao.params);
    const entrada = definirProgramacaoSemanalEntradaSchema.safeParse(requisicao.body);
    if (!parametros.success) return responderDadosInvalidos(resposta, "Grupo inválido.");
    if (!entrada.success) return responderDadosInvalidos(resposta, "Informe se a programação semanal fica ligada ou desligada.");

    const { empresaId, produtoId, grupoId } = parametros.data;
    const resultado = await definirProgramacaoSemanal(banco, usuarioId, empresaId, produtoId, grupoId, entrada.data.programacaoSemanal);
    if (resultado.tipo !== "programacao") return responderRecusa(resposta, resultado.tipo);
    const corpo: ProgramacaoSemanalGrupo = resultado.programacao;
    return corpo;
  });

  // Substitui as opções de UM dia (1 = segunda … 7 = domingo); os outros dias não mudam.
  servidor.put(`${rotaProgramacao}/dias/:dia`, { preHandler }, async (requisicao, resposta) => {
    const { usuarioId } = obterIdentidadeExigida(requisicao);
    const parametros = parametrosDiaSchema.safeParse(requisicao.params);
    const entrada = definirOpcoesDoDiaEntradaSchema.safeParse(requisicao.body);
    if (!parametros.success) return responderDadosInvalidos(resposta, "Dia inválido: use de 1 (segunda) a 7 (domingo).");
    if (!entrada.success) return responderDadosInvalidos(resposta, entrada.error.issues[0]?.message);

    const { empresaId, produtoId, grupoId, dia } = parametros.data;
    const resultado = await definirOpcoesDoDiaDoGrupo(banco, usuarioId, empresaId, produtoId, grupoId, dia, entrada.data.opcaoIds);
    if (resultado.tipo !== "programacao") return responderRecusa(resposta, resultado.tipo);
    const corpo: ProgramacaoSemanalGrupo = resultado.programacao;
    return corpo;
  });
}
