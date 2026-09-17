import * as z from "zod";
import { latitudeSchema, longitudeSchema } from "../enderecos/endereco.ts";
import { filaDoPedidoSchema } from "./saida.ts";

/*
 * RASTREAMENTO DO ENTREGADOR durante uma SAÍDA EM ANDAMENTO.
 *
 * Três regras que sustentam tudo aqui:
 * - só existe rastreamento DENTRO da operação: saída iniciada, dela, dele. Terminou, acabou;
 * - GPS e roteamento são responsabilidades SEPARADAS: posição chegando não chama provedor de rotas;
 * - o servidor decide quem recebe. O cliente só vê o entregador quando a entrega dele é a atual.
 */

/**
 * POLÍTICA DE ENVIO (mesma no aparelho e no servidor). São valores iniciais para entrega urbana,
 * centralizados para ajuste com teste em aparelho real — nunca regra rígida espalhada pelo código.
 */
export const POLITICA_RASTREAMENTO = {
  // Alvo: uma atualização útil a cada 10–20 s enquanto há movimento.
  intervaloMinimoMs: 10_000,
  // Mesmo parado, manda sinal de vida neste intervalo (a tela precisa saber que ainda está vivo).
  intervaloMaximoMs: 20_000,
  // Abaixo disso é a mesma esquina: não gasta bateria, rede nem escrita no banco.
  distanciaMinimaMetros: 30,
  // Leitura pior que isto não posiciona ninguém num mapa de rua com honestidade.
  precisaoMaximaMetros: 100,
  // Depois disso a posição é velha: a interface avisa em vez de fingir que é a de agora.
  validadeMs: 60_000,
  // Leitura capturada há muito tempo não vale mais como "posição atual" da operação.
  idadeMaximaMs: 5 * 60_000,
  // Relógio do aparelho adiantado: toleramos pouco e nunca aceitamos futuro largo.
  toleranciaFuturoMs: 60_000,
  // Fila offline curta: o que interessa é a posição ATUAL, não a trilha do que já passou.
  maximoPendentes: 5,
} as const;

// Os valores acima são o PADRÃO, não o contrato: o tipo aceita qualquer número para que a política
// possa ser ajustada (testes, e futuramente configuração por operação) sem trocar de tipo.
export type PoliticaRastreamento = { -readonly [Chave in keyof typeof POLITICA_RASTREAMENTO]: number };

/** O que o aparelho MEDIU. Nunca "estou entregando": quem valida a operação é o servidor. */
export const enviarPosicaoEntradaSchema = z.object({
  latitude: latitudeSchema,
  longitude: longitudeSchema,
  precisaoMetros: z.number().finite().min(0).max(100_000).nullable().optional(),
  // Só quando o aparelho realmente fornece — nada é inventado para preencher o contrato.
  velocidadeMetrosPorSegundo: z.number().finite().min(0).max(120).nullable().optional(),
  direcaoGraus: z.number().finite().min(0).max(360).nullable().optional(),
  capturadaEm: z.iso.datetime(),
});

export type EnviarPosicaoEntrada = z.input<typeof enviarPosicaoEntradaSchema>;

/**
 * Posição operacional ATUAL de uma saída (a última válida conhecida). Não é trilha: o Jaa guarda o
 * ponto atual, não o caminho percorrido — histórico de percurso continua fora de escopo.
 */
export const posicaoEntregadorSchema = z.object({
  saidaId: z.uuid(),
  latitude: z.number(),
  longitude: z.number(),
  precisaoMetros: z.number().nullable(),
  velocidadeMetrosPorSegundo: z.number().nullable(),
  direcaoGraus: z.number().nullable(),
  // Quando o APARELHO capturou (é o que diz se a posição é recente) e quando o servidor recebeu.
  capturadaEm: z.iso.datetime(),
  recebidaEm: z.iso.datetime(),
});

export type PosicaoEntregador = z.infer<typeof posicaoEntregadorSchema>;

export const listaPosicoesSchema = z.object({ posicoes: z.array(posicaoEntregadorSchema) });

export type ListaPosicoes = z.infer<typeof listaPosicoesSchema>;

// Consulta da posição atual de UMA saída (reconexão da empresa ou do próprio entregador).
export const respostaPosicaoSaidaSchema = z.object({ posicao: posicaoEntregadorSchema.nullable() });

export type RespostaPosicaoSaida = z.infer<typeof respostaPosicaoSaidaSchema>;

/**
 * O que o CLIENTE pode saber: a fila derivada de sempre e — SOMENTE quando a entrega dele é a parada
 * atual — a posição do entregador. Nunca os destinos, coordenadas, nomes ou ids das outras paradas.
 */
export const acompanhamentoPedidoSchema = z.object({
  fila: filaDoPedidoSchema,
  // null enquanto não é a vez dele, quando não há saída em andamento ou quando não há posição válida.
  posicaoEntregador: z
    .object({
      latitude: z.number(),
      longitude: z.number(),
      capturadaEm: z.iso.datetime(),
    })
    .nullable(),
});

