import type { IncomingHttpHeaders } from "node:http";
import type { Banco } from "@jaa/banco";
import type { TipoIdentidade } from "@jaa/contratos";
import { fromNodeHeaders } from "better-auth/node";
import * as z from "zod";
import { autorizarOperacaoIdentidade } from "../../identidades/lib/autorizacao-identidades.js";
import { buscarIdentidadePessoalDoUsuario } from "../../identidades/repositorios/repositorio-identidades.js";
import { situacaoDoVisitante } from "../../visitantes/lib/situacao-visitante.js";
import { buscarVisitanteDoUsuario, registrarAtividadeVisitante } from "../../visitantes/repositorios/repositorio-visitantes.js";
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
  /*
   * Conta TEMPORÁRIA do Link do Jaa. Só chega aqui em rota que aceita visitante explicitamente
   * (`permitirVisitante`); a identidade dele é pessoal, mas não é "a pessoal" de conta nenhuma.
   * Ausente = conta comum.
   */
  readonly visitante?: true;
}

type ResultadoAutenticacaoIdentidade =
  | { ok: true; contexto: ContextoIdentidadeAutenticada }
  | { ok: false; codigo: "NAO_AUTENTICADO" | "CADASTRO_INCOMPLETO" | "IDENTIDADE_NAO_AUTORIZADA" | "CONTA_NECESSARIA" };

const identidadeSolicitadaSchema = z.uuid();

/**
 * Valida a sessão (cookie → Better Auth → banco), exige identidade pessoal e resolve a identidade ATUANTE.
 * `identidadeSolicitadaId` é só a INTENÇÃO do cliente (cabeçalho HTTP ou `auth` do Socket.IO):
 * ausente → pessoal; pedida → só se a camada de autorização disser que esta conta pode operá-la.
 * Pedido inválido ou não autorizado é RECUSADO, nunca convertido em silêncio para outra identidade.
 * Usado igualmente pelo handshake realtime e pelas rotas HTTP. Independe de Fastify e Socket.IO.
 *
 * VISITANTE (conta temporária do Link do Jaa): recusado por padrão com CONTA_NECESSARIA. Só as rotas
 * que pedem `permitirVisitante` (conversar, ver perfis públicos, bloquear) o aceitam, e cada uso aceito
 * é atividade que renova o prazo de 24 h. Visitante expirado é sessão que não vale mais.
 */
export async function autenticarIdentidade(
  { autenticacao, banco }: { autenticacao: Autenticacao; banco: Banco },
  cabecalhos: IncomingHttpHeaders,
  identidadeSolicitadaId?: unknown,
  { permitirVisitante = false }: { permitirVisitante?: boolean } = {},
): Promise<ResultadoAutenticacaoIdentidade> {
  const sessao = await autenticacao.api.getSession({ headers: fromNodeHeaders(cabecalhos) });

  if (!sessao) {
    return { ok: false, codigo: "NAO_AUTENTICADO" };
  }

  const pessoal = await buscarIdentidadePessoalDoUsuario(banco, sessao.user.id);

  if (!pessoal) {
    return autenticarVisitante(banco, sessao, identidadeSolicitadaId, permitirVisitante);
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

async function autenticarVisitante(
  banco: Banco,
  sessao: { user: { id: string }; session: { id: string } },
  identidadeSolicitadaId: unknown,
  permitirVisitante: boolean,
): Promise<ResultadoAutenticacaoIdentidade> {
  const visitante = await buscarVisitanteDoUsuario(banco, sessao.user.id);
  if (!visitante) return { ok: false, codigo: "CADASTRO_INCOMPLETO" };

  switch (situacaoDoVisitante(visitante, new Date())) {
    // Criou conta e falta só escolher nome e @usuario: é cadastro incompleto como qualquer outro.
    case "convertida":
      return { ok: false, codigo: "CADASTRO_INCOMPLETO" };
    case "expirada":
    case "encerrada":
      return { ok: false, codigo: "NAO_AUTENTICADO" };
    case "ativa":
      break;
  }

  if (!permitirVisitante) return { ok: false, codigo: "CONTA_NECESSARIA" };

  // Visitante só age como ele mesmo: não opera empresa nenhuma.
  const pedido = identidadeSolicitadaId === "" ? undefined : identidadeSolicitadaId;
  if (pedido !== undefined && pedido !== null && pedido !== visitante.identidadeId) {
    return { ok: false, codigo: "IDENTIDADE_NAO_AUTORIZADA" };
  }

  await registrarAtividadeVisitante(banco, visitante.identidadeId);
  return {
    ok: true,
    contexto: {
      usuarioId: sessao.user.id,
      identidadeId: visitante.identidadeId,
      tipoIdentidade: "pessoal",
      identidadePessoalId: visitante.identidadeId,
      sessaoId: sessao.session.id,
      visitante: true,
    },
  };
}
