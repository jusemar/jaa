import { fromNodeHeaders } from "better-auth/node";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { ErroApi } from "@jaa/contratos";
import {
  CABECALHO_IP_CLIENTE,
  CAMINHO_BASE_AUTENTICACAO,
  type Autenticacao,
} from "../autenticacao.js";

// Cabeçalhos que não podem ser repassados: descrevem o corpo original, que é serializado de novo.
const CABECALHOS_DO_CORPO_ORIGINAL = ["content-length", "transfer-encoding"];

/**
 * Encaminha uma requisição do Jaa para um endpoint do Better Auth, preservando status, cabeçalhos e
 * cookies de sessão.
 *
 * Existe para que rotas próprias do Jaa (como "entrar com telefone OU @usuario") possam PREPARAR o
 * corpo e deixar a AUTENTICAÇÃO com o Better Auth. Não há sistema paralelo de login: a sessão, o
 * cookie e o hash de senha continuam sendo os dele.
 */
export async function encaminharParaBetterAuth(
  { autenticacao, urlBase }: { autenticacao: Autenticacao; urlBase: string },
  requisicao: FastifyRequest,
  resposta: FastifyReply,
  caminho: string,
  corpo: unknown,
  erroDeAutenticacao?: ErroApi,
) {
  const url = new URL(`${CAMINHO_BASE_AUTENTICACAO}${caminho}`, urlBase);
  const cabecalhos = fromNodeHeaders(requisicao.headers);
  for (const nome of CABECALHOS_DO_CORPO_ORIGINAL) cabecalhos.delete(nome);
  cabecalhos.set("content-type", "application/json");
  // O IP do rate limit é o que o Fastify resolveu, nunca o que o cliente mandou.
  cabecalhos.set(CABECALHO_IP_CLIENTE, requisicao.ip);

  const respostaAutenticacao = await autenticacao.handler(
    new Request(url, {
      method: "POST",
      headers: cabecalhos,
      body: JSON.stringify(corpo),
    }),
  );

  if (erroDeAutenticacao && respostaAutenticacao.status === 401) {
    return resposta.code(401).send(erroDeAutenticacao);
  }

  resposta.status(respostaAutenticacao.status);
  respostaAutenticacao.headers.forEach((valor, nome) => {
    if (nome !== "set-cookie") resposta.header(nome, valor);
  });
  const cookies = respostaAutenticacao.headers.getSetCookie();
  if (cookies.length > 0) resposta.header("set-cookie", cookies);

  return resposta.send(
    respostaAutenticacao.body ? await respostaAutenticacao.text() : null,
  );
}
