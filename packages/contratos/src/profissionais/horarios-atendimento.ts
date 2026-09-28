import * as z from "zod";

/*
 * HORÁRIOS DE ATENDIMENTO de cada SERVIÇO do perfil profissional: uma grade semanal com zero ou mais
 * períodos por dia (08:00–12:00 + 14:00–18:00 é normal). É daqui que sai a disponibilidade — não existe
 * classificação de serviço "imediato" nem booleano global "disponível agora".
 *
 * Dia sem período = não atende naquele dia. Trabalhar 24 h é só configurar 00:00–24:00; não há opção
 * especial. A futura AGENDA (opcional, por serviço: `permiteAgendamento`) usa esta mesma grade como
 * base — não existe uma segunda grade.
 *
 * Horários são LOCAIS do profissional: um instante é convertido pelo `fusoHorario` do perfil antes de
 * comparar (nunca UTC como se fosse horário comercial).
 */

// ISO 8601: 1 = segunda … 7 = domingo (o mesmo que `extract(isodow …)` do PostgreSQL).
export const DIAS_SEMANA = [1, 2, 3, 4, 5, 6, 7] as const;

export type DiaSemana = (typeof DIAS_SEMANA)[number];

export const diaSemanaSchema = z
  .number()
  .int()
  .min(1, "Dia da semana de 1 (segunda) a 7 (domingo).")
  .max(7, "Dia da semana de 1 (segunda) a 7 (domingo).");

// "HH:MM" em minutos inteiros. Início vai até 23:59; fim pode ser 24:00 (fim do dia).
const HORA_INICIO = /^([01]\d|2[0-3]):[0-5]\d$/;
const HORA_FIM = /^(([01]\d|2[0-3]):[0-5]\d|24:00)$/;

export const horaSchema = z.string().regex(HORA_FIM, "Horário no formato HH:MM.");

export function minutosDoDia(hora: string): number {
  const [horas, minutos] = hora.split(":").map(Number);
  return (horas ?? 0) * 60 + (minutos ?? 0);
}

export const periodoAtendimentoSchema = z
  .object({
    diaSemana: diaSemanaSchema,
    inicio: z.string().regex(HORA_INICIO, "Início no formato HH:MM (até 23:59)."),
    fim: z.string().regex(HORA_FIM, "Fim no formato HH:MM (até 24:00)."),
  })
  .refine((periodo) => minutosDoDia(periodo.inicio) < minutosDoDia(periodo.fim), "O início precisa ser antes do fim.");

export type PeriodoAtendimento = z.infer<typeof periodoAtendimentoSchema>;

/** Dois períodos do MESMO dia se cruzam? Encostar (12:00 fim, 12:00 início) não é sobrepor. */
export function periodosSeSobrepoem(periodos: PeriodoAtendimento[]): boolean {
  return periodos.some((a, indice) =>
    periodos.slice(indice + 1).some(
      (b) => a.diaSemana === b.diaSemana && minutosDoDia(a.inicio) < minutosDoDia(b.fim) && minutosDoDia(b.inicio) < minutosDoDia(a.fim),
    ),
  );
}

export const MAXIMO_PERIODOS_POR_SERVICO = 42;

// A grade INTEIRA do serviço (substitui a anterior). Lista vazia = não atende em dia nenhum.
export const horariosAtendimentoEntradaSchema = z.object({
  periodos: z
    .array(periodoAtendimentoSchema)
    .max(MAXIMO_PERIODOS_POR_SERVICO)
    .refine((periodos) => !periodosSeSobrepoem(periodos), "Horários sobrepostos."),
});

export type HorariosAtendimentoEntrada = z.input<typeof horariosAtendimentoEntradaSchema>;

/** Grade criada automaticamente com o serviço: segunda a sexta, 08:00–18:00; sábado e domingo sem atendimento. */
export const HORARIOS_ATENDIMENTO_PADRAO: readonly PeriodoAtendimento[] = [1, 2, 3, 4, 5].map((diaSemana) => ({
  diaSemana,
  inicio: "08:00",
  fim: "18:00",
}));

/* ---------- Fuso horário ---------- */

/**
 * Fuso inicial do perfil (o Jaa começa no Brasil). É um DADO do perfil, não uma constante espalhada:
 * profissional em outro fuso (ex.: Manaus) passa a ter o seu.
 */
export const FUSO_HORARIO_PADRAO = "America/Sao_Paulo";

export function fusoHorarioValido(fuso: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: fuso });
    return fuso.includes("/") || fuso === "UTC";
  } catch {
    return false;
  }
}

export const fusoHorarioSchema = z.string().trim().min(1).max(64).refine(fusoHorarioValido, "Fuso horário inválido (use um nome IANA, ex.: America/Sao_Paulo).");

const DIA_POR_NOME: Record<string, DiaSemana> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** Dia da semana e hora LOCAIS de um instante, no fuso informado. */
export function horarioLocal(instante: Date, fuso: string): { diaSemana: DiaSemana; hora: string } {
  const partes = new Intl.DateTimeFormat("en-US", { timeZone: fuso, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(instante);
  const parte = (tipo: string) => partes.find((item) => item.type === tipo)?.value ?? "";
  const diaSemana = DIA_POR_NOME[parte("weekday")];
  if (!diaSemana) throw new Error("Dia da semana não reconhecido.");
  return { diaSemana, hora: `${parte("hour")}:${parte("minute")}` };
}

/** O serviço atende neste instante? Mesma regra do SQL do matching: início ≤ hora < fim. */
export function atendeNoInstante(periodos: PeriodoAtendimento[], instante: Date, fuso: string): boolean {
  const { diaSemana, hora } = horarioLocal(instante, fuso);
  const minuto = minutosDoDia(hora);
  return periodos.some((periodo) => periodo.diaSemana === diaSemana && minutosDoDia(periodo.inicio) <= minuto && minuto < minutosDoDia(periodo.fim));
}
