import type { IncomingHttpHeaders } from "node:http";
import type { Banco } from "@jaa/banco";
import type { TipoIdentidade } from "@jaa/contratos";
import { fromNodeHeaders } from "better-auth/node";
import * as z from "zod";
import { autorizarOperacaoIdentidade } from "../../identidades/lib/autorizacao-identidades.js";
import { buscarIdentidadePessoalDoUsuario } from "../../identidades/repositorios/repositorio-identidades.js";
import type { Autenticacao } from "../autenticacao.js";

// Quem está agindo, determinado exclusivamente pelo servidor.
export interface ContextoIdentidadeAutenticada {
  readonly usuarioId: string;
  // Identidade ATUANTE (em nome de quem a operação acontece): a pessoal ou uma empresarial autorizada.
  readonly identidadeId: string;
  readonly tipoIdentidade: TipoIdentidade;
  // Identidade pessoal da conta (existe sempre com cadastro completo).
  readonly identidadePessoalId: string;
  // Id da sessão no Better Auth (não é o token): usado para encerrar só as conexões desta sessão.
  readonly sessaoId: string;
}

type ResultadoAutenticacaoIdentidade =
  | { ok: true; contexto: ContextoIdentidadeAutenticada }
  | { ok: false; codigo: "NAO_AUTENTICADO" | "CADASTRO_INCOMPLETO" | "IDENTIDADE_NAO_AUTORIZADA" };

const identidadeSolicitadaSchema = z.uuid();

/**
 * Valida a sessão (cookie → Better Auth → banco), exige identidade pessoal e resolve a identidade ATUANTE.
 * `identidadeSolicitadaId` é só a INTENÇÃO do cliente (cabeçalho HTTP ou `auth` do Socket.IO):
 * ausente → pessoal; pedida → só se a camada de autorização disser que esta conta pode operá-la.
 * Pedido inválido ou não autorizado é RECUSADO, nunca convertido em silêncio para outra identidade.
 * Usado igualmente pelo handshake realtime e pelas rotas HTTP. Independe de Fastify e Socket.IO.
 */
export async function autenticarIdentidade(
  { autenticacao, banco }: { autenticacao: Autenticacao; banco: Banco },
  cabecalhos: IncomingHttpHeaders,
  identidadeSolicitadaId?: unknown,
): Promise<ResultadoAutenticacaoIdentidade> {
  const sessao = await autenticacao.api.getSession({ headers: fromNodeHeaders(cabecalhos) });

  if (!sessao) {
    return { ok: false, codigo: "NAO_AUTENTICADO" };
  }

  const pessoal = await buscarIdentidadePessoalDoUsuario(banco, sessao.user.id);

  if (!pessoal) {
    return { ok: false, codigo: "CADASTRO_INCOMPLETO" };
  }

  const base = { usuarioId: sessao.user.id, identidadePessoalId: pessoal.id, sessaoId: sessao.session.id };
  const pedido = identidadeSolicitadaId === "" ? undefined : identidadeSolicitadaId;

  if (pedido === undefined || pedido === null || pedido === pessoal.id) {
    return { ok: true, contexto: { ...base, identidadeId: pessoal.id, tipoIdentidade: "pessoal" } };
  }

  const identidadeId = identidadeSolicitadaSchema.safeParse(pedido);
  const operavel = identidadeId.success ? await autorizarOperacaoIdentidade(banco, sessao.user.id, identidadeId.data) : null;

  if (!operavel) {
    return { ok: false, codigo: "IDENTIDADE_NAO_AUTORIZADA" };
  }

  return { ok: true, contexto: { ...base, identidadeId: operavel.identidadeId, tipoIdentidade: operavel.tipo } };
}
