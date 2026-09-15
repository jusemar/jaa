import type { FastifyInstance } from "fastify";
import type { Autenticacao } from "../autenticacao.js";
import { exigirSessao, obterSessaoExigida } from "../lib/exigir-sessao.js";

// Rota técnica temporária para comprovar a validação de sessão no servidor.
export function registrarRotaTesteProtegido(servidor: FastifyInstance, autenticacao: Autenticacao) {
  servidor.get(
    "/autenticacao/teste-protegido",
    { preHandler: exigirSessao(autenticacao) },
    async (requisicao) => {
      const { session } = obterSessaoExigida(requisicao);

      return {
        autenticado: true,
        sessaoExpiraEm: session.expiresAt.toISOString(),
      };
    },
  );
}
