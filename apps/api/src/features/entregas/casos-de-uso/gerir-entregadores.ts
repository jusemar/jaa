import type { Banco } from "@jaa/banco";
import { entregadorPodeOperar, type StatusEntregador } from "@jaa/contratos";
import { autorizarEmpresa } from "../../empresas/lib/autorizacao-empresas.js";
import { buscarIdentidadePessoalPorNomeUsuario } from "../../identidades/repositorios/repositorio-identidades.js";
import {
  alterarDisponibilidade,
  alterarStatusEntregador,
  buscarEntregadorDaEmpresa,
  buscarVinculoEntregador,
  convidarEntregador,
  listarConvitesDaPessoa,
  listarEntregadoresDaEmpresa,
  listarPedidosAtribuidosAoEntregador,
  listarVinculosDaPessoa,
  responderConvite,
  type EntregadorComPessoaRegistro,
} from "../repositorios/repositorio-entregadores.js";
import { encerrarAtribuicaoAtual } from "../repositorios/repositorio-atribuicoes.js";

/*
 * QUADRO DE ENTREGADORES da empresa. Tudo passa pela autorização central com a permissão
 * `gerenciar-entregadores`: entregador NÃO é administrador e administrar entregadores não é entregar.
 * Empresa sem acesso e empresa inexistente são indistinguíveis (404).
 */

type SemAcesso = { tipo: "empresa-nao-encontrada" };
type SemEntregador = { tipo: "entregador-nao-encontrado" };

export async function listarEntregadoresAutorizado(
  banco: Banco,
  usuarioId: string,
  empresaId: string,
): Promise<{ tipo: "lista"; entregadores: EntregadorComPessoaRegistro[] } | SemAcesso> {
  const acesso = await autorizarEmpresa(banco, usuarioId, empresaId, "gerenciar-entregadores");
  if (!acesso) return { tipo: "empresa-nao-encontrada" };
  return { tipo: "lista", entregadores: await listarEntregadoresDaEmpresa(banco, empresaId) };
}

/**
 * Convite pelo @usuario PÚBLICO: a empresa não procura ninguém por telefone e não vira entregador
 * de ninguém à força — o vínculo nasce "convidado" e só a própria pessoa aceita.
 */
export async function convidarEntregadorAutorizado(
  banco: Banco,
  usuarioId: string,
  empresaId: string,
  nomeUsuario: string,
): Promise<{ tipo: "convidado"; entregador: EntregadorComPessoaRegistro } | SemAcesso | { tipo: "pessoa-nao-encontrada" } | { tipo: "pessoa-e-operadora" }> {
  const acesso = await autorizarEmpresa(banco, usuarioId, empresaId, "gerenciar-entregadores");
  if (!acesso) return { tipo: "empresa-nao-encontrada" };

  const identidade = await buscarIdentidadePessoalPorNomeUsuario(banco, nomeUsuario);
  if (!identidade?.usuarioId) return { tipo: "pessoa-nao-encontrada" };

  // Quem já opera a empresa não vira "entregador": os dois vínculos têm propósitos diferentes.
  const jaOpera = await autorizarEmpresa(banco, identidade.usuarioId, empresaId, "operar-identidade-empresarial");
  if (jaOpera) return { tipo: "pessoa-e-operadora" };

  const vinculo = await convidarEntregador(banco, { empresaId, usuarioId: identidade.usuarioId, convidadoPorUsuarioId: usuarioId });
  const entregador = await buscarEntregadorDaEmpresa(banco, empresaId, vinculo.id);
  if (!entregador) throw new Error("Entregador convidado não encontrado.");
  return { tipo: "convidado", entregador };
}

/**
 * Ativar/desativar o vínculo. Desativar é REVOGAÇÃO: encerra na hora as atribuições atuais dele (o
 * histórico permanece) e devolve os pedidos afetados para quem chama avisar o entregador e a empresa.
 */
