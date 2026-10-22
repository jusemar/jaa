import type { Banco } from "@jaa/banco";
import { CABECALHO_IDENTIDADE_ATUANTE, type ErroApi } from "@jaa/contratos";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Autenticacao } from "../autenticacao.js";
import { autenticarIdentidade, type ContextoIdentidadeAutenticada } from "../casos-de-uso/autenticar-identidade.js";

declare module "fastify" {
  interface FastifyRequest {
    identidadeAutenticada: ContextoIdentidadeAutenticada | null;
  }
}

interface OpcoesIdentidade {
  /*
   * A rota aceita VISITANTE (conta temporária do Link do Jaa)? Padrão NÃO: só o que é conversar e ver
   * o que já é público aceita. Todo o resto responde CONTA_NECESSARIA sem a rota precisar saber disso.
   */
  permitirVisitante?: boolean;
}

async function exigir(
  dependencias: { autenticacao: Autenticacao; banco: Banco },
  requisicao: FastifyRequest,
  resposta: FastifyReply,
  identidadeSolicitada: unknown,
  opcoes: OpcoesIdentidade = {},
) {
  const resultado = await autenticarIdentidade(dependencias, requisicao.headers, identidadeSolicitada, opcoes);

  if (!resultado.ok) {
    const erros: Record<typeof resultado.codigo, { status: number; erro: ErroApi }> = {
      NAO_AUTENTICADO: { status: 401, erro: { codigo: "NAO_AUTENTICADO", mensagem: "Sessão ausente ou expirada." } },
      CADASTRO_INCOMPLETO: { status: 403, erro: { codigo: "CADASTRO_INCOMPLETO", mensagem: "Conclua o cadastro para usar as conversas." } },
      IDENTIDADE_NAO_AUTORIZADA: { status: 403, erro: { codigo: "IDENTIDADE_NAO_AUTORIZADA", mensagem: "Você não pode agir como esta identidade." } },
      CONTA_NECESSARIA: { status: 403, erro: { codigo: "CONTA_NECESSARIA", mensagem: "Para continuar, crie sua conta ou entre no Jaaa." } },
    };
    const { status, erro } = erros[resultado.codigo];
    return resposta.code(status).send(erro);
  }

  requisicao.identidadeAutenticada = resultado.contexto;
}

/**
 * preHandler para rotas da CONTA com cadastro completo (ex.: empresas, produtos, identidades operáveis).
 * Ignora qualquer identidade atuante pedida: a identidade no contexto é sempre a pessoal.
 */
export function exigirIdentidadeAutenticada(dependencias: { autenticacao: Autenticacao; banco: Banco }) {
  return (requisicao: FastifyRequest, resposta: FastifyReply) => exigir(dependencias, requisicao, resposta, undefined);
}

/**
 * preHandler para rotas que agem EM NOME de uma identidade (conversas e mensagens).
 * Lê a intenção em CABECALHO_IDENTIDADE_ATUANTE e a valida contra os vínculos da conta:
 * sem sessão → 401; sem cadastro → 403; identidade não operável (ou cabeçalho repetido) → 403.
 */
export function exigirIdentidadeAtuante(dependencias: { autenticacao: Autenticacao; banco: Banco }, opcoes: OpcoesIdentidade = {}) {
  return (requisicao: FastifyRequest, resposta: FastifyReply) => {
    const valor = requisicao.headers[CABECALHO_IDENTIDADE_ATUANTE];
    // Cabeçalho repetido é ambíguo: tratado como pedido inválido.
    return exigir(dependencias, requisicao, resposta, Array.isArray(valor) ? "invalido" : valor, opcoes);
  };
}

export function obterIdentidadeExigida(requisicao: FastifyRequest): ContextoIdentidadeAutenticada {
  if (!requisicao.identidadeAutenticada) {
    throw new Error("Rota registrada sem preHandler de identidade (exigirIdentidadeAutenticada/exigirIdentidadeAtuante).");
  }

  return requisicao.identidadeAutenticada;
}
