import type { IncomingHttpHeaders } from "node:http";
import type { Banco } from "@jaa/banco";
import type { CodigoErroConexaoRealtime } from "@jaa/contratos";
import { fromNodeHeaders } from "better-auth/node";
import { buscarIdentidadePessoalDoUsuario } from "../../identidades/repositorios/repositorio-identidades.js";
import type { Autenticacao } from "../autenticacao.js";

// Quem é a conexão, determinado exclusivamente pelo servidor.
export interface ContextoConexaoAutenticada {
  readonly usuarioId: string;
  readonly identidadeId: string;
  // Id da sessão no Better Auth (não é o token): usado para encerrar só as conexões desta sessão.
  readonly sessaoId: string;
}

type ResultadoAutenticacaoConexao =
  | { ok: true; contexto: ContextoConexaoAutenticada }
  | { ok: false; codigo: Exclude<CodigoErroConexaoRealtime, "ERRO_INTERNO"> };

/**
 * Valida a sessão do handshake com o mesmo mecanismo das rotas HTTP protegidas
 * (cookie → Better Auth → banco) e exige identidade pessoal: sem ela não há remetente no Jaa.
 * Independe da biblioteca de realtime: recebe apenas os cabeçalhos da requisição.
 */
export async function autenticarConexaoRealtime(
  { autenticacao, banco }: { autenticacao: Autenticacao; banco: Banco },
  cabecalhos: IncomingHttpHeaders,
): Promise<ResultadoAutenticacaoConexao> {
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
