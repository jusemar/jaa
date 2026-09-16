import * as z from "zod";
import { coordenadasSchema, latitudeSchema, longitudeSchema, ufSchema } from "../enderecos/endereco.ts";
import { participanteConversaSchema } from "../conversas/conversa.ts";
import { statusEntregadorSchema } from "./entregador.ts";

/*
 * BASE OPERACIONAL da empresa, PRESENÇA do entregador e FILA automática.
 *
 * Três conceitos diferentes, que nunca se confundem:
 * - VÍNCULO (`status`): a empresa autoriza aquela pessoa a entregar para ela;
 * - DISPONIBILIDADE (`disponivel`): a pessoa aceita receber trabalho DAQUELA empresa;
 * - PRESENÇA (`naBase`): a localização confirma que ela está fisicamente na base.
 * Só ATIVO + ACEITANDO + NA BASE + APTO entra na fila daquela empresa.
 */

export const RAIO_BASE_PADRAO_METROS = 150;
export const RAIO_BASE_MINIMO_METROS = 30;
export const RAIO_BASE_MAXIMO_METROS = 2000;

// Endereço textual da base: mesmas regras do endereço do cliente (o mapa nunca corrige o texto).
const textoObrigatorio = (maximo: number, mensagem: string) => z.string().trim().min(1, mensagem).max(maximo);
const textoOpcional = (maximo: number) =>
  z
    .string()
    .trim()
    .max(maximo)
    .transform((valor) => (valor === "" ? null : valor))
    .nullable()
    .default(null);

export const cepBaseSchema = z
  .string()
  .trim()
  .transform((valor) => valor.replace(/\D/g, ""))
  .pipe(z.string().regex(/^\d{8}$/, "CEP deve ter 8 dígitos."));

const camposBase = {
  cep: cepBaseSchema,
  logradouro: textoObrigatorio(120, "Informe o logradouro."),
  numero: textoObrigatorio(20, "Informe o número (ou S/N)."),
  complemento: textoOpcional(60),
  bairro: textoObrigatorio(80, "Informe o bairro."),
  cidade: textoObrigatorio(80, "Informe a cidade."),
  uf: ufSchema,
  pontoReferencia: textoOpcional(160),
  // Área da base (não é região de entrega): usada só para detectar presença.
  raioMetros: z.number().int().min(RAIO_BASE_MINIMO_METROS).max(RAIO_BASE_MAXIMO_METROS).default(RAIO_BASE_PADRAO_METROS),
};

export const salvarBaseEntradaSchema = z.object(camposBase);

export type SalvarBaseEntrada = z.input<typeof salvarBaseEntradaSchema>;

// Confirmação explícita do ponto da base (como no endereço do cliente).
export const confirmarPontoBaseEntradaSchema = coordenadasSchema;

