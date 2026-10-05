import type { Banco } from "@jaa/banco";
import { definirFuncionamentoEntradaSchema, type ErroApi } from "@jaa/contratos";
import type { FastifyInstance, FastifyReply } from "fastify";
import * as z from "zod";
import type { Autenticacao } from "../../autenticacao/autenticacao.js";
import { exigirIdentidadeAutenticada, obterIdentidadeExigida } from "../../autenticacao/lib/exigir-identidade-autenticada.js";
import { buscarEmpresaPublicaPorIdentidade } from "../../catalogo/repositorios/repositorio-empresas-publicas.js";
import { consultarFuncionamentoDaEmpresa, consultarFuncionamentoPublico, definirFuncionamento } from "../casos-de-uso/funcionamento.js";
import { autorizarEmpresa } from "../lib/autorizacao-empresas.js";

const parametrosEmpresaSchema = z.object({ empresaId: z.uuid() });
const parametrosIdentidadeSchema = z.object({ identidadeId: z.uuid() });

// Inexistente ou sem vínculo: mesma resposta, nada é revelado sobre empresas de outras contas.
function responderEmpresaNaoEncontrada(resposta: FastifyReply) {
  const erro: ErroApi = { codigo: "EMPRESA_NAO_ENCONTRADA", mensagem: "Empresa não encontrada." };
  return resposta.code(404).send(erro);
}

function responderDadosInvalidos(resposta: FastifyReply, mensagem?: string) {
  const erro: ErroApi = { codigo: "DADOS_INVALIDOS", mensagem: mensagem ?? "Dados inválidos." };
  return resposta.code(400).send(erro);
}

/**
 * HORÁRIO DE FUNCIONAMENTO.
 *  - gestor: lê e substitui a semana da PRÓPRIA empresa (`ver-empresa` / `editar-empresa`);
 *  - cliente: lê, sem sessão, se a empresa está aberta agora — a mesma informação que acompanha o
 *    cardápio, numa consulta leve para a tela se atualizar sem recarregar o catálogo.
 */
export function registrarRotasFuncionamento(
  servidor: FastifyInstance,
  dependencias: { banco: Banco; autenticacao: Autenticacao; agora?: () => Date },
) {
  const { banco } = dependencias;
  // Relógio do SERVIDOR. Parâmetro só para o teste fixar o instante; nunca vem do cliente.
  const agora = dependencias.agora ?? (() => new Date());
  const preHandler = exigirIdentidadeAutenticada(dependencias);

  servidor.get("/empresas/:empresaId/funcionamento", { preHandler }, async (requisicao, resposta) => {
    const { usuarioId } = obterIdentidadeExigida(requisicao);
    const parametros = parametrosEmpresaSchema.safeParse(requisicao.params);
    if (!parametros.success) return responderDadosInvalidos(resposta, "Empresa inválida.");
    if (!(await autorizarEmpresa(banco, usuarioId, parametros.data.empresaId, "ver-empresa"))) return responderEmpresaNaoEncontrada(resposta);

    const funcionamento = await consultarFuncionamentoDaEmpresa(banco, parametros.data.empresaId, agora());
    return funcionamento ?? responderEmpresaNaoEncontrada(resposta);
  });

  servidor.put("/empresas/:empresaId/funcionamento", { preHandler }, async (requisicao, resposta) => {
    const { usuarioId } = obterIdentidadeExigida(requisicao);
    const parametros = parametrosEmpresaSchema.safeParse(requisicao.params);
    if (!parametros.success) return responderDadosInvalidos(resposta, "Empresa inválida.");
    // A empresa vem da rota e do vínculo da conta: `empresaId` ou fuso no corpo são descartados pelo schema.
    if (!(await autorizarEmpresa(banco, usuarioId, parametros.data.empresaId, "editar-empresa"))) return responderEmpresaNaoEncontrada(resposta);
    const entrada = definirFuncionamentoEntradaSchema.safeParse(requisicao.body);
    if (!entrada.success) return responderDadosInvalidos(resposta, entrada.error.issues[0]?.message);

    const funcionamento = await definirFuncionamento(banco, parametros.data.empresaId, entrada.data, agora());
    return funcionamento ?? responderEmpresaNaoEncontrada(resposta);
  });

  servidor.get("/publico/empresas/:identidadeId/funcionamento", async (requisicao, resposta) => {
    const parametros = parametrosIdentidadeSchema.safeParse(requisicao.params);
    if (!parametros.success) return responderDadosInvalidos(resposta);
    const empresa = await buscarEmpresaPublicaPorIdentidade(banco, parametros.data.identidadeId);
    const funcionamento = empresa ? await consultarFuncionamentoPublico(banco, empresa.empresaId, agora()) : null;
    return funcionamento ?? responderEmpresaNaoEncontrada(resposta);
  });
}
