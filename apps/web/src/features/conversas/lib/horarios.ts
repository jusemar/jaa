// Horário exibido em cada mensagem, sempre a partir do `criadoEm` persistido pelo servidor.
// O separador por dia da conversa ("Hoje", "Ontem", data) usa `mesmoDia`, sem mudar este formato.

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

/**
 * Rótulo do separador de dia entre as mensagens: "Hoje", "Ontem" ou a data.
 *
 * Existe porque uma conversa longa sem marcos vira um bloco só — a pessoa perde a noção de quando
 * cada coisa foi dita. É texto, não posição: continua legível em leitor de tela.
 */
export function rotuloDoDia(iso: string, { agora = new Date(), fusoHorario }: { agora?: Date; fusoHorario?: string } = {}): string {
  const data = new Date(iso);
  if (mesmoDia(data, agora, fusoHorario)) return "Hoje";

  const ontem = new Date(agora.getTime() - 24 * 60 * 60 * 1000);
  if (mesmoDia(data, ontem, fusoHorario)) return "Ontem";

  return new Intl.DateTimeFormat("pt-BR", { timeZone: fusoHorario, day: "2-digit", month: "long", year: "numeric" }).format(data);
}
