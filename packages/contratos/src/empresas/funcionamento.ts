import * as z from "zod";
import { ROTULO_DIA_SEMANA, diaDaProgramacaoSchema } from "../produtos/personalizacao.ts";
import { DIAS_SEMANA, horarioLocal, minutosDoDia, type DiaSemana } from "../profissionais/horarios-atendimento.ts";

/*
 * HORÁRIO DE FUNCIONAMENTO da EMPRESA: em que dias e horas ela RECEBE PEDIDOS.
 *
 * É um conceito próprio, separado de dois vizinhos que parecem iguais e não são:
 *  - os horários de ATENDIMENTO do perfil profissional (`profissionais/horarios-atendimento.ts`) dizem
 *    quando um profissional atende um serviço e alimentam o matching;
 *  - a PROGRAMAÇÃO SEMANAL das opções de produto diz QUAIS opções existem em cada dia.
 * O que se reaproveita é a infraestrutura neutra: dia ISO (1 = segunda … 7 = domingo), "HH:MM",
 * `minutosDoDia` e `horarioLocal` (instante → dia e hora no fuso informado).
 *
 * Uma empresa tem zero ou mais PERÍODOS por dia. Dia sem período = fechado. Um período pode
 * ATRAVESSAR A MEIA-NOITE: fim menor ou igual ao início significa "fecha no dia seguinte"
 * (sexta 18:00–02:00 abre na sexta e fecha às 2h do sábado); ele pertence ao dia em que ABRE.
 *
 * COMPATIBILIDADE: enquanto `ativo` é falso, a empresa NÃO controla horário e recebe pedidos a
 * qualquer hora — é o comportamento de toda empresa que nunca configurou nada.
 *
 * A REGRA É UMA SÓ (`calcularFuncionamento`) e roda no SERVIDOR, com o relógio dele e o fuso da
 * empresa. Os clientes recebem o estado e os textos prontos: ninguém compara horário no navegador.
 */

const HORA_INICIO = /^([01]\d|2[0-3]):[0-5]\d$/;
const HORA_FIM = /^(([01]\d|2[0-3]):[0-5]\d|24:00)$/;
const MINUTOS_DO_DIA = 1440;
const MINUTOS_DA_SEMANA = 7 * MINUTOS_DO_DIA;

export const periodoFuncionamentoSchema = z
  .object({
    diaSemana: diaDaProgramacaoSchema,
    inicio: z.string().regex(HORA_INICIO, "Abertura no formato HH:MM (até 23:59)."),
    // Fechar "à meia-noite" é 24:00; quem digita 00:00 quer dizer a mesma coisa.
    fim: z
      .string()
      .regex(HORA_FIM, "Fechamento no formato HH:MM.")
      .transform((fim) => (fim === "00:00" ? "24:00" : fim)),
  })
  .refine((periodo) => periodo.inicio !== periodo.fim, "A abertura e o fechamento não podem ser iguais. Para 24 horas, use 00:00 até 00:00.");

export type PeriodoFuncionamento = z.infer<typeof periodoFuncionamentoSchema>;

/** O período fecha no DIA SEGUINTE ao que abre (ex.: 18:00–02:00)? */
export function periodoAtravessaMeiaNoite(periodo: Pick<PeriodoFuncionamento, "inicio" | "fim">): boolean {
  return minutosDoDia(periodo.fim) <= minutosDoDia(periodo.inicio);
}

// Posição na SEMANA, em minutos desde segunda 00:00: é onde períodos de dias vizinhos se comparam.
const inicioNaSemana = (periodo: PeriodoFuncionamento) => (periodo.diaSemana - 1) * MINUTOS_DO_DIA + minutosDoDia(periodo.inicio);
const duracao = (periodo: PeriodoFuncionamento) => minutosDoDia(periodo.fim) - minutosDoDia(periodo.inicio) + (periodoAtravessaMeiaNoite(periodo) ? MINUTOS_DO_DIA : 0);

/**
 * Dois períodos se cruzam? A conta é feita na semana inteira, que é circular: domingo 22:00–03:00
 * cruza com segunda 02:00–10:00. Encostar (um fecha às 14:00, o outro abre às 14:00) não é cruzar.
 */
export function periodosDeFuncionamentoSeSobrepoem(periodos: readonly PeriodoFuncionamento[]): boolean {
  return periodos.some((a, indice) =>
    periodos.slice(indice + 1).some((b) => {
      const inicioA = inicioNaSemana(a);
      const fimA = inicioA + duracao(a);
      return [-MINUTOS_DA_SEMANA, 0, MINUTOS_DA_SEMANA].some((volta) => {
        const inicioB = inicioNaSemana(b) + volta;
        return inicioA < inicioB + duracao(b) && inicioB < fimA;
      });
    }),
  );
}

export const MAXIMO_PERIODOS_POR_DIA = 4;

