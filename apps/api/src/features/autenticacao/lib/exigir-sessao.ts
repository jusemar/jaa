import type { ErroApi } from "@jaa/contratos";
import { fromNodeHeaders } from "better-auth/node";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Autenticacao } from "../autenticacao.js";

export type SessaoAutenticada = NonNullable<Awaited<ReturnType<Autenticacao["api"]["getSession"]>>>;

declare module "fastify" {
  interface FastifyRequest {
    sessao: SessaoAutenticada | null;
  }
}

/**
 * preHandler que valida a sessão NO SERVIDOR (cookie → Better Auth → banco).
 * Sem sessão válida responde 401 e a rota não é executada.
 */
export function exigirSessao(autenticacao: Autenticacao) {
  return async (requisicao: FastifyRequest, resposta: FastifyReply) => {
    const sessao = await autenticacao.api.getSession({
      headers: fromNodeHeaders(requisicao.headers),
    });

    if (!sessao) {
      const erro: ErroApi = { codigo: "NAO_AUTENTICADO", mensagem: "Sessão ausente ou expirada." };
      return resposta.code(401).send(erro);
    }

    requisicao.sessao = sessao;
  };
}

// Para uso dentro de rotas protegidas por exigirSessao.
export function obterSessaoExigida(requisicao: FastifyRequest): SessaoAutenticada {
  if (!requisicao.sessao) {
    throw new Error("Rota protegida registrada sem o preHandler exigirSessao.");
  }

  return requisicao.sessao;
}
