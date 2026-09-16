// Horário exibido em cada mensagem, sempre a partir do `criadoEm` persistido pelo servidor.
// Separadores por dia ("Hoje", "Ontem", data) poderão usar `mesmoDia` sem mudar este formato.

export function mesmoDia(a: Date, b: Date, fusoHorario?: string): boolean {
  const dia = new Intl.DateTimeFormat("pt-BR", { timeZone: fusoHorario, year: "numeric", month: "2-digit", day: "2-digit" });
  return dia.format(a) === dia.format(b);
}

export function formatarHorarioMensagem(iso: string, { agora = new Date(), fusoHorario }: { agora?: Date; fusoHorario?: string } = {}): string {
  const data = new Date(iso);
  const hora = new Intl.DateTimeFormat("pt-BR", { timeZone: fusoHorario, hour: "2-digit", minute: "2-digit" }).format(data);
  if (mesmoDia(data, agora, fusoHorario)) return hora;
  const dia = new Intl.DateTimeFormat("pt-BR", { timeZone: fusoHorario, day: "2-digit", month: "2-digit", year: "2-digit" }).format(data);
  return `${dia} ${hora}`;
}

// Data e hora completas, para dica (title) acessível.
export function formatarDataHoraCompleta(iso: string, fusoHorario?: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: fusoHorario, dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
}
