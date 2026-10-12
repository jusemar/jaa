import * as z from "zod";

/*
 * PERÍODO da lista de pedidos da empresa. Regra ÚNICA, usada pelo servidor para filtrar e contar:
 *
 * - o que decide o período é o momento em que o pedido foi CRIADO (`criadoEm`), que é o mesmo instante
 *   em que a empresa o recebe — a criação e o evento "recebido" são gravados na mesma transação;
 * - os dias são os do calendário LOCAL DA EMPRESA (o fuso dela), nunca os do navegador, do aparelho ou
 *   do servidor: "hoje" numa pizzaria de Belo Horizonte começa à meia-noite de lá;
 * - o intervalo é FECHADO no início e ABERTO no fim (`de ≤ criadoEm < ate`): um pedido das 23:59:59,9
 *   pertence àquele dia e o da meia-noite em ponto, ao dia seguinte — nenhum fica de fora nem em dois;
 * - a semana vai de SEGUNDA a domingo, como o resto do Jaaa (dia ISO 1 = segunda).
 *
 * Web e Mobile só escolhem a opção e, no personalizado, as duas datas: quem calcula os limites é o
 * servidor, com o relógio dele.
 */

export const periodoPedidosSchema = z.enum(["todos", "hoje", "semana", "mes", "personalizado"]);

export type PeriodoPedidos = z.infer<typeof periodoPedidosSchema>;

export const ROTULO_PERIODO_PEDIDOS: Record<PeriodoPedidos, string> = {
  todos: "Todo o período",
  hoje: "Hoje",
  semana: "Esta semana",
  mes: "Este mês",
  personalizado: "Personalizado",
};

/** Dia do calendário, sem hora nem fuso: "2026-10-11". */
export type DataLocal = string;

function partesDaData(data: string): { ano: number; mes: number; dia: number } | null {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
  if (!partes) return null;
  const [ano, mes, dia] = [Number(partes[1]), Number(partes[2]), Number(partes[3])];
  const conferida = new Date(Date.UTC(ano, mes - 1, dia));
  // 2026-02-30 "existe" para o Date (vira 2 de março): só vale a data que volta igual.
  if (conferida.getUTCFullYear() !== ano || conferida.getUTCMonth() !== mes - 1 || conferida.getUTCDate() !== dia) return null;
  return { ano, mes, dia };
}

export const dataLocalSchema = z.string().refine((valor) => partesDaData(valor) !== null, "Informe a data como AAAA-MM-DD.");

const paraDataLocal = (ano: number, mes: number, dia: number): DataLocal => {
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  return `${String(data.getUTCFullYear()).padStart(4, "0")}-${String(data.getUTCMonth() + 1).padStart(2, "0")}-${String(data.getUTCDate()).padStart(2, "0")}`;
};

/** Soma dias a uma data do calendário (pode ser negativo); vira o mês e o ano sozinho. */
export function somarDias(data: DataLocal, dias: number): DataLocal {
  const partes = partesDaData(data);
  if (!partes) throw new Error("Data inválida.");
  return paraDataLocal(partes.ano, partes.mes, partes.dia + dias);
}

