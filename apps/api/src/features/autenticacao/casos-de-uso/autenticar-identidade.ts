import type { IncomingHttpHeaders } from "node:http";
import type { Banco } from "@jaa/banco";
import { fromNodeHeaders } from "better-auth/node";
import { buscarIdentidadePessoalDoUsuario } from "../../identidades/repositorios/repositorio-identidades.js";
import type { Autenticacao } from "../autenticacao.js";

// Quem está agindo, determinado exclusivamente pelo servidor.
export interface ContextoIdentidadeAutenticada {
  readonly usuarioId: string;
  readonly identidadeId: string;
  // Id da sessão no Better Auth (não é o token): usado para encerrar só as conexões desta sessão.
  readonly sessaoId: string;
}

type ResultadoAutenticacaoIdentidade =
  | { ok: true; contexto: ContextoIdentidadeAutenticada }
  | { ok: false; codigo: "NAO_AUTENTICADO" | "CADASTRO_INCOMPLETO" };

/**
 * Valida a sessão (cookie → Better Auth → banco) e exige identidade pessoal: sem ela não há
 * remetente no Jaa. Usado igualmente pelo handshake realtime e pelas rotas HTTP de conversas.
 * Independe de Fastify e Socket.IO: recebe apenas os cabeçalhos da requisição.
 */
export async function autenticarIdentidade(
  { autenticacao, banco }: { autenticacao: Autenticacao; banco: Banco },
  cabecalhos: IncomingHttpHeaders,
): Promise<ResultadoAutenticacaoIdentidade> {
  const sessao = await autenticacao.api.getSession({ headers: fromNodeHeaders(cabecalhos) });

  if (!sessao) {
    return { ok: false, codigo: "NAO_AUTENTICADO" };
  }

  const identidade = await buscarIdentidadePessoalDoUsuario(banco, sessao.user.id);

  if (!identidade) {
    return { ok: false, codigo: "CADASTRO_INCOMPLETO" };
  }

  return {
    ok: true,
    contexto: {
      usuarioId: sessao.user.id,
      identidadeId: identidade.id,
      sessaoId: sessao.session.id,
    },
  };
}
