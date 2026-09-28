import type { Banco } from "@jaa/banco";
import {
  TERMO_BUSCA_TAMANHO_MINIMO,
  localizarEnderecoPesquisaEntradaSchema,
  type ErroApi,
  type RespostaIntencoesProfissionais,
  type SugestaoLocalizacao,
} from "@jaa/contratos";
import type { FastifyInstance, FastifyReply } from "fastify";
import * as z from "zod";
import type { Autenticacao } from "../../autenticacao/autenticacao.js";
import { exigirIdentidadeAtuante, obterIdentidadeExigida } from "../../autenticacao/lib/exigir-identidade-autenticada.js";
import type { GeocodificadorEndereco } from "../../enderecos/lib/geocodificador.js";
import { buscarProfissionais, resolverIntencoesProfissionais } from "../casos-de-uso/buscar-profissionais.js";

function responder(resposta: FastifyReply, status: number, erro: ErroApi) {
  return resposta.code(status).send(erro);
}

/**
 * BUSCA DE PROFISSIONAIS para qualquer identidade autenticada (não exige empresa nem perfil
 * profissional). Quem pesquisa vem da SESSÃO; o local da pesquisa é só parâmetro da consulta e nada
 * aqui grava endereço, ponto ou "base". A própria pessoa nunca aparece no resultado.
 */
export function registrarRotasBuscaProfissionais(
  servidor: FastifyInstance,
  dependencias: { banco: Banco; autenticacao: Autenticacao; geocodificador: GeocodificadorEndereco },
) {
  const preHandler = exigirIdentidadeAtuante(dependencias);
  const { banco, geocodificador } = dependencias;

  // Texto → intenções estruturadas (dicionário de termos, nunca os perfis).
  servidor.get("/profissionais/intencoes", { preHandler }, async (requisicao) => {
    const consulta = z.object({ termo: z.string().max(80).optional() }).safeParse(requisicao.query);
    const termo = consulta.success ? (consulta.data.termo ?? "").trim() : "";
    const resposta: RespostaIntencoesProfissionais = {
      intencoes: termo.length < TERMO_BUSCA_TAMANHO_MINIMO || termo.startsWith("@") ? [] : await resolverIntencoesProfissionais(banco, termo),
    };
    return resposta;
  });

  servidor.get("/profissionais/busca", { preHandler }, async (requisicao, resposta) => {
    const { identidadePessoalId } = obterIdentidadeExigida(requisicao);
    const resultado = await buscarProfissionais(banco, identidadePessoalId, requisicao.query);
    if (resultado.tipo === "dados-invalidos") return responder(resposta, 400, { codigo: "DADOS_INVALIDOS", mensagem: resultado.mensagem });
    if (resultado.tipo === "intencao-invalida") return responder(resposta, 404, { codigo: "ATIVIDADE_NAO_ENCONTRADA", mensagem: "Atividade não encontrada." });
    return resultado.pagina;
  });

  // Endereço digitado → palpite para ABRIR o mapa. Não grava nada; o ponto só vale depois de confirmado.
  servidor.post("/profissionais/busca/localizar-endereco", { preHandler }, async (requisicao, resposta) => {
    const entrada = localizarEnderecoPesquisaEntradaSchema.safeParse(requisicao.body);
    if (!entrada.success) return responder(resposta, 400, { codigo: "DADOS_INVALIDOS", mensagem: entrada.error.issues[0]?.message ?? "Endereço inválido." });
    const sugestao: SugestaoLocalizacao = {
      disponivel: geocodificador.disponivel,
      coordenadas: geocodificador.disponivel ? await geocodificador.sugerir(entrada.data) : null,
    };
    return sugestao;
  });
}