export const periodosFuncionamentoSchema = z
  .array(periodoFuncionamentoSchema)
  .max(DIAS_SEMANA.length * MAXIMO_PERIODOS_POR_DIA)
  .refine((periodos) => DIAS_SEMANA.every((dia) => periodos.filter((periodo) => periodo.diaSemana === dia).length <= MAXIMO_PERIODOS_POR_DIA), `No máximo ${MAXIMO_PERIODOS_POR_DIA} períodos por dia.`)
  .refine((periodos) => !periodosDeFuncionamentoSeSobrepoem(periodos), "Há horários que se sobrepõem. Confira também os períodos que passam da meia-noite.");

// A semana INTEIRA (substitui a anterior) e a chave "controlar horário". Desligar não apaga os períodos.
export const definirFuncionamentoEntradaSchema = z.object({
  ativo: z.boolean(),
  periodos: periodosFuncionamentoSchema,
});

export type DefinirFuncionamentoEntrada = z.input<typeof definirFuncionamentoEntradaSchema>;

/* ---------- Estado: aberto ou fechado AGORA ---------- */

export const proximaAberturaSchema = z.object({
  diaSemana: diaDaProgramacaoSchema,
  hora: z.string(),
  // 0 = hoje, 1 = amanhã… no calendário LOCAL da empresa.
  diasAFrente: z.number().int().min(0).max(7),
});

export type ProximaAbertura = z.infer<typeof proximaAberturaSchema>;

export const estadoFuncionamentoSchema = z.object({
  // false = a empresa não controla horário: recebe pedidos a qualquer hora (compatibilidade).
  controlado: z.boolean(),
  abertoAgora: z.boolean(),
  // Hora local em que o período atual fecha ("23:00"); null se fechada, sem controle ou aberta 24 h.
  fechaAs: z.string().nullable(),
  proximaAbertura: proximaAberturaSchema.nullable(),
  // A próxima abertura é hoje e a empresa JÁ abriu hoje: é um intervalo ("abre novamente").
  reabreHoje: z.boolean(),
  // Textos prontos, calculados pela mesma regra. `resumo`: uma linha para o topo do cardápio (null sem
  // controle). `aviso`: o porquê de não dar para pedir agora (null quando dá).
  resumo: z.string().nullable(),
  aviso: z.string().nullable(),
});

export type EstadoFuncionamento = z.infer<typeof estadoFuncionamentoSchema>;

// O que o CLIENTE recebe: o estado de agora, o dia de hoje para a empresa e a semana para consulta.
export const funcionamentoPublicoSchema = z.object({
  estado: estadoFuncionamentoSchema,
  hoje: diaDaProgramacaoSchema,
  // Vazio quando a empresa não controla horário.
  semana: z.array(periodoFuncionamentoSchema),
});

export type FuncionamentoPublico = z.infer<typeof funcionamentoPublicoSchema>;

// Visão ADMINISTRATIVA: a configuração inteira (inclusive desligada) e o estado que ela produz agora.
export const funcionamentoEmpresaSchema = z.object({
  ativo: z.boolean(),
  fusoHorario: z.string(),
  periodos: z.array(periodoFuncionamentoSchema),
  estado: estadoFuncionamentoSchema,
  hoje: diaDaProgramacaoSchema,
});

export type FuncionamentoEmpresa = z.infer<typeof funcionamentoEmpresaSchema>;

const diaAnterior = (dia: DiaSemana): DiaSemana => (dia === 1 ? 7 : dia - 1) as DiaSemana;
const doisDigitos = (numero: number) => String(numero).padStart(2, "0");
const horaDosMinutos = (minutos: number) => `${doisDigitos(Math.floor(minutos / 60) % 24)}:${doisDigitos(minutos % 60)}`;

/** Hora como as pessoas dizem: o fechamento "24:00" é mostrado como "00:00". */
export function horaParaExibir(hora: string): string {
  return hora === "24:00" ? "00:00" : hora;
}

function quando(abertura: ProximaAbertura): string {
  if (abertura.diasAFrente === 0) return "hoje";
  if (abertura.diasAFrente === 1) return "amanhã";
  return ROTULO_DIA_SEMANA[abertura.diaSemana].toLowerCase();
}

function textos(estado: Omit<EstadoFuncionamento, "resumo" | "aviso">): Pick<EstadoFuncionamento, "resumo" | "aviso"> {
  if (!estado.controlado) return { resumo: null, aviso: null };
  if (estado.abertoAgora) return { resumo: estado.fechaAs ? `Aberto agora · até ${horaParaExibir(estado.fechaAs)}` : "Aberto agora · 24 horas", aviso: null };
  const abertura = estado.proximaAbertura;
  if (!abertura) return { resumo: "Fechado", aviso: "Esta empresa está fechada agora e não informou quando volta a receber pedidos." };
  return {
    resumo: `Fechado · abre ${quando(abertura)} às ${abertura.hora}`,
    aviso: `Esta empresa está fechada agora. ${estado.reabreHoje ? `Abre novamente hoje às ${abertura.hora}.` : `Abre ${quando(abertura)} às ${abertura.hora}.`}`,
  };
}

