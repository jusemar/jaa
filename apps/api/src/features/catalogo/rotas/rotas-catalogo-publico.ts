import type { Banco } from "@jaa/banco";
import {
  buscarEmpresasPublicasConsultaSchema,
  type CatalogoPublico,
  type ErroApi,
  type ListaEmpresasPublicas,
  type ProdutoPublicoDetalhe,
} from "@jaa/contratos";
import type { FastifyInstance, FastifyReply } from "fastify";
import * as z from "zod";
import type { Autenticacao } from "../../autenticacao/autenticacao.js";
import { exigirIdentidadeAutenticada } from "../../autenticacao/lib/exigir-identidade-autenticada.js";
import { consultarCatalogo, consultarProdutoDoCatalogo } from "../casos-de-uso/consultar-catalogo.js";
import { serializarEmpresaPublica, serializarProdutoPublico } from "../lib/serializar-catalogo.js";
import { buscarEmpresasPublicas } from "../repositorios/repositorio-empresas-publicas.js";

const parametrosEmpresaSchema = z.object({ identidadeId: z.uuid() });
const parametrosProdutoSchema = z.object({ identidadeId: z.uuid(), produtoId: z.uuid() });

function responder404(resposta: FastifyReply, tipo: "empresa-nao-encontrada" | "produto-nao-encontrado") {
  const erro: ErroApi =
    tipo === "empresa-nao-encontrada"
      ? { codigo: "EMPRESA_NAO_ENCONTRADA", mensagem: "Empresa não encontrada." }
      : { codigo: "PRODUTO_NAO_ENCONTRADO", mensagem: "Produto não encontrado." };
  return resposta.code(404).send(erro);
}

function responderDadosInvalidos(resposta: FastifyReply) {
  const erro: ErroApi = { codigo: "DADOS_INVALIDOS", mensagem: "Dados inválidos." };
  return resposta.code(400).send(erro);
}

/**
 * API de CONSUMO (cliente), separada da administrativa (/empresas/:empresaId/produtos):
 * - `/publico/...`: catálogo sem autenticação (dados públicos, empresa ativa, só disponíveis);
 * - `/descoberta/empresas`: busca TÉCNICA temporária, autenticada, até existir o "Encontrar".
 * Pendente antes de abrir ao público: rate limit específico e cache.
 */
export function registrarRotasCatalogoPublico(servidor: FastifyInstance, dependencias: { banco: Banco; autenticacao: Autenticacao }) {
  const { banco } = dependencias;

  servidor.get("/publico/empresas/:identidadeId/catalogo", async (requisicao, resposta) => {
    const parametros = parametrosEmpresaSchema.safeParse(requisicao.params);
    if (!parametros.success) return responderDadosInvalidos(resposta);

    const resultado = await consultarCatalogo(banco, parametros.data.identidadeId);
    if (resultado.tipo !== "catalogo") return responder404(resposta, resultado.tipo);
    const catalogo: CatalogoPublico = { empresa: serializarEmpresaPublica(resultado.empresa), produtos: resultado.produtos.map(serializarProdutoPublico) };
    return catalogo;
  });

  servidor.get("/publico/empresas/:identidadeId/catalogo/produtos/:produtoId", async (requisicao, resposta) => {
    const parametros = parametrosProdutoSchema.safeParse(requisicao.params);
    if (!parametros.success) return responderDadosInvalidos(resposta);

    const resultado = await consultarProdutoDoCatalogo(banco, parametros.data.identidadeId, parametros.data.produtoId);
    if (resultado.tipo !== "produto") return responder404(resposta, resultado.tipo);
    const detalhe: ProdutoPublicoDetalhe = { empresa: serializarEmpresaPublica(resultado.empresa), produto: serializarProdutoPublico(resultado.produto) };
    return detalhe;
  });

  servidor.get("/descoberta/empresas", { preHandler: exigirIdentidadeAutenticada(dependencias) }, async (requisicao, resposta) => {
    const consulta = buscarEmpresasPublicasConsultaSchema.safeParse(requisicao.query);
    if (!consulta.success) return responderDadosInvalidos(resposta);
    const lista: ListaEmpresasPublicas = { empresas: (await buscarEmpresasPublicas(banco, consulta.data.busca || undefined)).map(serializarEmpresaPublica) };
    return lista;
  });
}
