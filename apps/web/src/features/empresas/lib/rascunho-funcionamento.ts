import { DIAS_SEMANA, MAXIMO_PERIODOS_POR_DIA, definirFuncionamentoEntradaSchema, horaParaExibir, periodosDoDia, type DiaSemana, type PeriodoFuncionamento } from "@jaa/contratos";

/*
 * RASCUNHO da tela "Horários de funcionamento": o gestor mexe na semana à vontade e só "Salvar
 * horários" grava (a API substitui a semana inteira). Aqui ficam as regras puras da tela. A validação
 * é a do CONTRATO — a mesma que o servidor aplica de novo.
 */

export interface PeriodoEmRascunho {
  // Identidade da linha na tela.
  chave: string;
  inicio: string;
  fim: string;
}

export type SemanaEmRascunho = Record<DiaSemana, PeriodoEmRascunho[]>;

export interface RascunhoDoFuncionamento {
  ativo: boolean;
  semana: SemanaEmRascunho;
}

let sequencia = 0;
const novaChave = () => `periodo-${(sequencia += 1)}`;

export function rascunhoDoFuncionamento(ativo: boolean, periodos: readonly PeriodoFuncionamento[]): RascunhoDoFuncionamento {
  const semana = Object.fromEntries(
    // O campo de hora do navegador não conhece "24:00": meia-noite aparece como 00:00.
    DIAS_SEMANA.map((dia) => [dia, periodosDoDia(periodos, dia).map((periodo) => ({ chave: novaChave(), inicio: periodo.inicio, fim: horaParaExibir(periodo.fim) }))]),
  ) as SemanaEmRascunho;
  return { ativo, semana };
}

export function periodosDoRascunho(semana: SemanaEmRascunho): Array<{ diaSemana: DiaSemana; inicio: string; fim: string }> {
  return DIAS_SEMANA.flatMap((dia) => semana[dia].map((periodo) => ({ diaSemana: dia, inicio: periodo.inicio, fim: periodo.fim })));
}

/** O que será enviado, ou a mensagem do que precisa ser corrigido antes. */
export function validarRascunho(rascunho: RascunhoDoFuncionamento): { ok: true; entrada: { ativo: boolean; periodos: PeriodoFuncionamento[] } } | { ok: false; erro: string } {
  const periodos = periodosDoRascunho(rascunho.semana);
  if (periodos.some((periodo) => periodo.inicio === "" || periodo.fim === "")) return { ok: false, erro: "Preencha a abertura e o fechamento de todos os períodos." };
  const resultado = definirFuncionamentoEntradaSchema.safeParse({ ativo: rascunho.ativo, periodos });
  return resultado.success ? { ok: true, entrada: resultado.data } : { ok: false, erro: resultado.error.issues[0]?.message ?? "Horários inválidos." };
}

const assinatura = (ativo: boolean, periodos: ReadonlyArray<{ diaSemana: number; inicio: string; fim: string }>) =>
  JSON.stringify([ativo, periodos.map((periodo) => `${periodo.diaSemana} ${periodo.inicio} ${horaParaExibir(periodo.fim)}`).sort()]);

export function funcionamentoAlterado(salvo: { ativo: boolean; periodos: readonly PeriodoFuncionamento[] }, rascunho: RascunhoDoFuncionamento): boolean {
  return assinatura(salvo.ativo, salvo.periodos) !== assinatura(rascunho.ativo, periodosDoRascunho(rascunho.semana));
}

const comDia = (rascunho: RascunhoDoFuncionamento, dia: DiaSemana, periodos: PeriodoEmRascunho[]): RascunhoDoFuncionamento => ({ ...rascunho, semana: { ...rascunho.semana, [dia]: periodos } });

/** Abrir um dia fechado começa com um período comum; um dia já aberto ganha um período depois do último. */
export function adicionarPeriodo(rascunho: RascunhoDoFuncionamento, dia: DiaSemana): RascunhoDoFuncionamento {
  const atuais = rascunho.semana[dia];
  if (atuais.length >= MAXIMO_PERIODOS_POR_DIA) return rascunho;
  const novo = atuais.length === 0 ? { inicio: "08:00", fim: "18:00" } : { inicio: "", fim: "" };
  return comDia(rascunho, dia, [...atuais, { chave: novaChave(), ...novo }]);
}

export function removerPeriodo(rascunho: RascunhoDoFuncionamento, dia: DiaSemana, chave: string): RascunhoDoFuncionamento {
  return comDia(rascunho, dia, rascunho.semana[dia].filter((periodo) => periodo.chave !== chave));
}

export function mudarPeriodo(rascunho: RascunhoDoFuncionamento, dia: DiaSemana, chave: string, valores: Partial<Pick<PeriodoEmRascunho, "inicio" | "fim">>): RascunhoDoFuncionamento {
  return comDia(rascunho, dia, rascunho.semana[dia].map((periodo) => (periodo.chave === chave ? { ...periodo, ...valores } : periodo)));
}

export function fecharDia(rascunho: RascunhoDoFuncionamento, dia: DiaSemana): RascunhoDoFuncionamento {
  return comDia(rascunho, dia, []);
}

/** Copia os horários de um dia para todos os outros (cada dia fica com linhas próprias). */
export function copiarParaTodosOsDias(rascunho: RascunhoDoFuncionamento, origem: DiaSemana): RascunhoDoFuncionamento {
  const semana = Object.fromEntries(
    DIAS_SEMANA.map((dia) => [dia, dia === origem ? rascunho.semana[origem] : rascunho.semana[origem].map((periodo) => ({ ...periodo, chave: novaChave() }))]),
  ) as SemanaEmRascunho;
  return { ...rascunho, semana };
}