/**
 * A REGRA CENTRAL: a empresa está recebendo pedidos NESTE instante? Se não, quando volta?
 *
 * `instante` é o relógio do SERVIDOR; `fusoHorario` é o da empresa. Aberta = existe um período de
 * hoje em andamento, ou um de ONTEM que atravessou a meia-noite e ainda não fechou. A próxima
 * abertura é o início de período mais próximo à frente, procurado na semana inteira (de domingo
 * passa para segunda sem caso especial).
 */
export function calcularFuncionamento(
  configuracao: { ativo: boolean; periodos: readonly PeriodoFuncionamento[] },
  instante: Date,
  fusoHorario: string,
): { estado: EstadoFuncionamento; hoje: DiaSemana } {
  const local = horarioLocal(instante, fusoHorario);
  const hoje = local.diaSemana;
  if (!configuracao.ativo) {
    return { hoje, estado: { controlado: false, abertoAgora: true, fechaAs: null, proximaAbertura: null, reabreHoje: false, resumo: null, aviso: null } };
  }

  const minuto = minutosDoDia(local.hora);
  const agoraNaSemana = (hoje - 1) * MINUTOS_DO_DIA + minuto;
  const { periodos } = configuracao;

  const emAndamento = periodos.find((periodo) => {
    const inicio = minutosDoDia(periodo.inicio);
    const fim = minutosDoDia(periodo.fim);
    if (periodo.diaSemana === hoje) return periodoAtravessaMeiaNoite(periodo) ? minuto >= inicio : inicio <= minuto && minuto < fim;
    // Período de ontem que passou da meia-noite: vale até a hora de fechar.
    return periodo.diaSemana === diaAnterior(hoje) && periodoAtravessaMeiaNoite(periodo) && minuto < fim;
  });

  if (emAndamento) {
    /*
     * Fecha quando o período termina — ou, se outro começa exatamente nessa hora (23:00–24:00 seguido
     * de 00:00–02:00), quando a sequência termina. Uma semana inteira emendada é "24 horas".
     */
    let fechaNaSemana = (inicioNaSemana(emAndamento) + duracao(emAndamento)) % MINUTOS_DA_SEMANA;
    let emendas = 0;
    for (; emendas < periodos.length; emendas += 1) {
      const seguinte = periodos.find((periodo) => periodo !== emAndamento && inicioNaSemana(periodo) === fechaNaSemana);
      if (!seguinte) break;
      fechaNaSemana = (fechaNaSemana + duracao(seguinte)) % MINUTOS_DA_SEMANA;
    }
    // Emendou em todos os outros períodos e voltou ao começo: não fecha nunca.
    const semFim = emendas >= periodos.length - 1 && fechaNaSemana === inicioNaSemana(emAndamento);
    const base = { controlado: true, abertoAgora: true, fechaAs: semFim ? null : horaDosMinutos(fechaNaSemana % MINUTOS_DO_DIA), proximaAbertura: null, reabreHoje: false };
    return { hoje, estado: { ...base, ...textos(base) } };
  }

  let proxima: { periodo: PeriodoFuncionamento; espera: number } | null = null;
  for (const periodo of periodos) {
    const espera = (inicioNaSemana(periodo) - agoraNaSemana + MINUTOS_DA_SEMANA) % MINUTOS_DA_SEMANA;
    if (espera > 0 && (!proxima || espera < proxima.espera)) proxima = { periodo, espera };
  }

  const proximaAbertura: ProximaAbertura | null = proxima
    ? { diaSemana: proxima.periodo.diaSemana, hora: proxima.periodo.inicio, diasAFrente: Math.floor((minuto + proxima.espera) / MINUTOS_DO_DIA) }
    : null;
  // "Abre novamente": a próxima abertura é hoje e algum período de hoje (ou a sobra de ontem) já passou.
  const jaAbriuHoje = periodos.some(
    (periodo) =>
      (periodo.diaSemana === hoje && minutosDoDia(periodo.inicio) < minuto) ||
      (periodo.diaSemana === diaAnterior(hoje) && periodoAtravessaMeiaNoite(periodo) && minutosDoDia(periodo.fim) <= minuto),
  );
  const base = { controlado: true, abertoAgora: false, fechaAs: null, proximaAbertura, reabreHoje: proximaAbertura?.diasAFrente === 0 && jaAbriuHoje };
  return { hoje, estado: { ...base, ...textos(base) } };
}

/** Os períodos de um dia, na ordem em que acontecem. */
export function periodosDoDia(periodos: readonly PeriodoFuncionamento[], dia: DiaSemana): PeriodoFuncionamento[] {
  return periodos.filter((periodo) => periodo.diaSemana === dia).sort((a, b) => minutosDoDia(a.inicio) - minutosDoDia(b.inicio));
}

/** "08:00–14:00 · 18:00–02:00" — ou "Fechado" para o dia sem período. */
export function horariosDoDiaEmTexto(periodos: readonly PeriodoFuncionamento[], dia: DiaSemana): string {
  const doDia = periodosDoDia(periodos, dia);
  if (doDia.length === 0) return "Fechado";
  return doDia.map((periodo) => `${periodo.inicio}–${horaParaExibir(periodo.fim)}`).join(" · ");
}
