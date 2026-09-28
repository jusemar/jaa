import * as z from "zod";
import { coordenadasSchema, criarEnderecoEntradaSchema } from "../enderecos/endereco.ts";
import { profissionalEncontradoSchema } from "./perfil-profissional.ts";

/*
 * BUSCA DE PROFISSIONAIS ("Pesquisar no Jaa" sem @).
 *
 * 1. INTENÇÃO: o texto é resolvido no dicionário de termos (nunca nos perfis) em intenções
 *    ESTRUTURADAS — atividade + (especialidade | opção). Ambíguo ("moto") = várias intenções, e quem
 *    escolhe é a pessoa: o Jaa não decide em silêncio.
 * 2. LOCAL DA PESQUISA: um ponto confirmado no mapa (local já cadastrado, endereço digitado ou GPS).
 *    É PARÂMETRO da consulta, não é cadastro nem "base" — nada é gravado.
 * 3. MATCHING: a base do profissional dentro do RAIO da pesquisa E uma área de atuação dele que
 *    cubra o ponto. Resultado paginado, só com dados públicos (`profissionalEncontradoSchema`).
 */

export const intencaoProfissionalSchema = z.object({
  servicoId: z.uuid(),
  especialidadeId: z.uuid().nullable(),
  opcaoId: z.uuid().nullable(),
  // "Entregador · Moto", "Cabeleireiro · Corte masculino", "Mototáxi".
  rotulo: z.string(),
  // true = o texto corresponde exatamente a um termo desta intenção (grafia normalizada).
  exata: z.boolean(),
});

export type IntencaoProfissional = z.infer<typeof intencaoProfissionalSchema>;

export const respostaIntencoesProfissionaisSchema = z.object({ intencoes: z.array(intencaoProfissionalSchema) });

export type RespostaIntencoesProfissionais = z.infer<typeof respostaIntencoesProfissionaisSchema>;

// Raios oferecidos na busca (km). "Até X km" é distância geográfica, não de rota.
export const RAIOS_BUSCA_PROFISSIONAIS_KM = [5, 10, 20, 30, 50] as const;
export const RAIO_BUSCA_PROFISSIONAIS_PADRAO_KM = 10;
export const TAMANHO_PAGINA_BUSCA_PROFISSIONAIS = 20;
// Teto de páginas: a busca nunca vira listagem ilimitada (distribuição ampla é das Oportunidades).
export const MAXIMO_PAGINAS_BUSCA_PROFISSIONAIS = 10;

const inteiroDaUrl = z.coerce.number().int();

// Chega como query string: números convertidos e validados aqui.
export const buscarProfissionaisEntradaSchema = z
  .object({
    servicoId: z.uuid(),
    especialidadeId: z.uuid().optional(),
    opcaoId: z.uuid().optional(),
    latitude: z.coerce.number().pipe(coordenadasSchema.shape.latitude),
    longitude: z.coerce.number().pipe(coordenadasSchema.shape.longitude),
    raioKm: inteiroDaUrl.refine((km) => (RAIOS_BUSCA_PROFISSIONAIS_KM as readonly number[]).includes(km), "Raio inválido: use 5, 10, 20, 30 ou 50 km."),
    pagina: inteiroDaUrl.min(0).max(MAXIMO_PAGINAS_BUSCA_PROFISSIONAIS - 1).default(0),
  })
  .strict();

export type BuscarProfissionaisEntrada = z.input<typeof buscarProfissionaisEntradaSchema>;

export const paginaProfissionaisEncontradosSchema = z.object({
  itens: z.array(profissionalEncontradoSchema),
  pagina: z.number().int().min(0),
  temMais: z.boolean(),
});

export type PaginaProfissionaisEncontrados = z.infer<typeof paginaProfissionaisEncontradosSchema>;

// Endereço digitado só para LOCALIZAR o ponto da pesquisa (palpite para abrir o mapa). Não é salvo.
export const localizarEnderecoPesquisaEntradaSchema = criarEnderecoEntradaSchema.pick({
  cep: true,
  logradouro: true,
  numero: true,
  bairro: true,
  cidade: true,
  uf: true,
});

export type LocalizarEnderecoPesquisaEntrada = z.input<typeof localizarEnderecoPesquisaEntradaSchema>;
