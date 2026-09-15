import { fromNodeHeaders } from "better-auth/node";
import type { FastifyInstance } from "fastify";
import { CABECALHO_IP_CLIENTE, CAMINHO_BASE_AUTENTICACAO, type Autenticacao } from "../autenticacao.js";

// Cabeçalhos que não podem ser repassados: descrevem o corpo original, que é serializado de novo.
const CABECALHOS_DO_CORPO_ORIGINAL = ["content-length", "transfer-encoding"];

/**
 * Ponte oficial Fastify → Better Auth: converte a requisição para a Fetch API,
 * delega ao handler do Better Auth e devolve status, cabeçalhos e cookies.
 */
export function registrarRotasBetterAuth(
  servidor: FastifyInstance,
  autenticacao: Autenticacao,
  urlBase: string,
) {
  servidor.route({
    method: ["GET", "POST"],
    url: `${CAMINHO_BASE_AUTENTICACAO}/*`,
    async handler(requisicao, resposta) {
      // URL montada a partir da configuração, nunca do cabeçalho Host enviado pelo cliente.
      const url = new URL(requisicao.url, urlBase);
      const cabecalhos = fromNodeHeaders(requisicao.headers);

      for (const nome of CABECALHOS_DO_CORPO_ORIGINAL) {
        cabecalhos.delete(nome);
      }

      // Substitui qualquer valor enviado pelo cliente: o IP usado no rate limit
      // é o que o Fastify resolveu (respeitando `trustProxy` quando configurado).
      cabecalhos.set(CABECALHO_IP_CLIENTE, requisicao.ip);

      const respostaAutenticacao = await autenticacao.handler(
        new Request(url, {
          method: requisicao.method,
          headers: cabecalhos,
          body: requisicao.body === undefined ? undefined : JSON.stringify(requisicao.body),
        }),
      );

      resposta.status(respostaAutenticacao.status);

      respostaAutenticacao.headers.forEach((valor, nome) => {
        if (nome !== "set-cookie") {
          resposta.header(nome, valor);
        }
      });

      const cookies = respostaAutenticacao.headers.getSetCookie();
      if (cookies.length > 0) {
        resposta.header("set-cookie", cookies);
      }

      return resposta.send(respostaAutenticacao.body ? await respostaAutenticacao.text() : null);
    },
  });
}
