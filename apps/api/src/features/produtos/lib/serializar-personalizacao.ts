import type { GrupoOpcoesProduto, GrupoOpcoesPublico, OpcaoProduto } from "@jaa/contratos";
import type { GrupoComOpcoes } from "../repositorios/repositorio-personalizacao.js";

/*
 * Duas visões do MESMO domínio (nada é copiado para um "grupo do chat"):
 * - administrativa: inclui opção indisponível, que continua existindo e administrável;
 * - de cliente: só opções disponíveis, sem campos administrativos.
 */

function serializarOpcao(opcao: GrupoComOpcoes["opcoes"][number]): OpcaoProduto {
  return {
    id: opcao.id,
    nome: opcao.nome,
    precoAdicionalCentavos: opcao.precoAdicionalCentavos,
    disponibilidade: opcao.disponibilidade,
    posicao: opcao.posicao,
  };
}

export function serializarGrupoOpcoes({ grupo, opcoes }: GrupoComOpcoes): GrupoOpcoesProduto {
  return {
    id: grupo.id,
    nome: grupo.nome,
    instrucao: grupo.instrucao,
    minimoEscolhas: grupo.minimoEscolhas,
    maximoEscolhas: grupo.maximoEscolhas,
    posicao: grupo.posicao,
    opcoes: opcoes.map(serializarOpcao),
  };
}

/**
 * Visão de CLIENTE. Um grupo cujas opções disponíveis não alcançam o próprio mínimo é OMITIDO: exigir
 * 2 escolhas quando só sobrou 1 opção deixaria o produto impossível de montar. O máximo é reduzido ao
 * que existe, para a interface não prometer mais escolhas do que há.
 */
export function serializarGruposPublicos(grupos: GrupoComOpcoes[]): GrupoOpcoesPublico[] {
  return grupos
    .filter(({ opcoes }) => opcoes.length > 0)
    .filter(({ grupo, opcoes }) => grupo.minimoEscolhas <= opcoes.length)
    .map(({ grupo, opcoes }) => ({
      id: grupo.id,
      nome: grupo.nome,
      instrucao: grupo.instrucao,
      minimoEscolhas: grupo.minimoEscolhas,
      maximoEscolhas: Math.min(grupo.maximoEscolhas, opcoes.length),
      opcoes: opcoes.map((opcao) => ({ id: opcao.id, nome: opcao.nome, precoAdicionalCentavos: opcao.precoAdicionalCentavos })),
    }));
}