export const baseEmpresaSchema = z.object({
  ...camposBase,
  complemento: z.string().nullable(),
  pontoReferencia: z.string().nullable(),
  raioMetros: z.number().int(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  localizacaoConfirmadaEm: z.iso.datetime().nullable(),
  atualizadoEm: z.iso.datetime(),
});

export type BaseEmpresa = z.infer<typeof baseEmpresaSchema>;

export function baseTemPontoConfirmado(base: Pick<BaseEmpresa, "latitude" | "longitude" | "localizacaoConfirmadaEm"> | null): boolean {
  return base !== null && base.localizacaoConfirmadaEm !== null && base.latitude !== null && base.longitude !== null;
}

/**
 * LEITURA de localização do aparelho do entregador. O cliente manda só o que mediu — nunca
 * "estouNaBase": quem decide presença é o servidor, comparando com o ponto e o raio da base.
 * A leitura é usada e descartada: nenhuma coordenada do entregador é armazenada.
 */
export const LEITURA_VALIDADE_MAXIMA_MS = 2 * 60 * 1000;
export const PRECISAO_MAXIMA_ACEITA_METROS = 200;

export const enviarLocalizacaoEntradaSchema = z.object({
  latitude: latitudeSchema,
  longitude: longitudeSchema,
  // Raio de incerteza informado pelo aparelho; leitura imprecisa demais não confirma presença.
  precisaoMetros: z.number().finite().min(0).max(100000).nullable().optional(),
  medidaEm: z.iso.datetime(),
});

export type EnviarLocalizacaoEntrada = z.input<typeof enviarLocalizacaoEntradaSchema>;

/*
 * ESTADO OPERACIONAL derivado (o que a empresa e o entregador veem):
 * - `indisponivel`: vínculo ativo, mas não está aceitando entregas desta empresa;
 * - `disponivel_fora_base`: aceita trabalho, mas não está na base — não participa da fila;
 * - `disponivel_na_base`: aceita, está na base e apto — participa da fila;
 * - `inapto`: aceita e está na base, mas há pendência operacional a resolver.
 */
export const estadoOperacionalSchema = z.enum(["indisponivel", "disponivel_fora_base", "disponivel_na_base", "inapto"]);

export type EstadoOperacional = z.infer<typeof estadoOperacionalSchema>;

export const ROTULO_ESTADO_OPERACIONAL: Record<EstadoOperacional, string> = {
  indisponivel: "Não aceitando entregas",
  disponivel_fora_base: "Disponível fora da base",
  disponivel_na_base: "Disponível na base",
  inapto: "Com pendência operacional",
};

export function estadoOperacional(entregador: {
  status: z.infer<typeof statusEntregadorSchema>;
  disponivel: boolean;
  naBase: boolean;
  aptoParaSaida: boolean;
}): EstadoOperacional {
  if (entregador.status !== "ativo" || !entregador.disponivel) return "indisponivel";
  if (!entregador.naBase) return "disponivel_fora_base";
  return entregador.aptoParaSaida ? "disponivel_na_base" : "inapto";
}

// Entra na fila da base quem está ativo, aceitando, presente e apto — só isso.
export function participaDaFila(entregador: { status: z.infer<typeof statusEntregadorSchema>; disponivel: boolean; naBase: boolean; aptoParaSaida: boolean }): boolean {
  return estadoOperacional(entregador) === "disponivel_na_base";
}

// Linha da visão operacional da empresa: identidade pública + estado derivado + posição na fila.
export const entregadorOperacionalSchema = z.object({
  id: z.uuid(),
  pessoa: participanteConversaSchema,
  status: statusEntregadorSchema,
  disponivel: z.boolean(),
  naBase: z.boolean(),
  aptoParaSaida: z.boolean(),
  estado: estadoOperacionalSchema,
  // 1, 2, 3… para quem está na fila da base; null para os demais.
  posicaoFila: z.number().int().min(1).nullable(),
  filaEntrouEm: z.iso.datetime().nullable(),
});

export type EntregadorOperacional = z.infer<typeof entregadorOperacionalSchema>;

export const painelOperacionalSchema = z.object({
  // Fila da base, em ordem de chegada (a ordem é do servidor, não se reorganiza à mão).
  fila: z.array(entregadorOperacionalSchema),
  foraDaBase: z.array(entregadorOperacionalSchema),
  indisponiveis: z.array(entregadorOperacionalSchema),
  baseConfigurada: z.boolean(),
});

export type PainelOperacional = z.infer<typeof painelOperacionalSchema>;

/**
 * O que o ENTREGADOR vê de si em cada empresa. Ele não precisa (nem recebe) detalhes dos outros da
 * fila — só quantos estão à frente e qual é a sua posição.
 */
export const situacaoOperacionalSchema = z.object({
  entregadorId: z.uuid(),
  empresa: z.object({ identidadeId: z.uuid(), nome: z.string() }),
  status: statusEntregadorSchema,
  disponivel: z.boolean(),
  naBase: z.boolean(),
  aptoParaSaida: z.boolean(),
  estado: estadoOperacionalSchema,
  posicaoFila: z.number().int().min(1).nullable(),
  totalNaFila: z.number().int().min(0),
  // false quando a empresa ainda não confirmou o ponto da base: não dá para detectar presença.
  baseConfigurada: z.boolean(),
});

export type SituacaoOperacional = z.infer<typeof situacaoOperacionalSchema>;

export const listaSituacoesOperacionaisSchema = z.object({ situacoes: z.array(situacaoOperacionalSchema) });

export type ListaSituacoesOperacionais = z.infer<typeof listaSituacoesOperacionaisSchema>;

export function rotuloSituacaoEntregador(situacao: SituacaoOperacional): string {
  if (situacao.posicaoFila !== null) return `Você é o ${situacao.posicaoFila}º da fila da base`;
  if (situacao.estado === "disponivel_fora_base") return "Disponível para chamados, mas fora da fila da base";
  return ROTULO_ESTADO_OPERACIONAL[situacao.estado];
}
