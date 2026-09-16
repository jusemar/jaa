import * as z from "zod";
import { coordenadasSchema } from "../enderecos/endereco.ts";

/*
 * ROTA DA SAÍDA: o resultado do motor de rotas do Jaa para uma saída.
 *
 * Dois conceitos que NÃO se confundem:
 * - SEQUÊNCIA (ordem das paradas): continua sendo SUGESTÃO, e o entregador pode mudar;
 * - PERCURSO (geometria, distância e duração pelas ruas): vem do provedor, para a ordem que valer.
 *
 * O domínio não conhece fornecedor: fala em origem, paradas, percurso e estado do cálculo. Mapbox é
 * só a primeira implementação, trocável sem mexer em pedidos, saídas ou zonas.
 */

export const estadoRotaSchema = z.enum([
  // Geometria, distância e duração vieram do provedor para a ordem atual da saída.
  "percurso_real",
  // Sem provedor utilizável: a ordem é a aproximação determinística local e NÃO há números nem traçado.
  "aproximacao_local",
]);

export type EstadoRota = z.infer<typeof estadoRotaSchema>;

/** Por que o Jaa não usou (ou não pôde usar) o provedor. Fica registrado, nunca escondido. */
export const motivoFallbackRotaSchema = z.enum([
  "provedor_nao_configurado",
  "provedor_indisponivel",
  "resposta_invalida",
  // Mais paradas do que o provedor aceita: nada é truncado, a operação segue na aproximação local.
  "capacidade_excedida",
  // A empresa ainda não confirmou o ponto da base: sem origem não há rota real.
  "sem_base_confirmada",
]);

export type MotivoFallbackRota = z.infer<typeof motivoFallbackRotaSchema>;

export const ROTULO_MOTIVO_FALLBACK: Record<MotivoFallbackRota, string> = {
  provedor_nao_configurado: "Cálculo de rota não configurado.",
  provedor_indisponivel: "O serviço de rotas não respondeu.",
  resposta_invalida: "O serviço de rotas devolveu uma resposta inesperada.",
  capacidade_excedida: "Esta saída tem mais paradas do que o serviço de rotas aceita.",
  sem_base_confirmada: "Confirme o ponto da base para calcular o percurso.",
};

export const rotaDaSaidaSchema = z.object({
  estado: estadoRotaSchema,
  motivoFallback: motivoFallbackRotaSchema.nullable(),
  // Nome curto do provedor que calculou (ex.: "mapbox"); null quando foi a aproximação local.
  provedor: z.string().nullable(),
  /*
   * Origem SNAPSHOT: o ponto da base no momento em que a saída foi planejada. A empresa pode mudar a
   * base depois; a saída já planejada continua descrevendo de onde ela realmente partiu.
   */
  origem: coordenadasSchema.nullable(),
  // true quando a ORDEM das paradas veio do provedor; false quando veio da aproximação local.
  sequenciaDoProvedor: z.boolean(),
  // Traçado pelas ruas, para desenhar no mapa. Nunca é inventado: ou vem do provedor, ou é null.
  geometria: z.array(coordenadasSchema).nullable(),
  distanciaMetros: z.number().int().min(0).nullable(),
  // Duração do PERCURSO estimada pelo provedor. NÃO é previsão de entrega ao cliente.
  duracaoSegundos: z.number().int().min(0).nullable(),
  calculadaEm: z.iso.datetime().nullable(),
  // Versão da sequência para a qual este percurso vale (a sequência mudou → o percurso envelheceu).
  versaoSequencia: z.number().int().min(1),
});

export type RotaDaSaida = z.infer<typeof rotaDaSaidaSchema>;

export function rotaTemPercursoReal(rota: RotaDaSaida | null): boolean {
  return rota !== null && rota.estado === "percurso_real" && rota.geometria !== null && rota.geometria.length > 1;
}

/** O percurso foi calculado para a ordem que está valendo agora? (reordenar envelhece a rota) */
export function rotaCobreSequenciaAtual(rota: RotaDaSaida | null, versaoSequenciaAtual: number): boolean {
  return rota !== null && rota.versaoSequencia === versaoSequenciaAtual;
}

export function formatarDistanciaRota(distanciaMetros: number): string {
  return distanciaMetros < 1000 ? `${Math.round(distanciaMetros)} m` : `${(distanciaMetros / 1000).toFixed(1).replace(".", ",")} km`;
}

/**
 * Duração do percurso, sempre rotulada como percurso — e nunca como previsão de entrega: ela não
 * inclui preparo, espera na porta, fila de entregas nem trânsito no momento real da saída.
 */
export function formatarDuracaoPercurso(duracaoSegundos: number): string {
  const minutos = Math.max(1, Math.round(duracaoSegundos / 60));
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`;
}

/**
 * Texto honesto sobre o que o Jaa tem. Com percurso real, dizemos que o trajeto foi calculado pelas
 * ruas; sem ele, dizemos que é uma sugestão aproximada — nunca "melhor rota" ou "rota mais rápida".
 */
export function rotuloRota(rota: RotaDaSaida | null, versaoSequenciaAtual: number): string {
  if (!rota) return "Sequência sugerida pelo Jaa";
  if (!rotaCobreSequenciaAtual(rota, versaoSequenciaAtual)) return "Sequência alterada: percurso será recalculado";
  if (rota.estado !== "percurso_real" || rota.distanciaMetros === null || rota.duracaoSegundos === null) {
    return "Sequência sugerida pelo Jaa (sem cálculo de percurso)";
  }
  return `Percurso calculado pelas ruas · ${formatarDistanciaRota(rota.distanciaMetros)} · ${formatarDuracaoPercurso(rota.duracaoSegundos)} de trajeto`;
}
