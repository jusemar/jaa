import type { Banco } from "@jaa/banco";
import { empresas, periodosFuncionamentoEmpresa } from "@jaa/banco/schema";
import type { DiaSemana, PeriodoFuncionamento } from "@jaa/contratos";
import { asc, eq } from "drizzle-orm";

/** A configuração de funcionamento como está no banco. `ativo` falso = a empresa não controla horário. */
export interface ConfiguracaoFuncionamento {
  ativo: boolean;
  fusoHorario: string;
  periodos: PeriodoFuncionamento[];
}

// O PostgreSQL devolve `time` com segundos ("08:00:00"); o contrato fala "HH:MM".
const horaDoBanco = (hora: string) => hora.slice(0, 5);

export async function buscarFuncionamentoDaEmpresa(banco: Banco, empresaId: string): Promise<ConfiguracaoFuncionamento | null> {
  const [empresa] = await banco
    .select({ ativo: empresas.horarioFuncionamentoAtivo, fusoHorario: empresas.fusoHorario })
    .from(empresas)
    .where(eq(empresas.id, empresaId))
    .limit(1);
  if (!empresa) return null;

  const periodos = await banco
    .select({ diaSemana: periodosFuncionamentoEmpresa.diaSemana, inicio: periodosFuncionamentoEmpresa.inicio, fim: periodosFuncionamentoEmpresa.fim })
    .from(periodosFuncionamentoEmpresa)
    .where(eq(periodosFuncionamentoEmpresa.empresaId, empresaId))
    .orderBy(asc(periodosFuncionamentoEmpresa.diaSemana), asc(periodosFuncionamentoEmpresa.inicio));

  return {
    ...empresa,
    periodos: periodos.map((periodo) => ({ diaSemana: periodo.diaSemana as DiaSemana, inicio: horaDoBanco(periodo.inicio), fim: horaDoBanco(periodo.fim) })),
  };
}

/**
 * Substitui a semana INTEIRA e a chave "controlar horário", numa transação com a empresa travada:
 * dois salvamentos simultâneos acontecem um depois do outro, nunca misturados, e ninguém lê uma
 * semana pela metade. Os períodos já chegam validados (formato e sobreposição) pelo contrato.
 */
export async function definirFuncionamentoDaEmpresa(banco: Banco, empresaId: string, entrada: { ativo: boolean; periodos: readonly PeriodoFuncionamento[] }): Promise<boolean> {
  return banco.transaction(async (transacao) => {
    const [empresa] = await transacao.select({ id: empresas.id }).from(empresas).where(eq(empresas.id, empresaId)).for("update");
    if (!empresa) return false;

    await transacao.delete(periodosFuncionamentoEmpresa).where(eq(periodosFuncionamentoEmpresa.empresaId, empresaId));
    if (entrada.periodos.length > 0) {
      await transacao.insert(periodosFuncionamentoEmpresa).values(entrada.periodos.map((periodo) => ({ empresaId, diaSemana: periodo.diaSemana, inicio: periodo.inicio, fim: periodo.fim })));
    }
    await transacao.update(empresas).set({ horarioFuncionamentoAtivo: entrada.ativo }).where(eq(empresas.id, empresaId));
    return true;
  });
}
