import type { Banco } from "@jaa/banco";
import type { ErroApi } from "@jaa/contratos";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Autenticacao } from "../autenticacao.js";
import { autenticarIdentidade, type ContextoIdentidadeAutenticada } from "../casos-de-uso/autenticar-identidade.js";

declare module "fastify" {
  interface FastifyRequest {
    identidadeAutenticada: ContextoIdentidadeAutenticada | null;
  }
}

/**
 * preHandler para rotas que agem EM NOME de uma identidade (ex.: conversas e mensagens).
 * Sem sessão → 401; sessão sem identidade pessoal → 403. A identidade vem só da sessão.
 */
export function exigirIdentidadeAutenticada(dependencias: { autenticacao: Autenticacao; banco: Banco }) {
  return async (requisicao: FastifyRequest, resposta: FastifyReply) => {
    const resultado = await autenticarIdentidade(dependencias, requisicao.headers);

    if (!resultado.ok) {
      const erro: ErroApi =
        resultado.codigo === "NAO_AUTENTICADO"
          ? { codigo: "NAO_AUTENTICADO", mensagem: "Sessão ausente ou expirada." }
          : { codigo: "CADASTRO_INCOMPLETO", mensagem: "Conclua o cadastro para usar as conversas." };
      return resposta.code(resultado.codigo === "NAO_AUTENTICADO" ? 401 : 403).send(erro);
    }

    requisicao.identidadeAutenticada = resultado.contexto;
  };
}

export function obterIdentidadeExigida(requisicao: FastifyRequest): ContextoIdentidadeAutenticada {
  if (!requisicao.identidadeAutenticada) {
    throw new Error("Rota registrada sem o preHandler exigirIdentidadeAutenticada.");
  }

  return requisicao.identidadeAutenticada;
}