function relogioLocal(instante: Date, fuso: string): { ano: number; mes: number; dia: number; hora: number; minuto: number; segundo: number } {
  const partes = new Intl.DateTimeFormat("en-US", { timeZone: fuso, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(instante);
  const parte = (tipo: string) => Number(partes.find((item) => item.type === tipo)?.value ?? "0");
  return { ano: parte("year"), mes: parte("month"), dia: parte("day"), hora: parte("hour"), minuto: parte("minute"), segundo: parte("second") };
}

/** Que dia é este instante no calendário do fuso dado. */
export function dataLocalDoInstante(instante: Date, fuso: string): DataLocal {
  const local = relogioLocal(instante, fuso);
  return paraDataLocal(local.ano, local.mes, local.dia);
}

/**
 * O instante em que o dia COMEÇA naquele fuso (meia-noite local). Onde a meia-noite não existe (o
 * relógio pula na virada do horário de verão), vale o primeiro instante do dia.
 */
export function inicioDoDia(data: DataLocal, fuso: string): Date {
  const partes = partesDaData(data);
  if (!partes) throw new Error("Data inválida.");
  const comoUtc = Date.UTC(partes.ano, partes.mes - 1, partes.dia);
  // Diferença entre o relógio local e o UTC naquele momento; duas passadas cobrem a troca de horário.
  let instante = comoUtc;
  for (let passada = 0; passada < 2; passada += 1) {
    const local = relogioLocal(new Date(instante), fuso);
    const localComoUtc = Date.UTC(local.ano, local.mes - 1, local.dia, local.hora, local.minuto, local.segundo);
    instante = comoUtc - (localComoUtc - instante);
  }
  return new Date(instante);
}

export interface IntervaloDePedidos {
  // Primeiro instante que ENTRA (null = sem limite inferior).
  de: Date | null;
  // Primeiro instante que já NÃO entra (null = sem limite superior).
  ate: Date | null;
}

export const SEM_INTERVALO: IntervaloDePedidos = { de: null, ate: null };

/**
 * Limites do período no fuso da empresa. No personalizado as duas datas entram INTEIRAS: de 01/10 a
 * 03/10 vai da meia-noite do dia 1 até a meia-noite do dia 4.
 */
export function intervaloDoPeriodo(periodo: PeriodoPedidos, opcoes: { agora: Date; fuso: string; dataInicial?: DataLocal | undefined; dataFinal?: DataLocal | undefined }): IntervaloDePedidos {
  const { agora, fuso } = opcoes;
  if (periodo === "todos") return SEM_INTERVALO;

  const hoje = dataLocalDoInstante(agora, fuso);
  const entre = (primeiroDia: DataLocal, diaSeguinteAoUltimo: DataLocal): IntervaloDePedidos => ({ de: inicioDoDia(primeiroDia, fuso), ate: inicioDoDia(diaSeguinteAoUltimo, fuso) });

  if (periodo === "hoje") return entre(hoje, somarDias(hoje, 1));

  if (periodo === "semana") {
    const partes = partesDaData(hoje);
    if (!partes) throw new Error("Data inválida.");
    // getUTCDay: 0 = domingo … 6 = sábado. Dias desde a segunda-feira: domingo = 6.
    const desdeSegunda = (new Date(Date.UTC(partes.ano, partes.mes - 1, partes.dia)).getUTCDay() + 6) % 7;
    const segunda = somarDias(hoje, -desdeSegunda);
    return entre(segunda, somarDias(segunda, 7));
  }

  if (periodo === "mes") {
    const partes = partesDaData(hoje);
    if (!partes) throw new Error("Data inválida.");
    return entre(paraDataLocal(partes.ano, partes.mes, 1), paraDataLocal(partes.ano, partes.mes + 1, 1));
  }

  if (!opcoes.dataInicial || !opcoes.dataFinal) throw new Error("O período personalizado precisa da data inicial e da final.");
  return entre(opcoes.dataInicial, somarDias(opcoes.dataFinal, 1));
}

/** O pedido criado neste instante entra no intervalo? (a mesma conta do banco: de ≤ instante < ate) */
export function instanteNoIntervalo(instante: Date, intervalo: IntervaloDePedidos): boolean {
  return (intervalo.de === null || instante.getTime() >= intervalo.de.getTime()) && (intervalo.ate === null || instante.getTime() < intervalo.ate.getTime());
}

export const MENSAGEM_PERIODO_PERSONALIZADO = {
  faltaData: "Informe a data inicial e a data final.",
  ordem: "A data final não pode ser anterior à data inicial.",
} as const;

/** O que falta para o período personalizado valer — a mesma regra do servidor, para a tela avisar antes. */
export function problemaDoPeriodoPersonalizado(dataInicial: string | undefined, dataFinal: string | undefined): string | null {
  if (!dataInicial || !dataFinal || partesDaData(dataInicial) === null || partesDaData(dataFinal) === null) return MENSAGEM_PERIODO_PERSONALIZADO.faltaData;
  // Datas AAAA-MM-DD comparam certo como texto.
  return dataFinal < dataInicial ? MENSAGEM_PERIODO_PERSONALIZADO.ordem : null;
}
