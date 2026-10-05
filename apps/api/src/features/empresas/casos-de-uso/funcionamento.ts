import type { Banco } from "@jaa/banco";
import { calcularFuncionamento, type FuncionamentoEmpresa, type FuncionamentoPublico, type PeriodoFuncionamento } from "@jaa/contratos";
import { buscarFuncionamentoDaEmpresa, definirFuncionamentoDaEmpresa } from "../repositorios/repositorio-funcionamento.js";

/*
 * FUNCIONAMENTO da empresa. Todo "está aberta agora?" do Jaa passa por aqui: o cardápio (na conversa
 * e no link público), a tela do gestor e a criação do pedido. A conta é uma só — `calcularFuncionamento`,
 * em @jaa/contratos —, feita com o relógio do SERVIDOR e o fuso da EMPRESA.
 */

/** O que o CLIENTE vê: aberta ou fechada agora, e a semana (vazia se a empresa não controla horário). */
export async function consultarFuncionamentoPublico(banco: Banco, empresaId: string, agora: Date = new Date()): Promise<FuncionamentoPublico | null> {
  const configuracao = await buscarFuncionamentoDaEmpresa(banco, empresaId);
  if (!configuracao) return null;
  const { estado, hoje } = calcularFuncionamento(configuracao, agora, configuracao.fusoHorario);
  return { estado, hoje, semana: configuracao.ativo ? configuracao.periodos : [] };
}

/** Visão do gestor: a configuração inteira (mesmo desligada) e o estado que ela produz agora. */
export async function consultarFuncionamentoDaEmpresa(banco: Banco, empresaId: string, agora: Date = new Date()): Promise<FuncionamentoEmpresa | null> {
  const configuracao = await buscarFuncionamentoDaEmpresa(banco, empresaId);
  if (!configuracao) return null;
  const { estado, hoje } = calcularFuncionamento(configuracao, agora, configuracao.fusoHorario);
  return { ativo: configuracao.ativo, fusoHorario: configuracao.fusoHorario, periodos: configuracao.periodos, estado, hoje };
}

export async function definirFuncionamento(
  banco: Banco,
  empresaId: string,
  entrada: { ativo: boolean; periodos: readonly PeriodoFuncionamento[] },
  agora: Date = new Date(),
): Promise<FuncionamentoEmpresa | null> {
  if (!(await definirFuncionamentoDaEmpresa(banco, empresaId, entrada))) return null;
  return consultarFuncionamentoDaEmpresa(banco, empresaId, agora);
}