export async function alterarStatusEntregadorAutorizado(
  banco: Banco,
  usuarioId: string,
  empresaId: string,
  entregadorId: string,
  status: Extract<StatusEntregador, "ativo" | "inativo">,
): Promise<{ tipo: "alterado"; entregador: EntregadorComPessoaRegistro; pedidosLiberados: string[] } | SemAcesso | SemEntregador> {
  const acesso = await autorizarEmpresa(banco, usuarioId, empresaId, "gerenciar-entregadores");
  if (!acesso) return { tipo: "empresa-nao-encontrada" };

  const atual = await buscarEntregadorDaEmpresa(banco, empresaId, entregadorId);
  if (!atual) return { tipo: "entregador-nao-encontrado" };
  // Convite pendente não é ativado pela empresa: quem aceita é a pessoa.
  if (atual.status === "convidado" && status === "ativo") return { tipo: "entregador-nao-encontrado" };

  const alterado = await alterarStatusEntregador(banco, { empresaId, entregadorId, status });
  if (!alterado) return { tipo: "entregador-nao-encontrado" };

  const pedidosLiberados: string[] = [];
  if (!entregadorPodeOperar(status)) {
    for (const { pedidoId } of await listarPedidosAtribuidosAoEntregador(banco, entregadorId)) {
      if (await encerrarAtribuicaoAtual(banco, pedidoId, "Entregador desativado")) pedidosLiberados.push(pedidoId);
    }
  }

  const entregador = await buscarEntregadorDaEmpresa(banco, empresaId, entregadorId);
  if (!entregador) throw new Error("Entregador alterado não encontrado.");
  return { tipo: "alterado", entregador, pedidosLiberados };
}

// Convites pendentes da PESSOA autenticada (nada de empresa envolvido na autorização).
export function listarConvitesPendentes(banco: Banco, usuarioId: string) {
  return listarConvitesDaPessoa(banco, usuarioId);
}

export async function responderConviteDaPessoa(
  banco: Banco,
  usuarioId: string,
  entregadorId: string,
  aceitar: boolean,
): Promise<{ tipo: "respondido"; empresaId: string; status: StatusEntregador } | { tipo: "convite-nao-encontrado" }> {
  const vinculo = await responderConvite(banco, { entregadorId, usuarioId, aceitar });
  return vinculo ? { tipo: "respondido", empresaId: vinculo.empresaId, status: vinculo.status } : { tipo: "convite-nao-encontrado" };
}

// "Esta conta pode operar entregas desta empresa agora?" (vínculo ativo, nunca papel administrativo).
export async function vinculoAtivoDeEntregador(banco: Banco, empresaId: string, usuarioId: string): Promise<string | null> {
  const vinculo = await buscarVinculoEntregador(banco, empresaId, usuarioId);
  return vinculo && entregadorPodeOperar(vinculo.status) ? vinculo.id : null;
}

/**
 * DISPONIBILIDADE: decisão do PRÓPRIO entregador, por empresa. A empresa não tem rota para isto —
 * ela administra o vínculo (ativo/inativo), não a agenda operacional de ninguém.
 * Vínculo inexistente, de outra pessoa, convite pendente ou inativo: "não encontrado" (404).
 */
export async function alterarMinhaDisponibilidade(
  banco: Banco,
  usuarioId: string,
  entregadorId: string,
  disponivel: boolean,
): Promise<{ tipo: "alterado"; entregador: EntregadorComPessoaRegistro } | { tipo: "vinculo-nao-encontrado" }> {
  const vinculo = await alterarDisponibilidade(banco, { entregadorId, usuarioId, disponivel });
  if (!vinculo) return { tipo: "vinculo-nao-encontrado" };

  const entregador = await buscarEntregadorDaEmpresa(banco, vinculo.empresaId, entregadorId);
  if (!entregador) throw new Error("Vínculo de entregador não encontrado após alterar disponibilidade.");
  return { tipo: "alterado", entregador };
}

// "Empresas em que trabalho": todos os vínculos da pessoa, com a disponibilidade em cada empresa.
export function listarMeusVinculos(banco: Banco, usuarioId: string) {
  return listarVinculosDaPessoa(banco, usuarioId);
}