export type AcompanhamentoPedido = z.infer<typeof acompanhamentoPedidoSchema>;

/* ---------- Regras puras, iguais no aparelho, no servidor e na interface ---------- */

// Distância aproximada (equirretangular): suficiente para decidir "andou o bastante?".
export function distanciaAproximadaMetros(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const raioTerraMetros = 6_371_000;
  const paraRadianos = (grau: number) => (grau * Math.PI) / 180;
  const x = paraRadianos(b.longitude - a.longitude) * Math.cos(paraRadianos((a.latitude + b.latitude) / 2));
  const y = paraRadianos(b.latitude - a.latitude);
  return Math.sqrt(x * x + y * y) * raioTerraMetros;
}

export interface LeituraGps {
  latitude: number;
  longitude: number;
  precisaoMetros?: number | null | undefined;
  capturadaEm: Date;
}

export type DecisaoEnvio =
  | { enviar: true; motivo: "primeira" | "moveu" | "sinal-de-vida" }
  | { enviar: false; motivo: "imprecisa" | "parado" | "cedo-demais" };

/**
 * Decide se UMA leitura merece virar requisição. Testável sem GPS físico: é função pura.
 * Descarta leitura imprecisa, ignora quem não saiu do lugar e respeita o intervalo mínimo —
 * mas garante o "sinal de vida" quando o intervalo máximo passa, para a tela não parecer travada.
 */
export function decidirEnvioDePosicao(
  anterior: LeituraGps | null,
  nova: LeituraGps,
  politica: PoliticaRastreamento = POLITICA_RASTREAMENTO,
): DecisaoEnvio {
  if (nova.precisaoMetros !== null && nova.precisaoMetros !== undefined && nova.precisaoMetros > politica.precisaoMaximaMetros) {
    return { enviar: false, motivo: "imprecisa" };
  }
  if (!anterior) return { enviar: true, motivo: "primeira" };

  const intervalo = nova.capturadaEm.getTime() - anterior.capturadaEm.getTime();
  if (intervalo >= politica.intervaloMaximoMs) return { enviar: true, motivo: "sinal-de-vida" };
  if (intervalo < politica.intervaloMinimoMs) return { enviar: false, motivo: "cedo-demais" };

  return distanciaAproximadaMetros(anterior, nova) >= politica.distanciaMinimaMetros
    ? { enviar: true, motivo: "moveu" }
    : { enviar: false, motivo: "parado" };
}

/** Posição recente = dá para mostrar como "onde ele está"; fora disso, a interface avisa. */
export function posicaoEstaRecente(
  posicao: Pick<PosicaoEntregador, "capturadaEm"> | null,
  agora: Date = new Date(),
  politica: PoliticaRastreamento = POLITICA_RASTREAMENTO,
): boolean {
  if (!posicao) return false;
  return agora.getTime() - new Date(posicao.capturadaEm).getTime() <= politica.validadeMs;
}

/** Texto honesto sobre a idade da posição — nunca apresentar coordenada antiga como se fosse atual. */
export function rotuloUltimaPosicao(posicao: Pick<PosicaoEntregador, "capturadaEm"> | null, agora: Date = new Date()): string {
  if (!posicao) return "Localização indisponível";
  const segundos = Math.max(0, Math.round((agora.getTime() - new Date(posicao.capturadaEm).getTime()) / 1000));
  if (segundos < 60) return `Última atualização há ${segundos} s`;
  const minutos = Math.round(segundos / 60);
  if (minutos < 60) return `Última atualização há ${minutos} min`;
  return "Localização temporariamente indisponível";
}

/*
 * Situação do rastreamento no APARELHO. Existe para a interface ser honesta com o entregador: o
 * sistema operacional pode negar, limitar ou interromper o rastreamento, e o Jaa não promete o que
 * não depende dele.
 */
export const situacaoRastreamentoSchema = z.enum([
  // Não há saída em andamento: por decisão de produto, ninguém é rastreado fora da operação.
  "sem_operacao",
  "permissao_negada",
  // Só em primeiro plano: funciona com o app aberto; com a tela bloqueada, não.
  "somente_primeiro_plano",
  "gps_desligado",
  "ativo",
  // Últimas leituras foram descartadas (imprecisas) ou o envio está falhando.
  "degradado",
]);

export type SituacaoRastreamento = z.infer<typeof situacaoRastreamentoSchema>;

export const ROTULO_SITUACAO_RASTREAMENTO: Record<SituacaoRastreamento, string> = {
  sem_operacao: "Sem saída em andamento — sua localização não está sendo usada.",
  permissao_negada: "Permissão de localização negada: a empresa não consegue acompanhar a entrega.",
  somente_primeiro_plano: "Localização só com o app aberto. Para continuar com a tela bloqueada, permita o acesso o tempo todo.",
  gps_desligado: "Ative a localização do aparelho para acompanhar a entrega.",
  ativo: "Localização ativa durante esta saída.",
  degradado: "Sinal fraco: a última posição pode demorar a atualizar.",
};
