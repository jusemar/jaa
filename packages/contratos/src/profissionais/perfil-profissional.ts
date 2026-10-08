import * as z from "zod";
import { coordenadasSchema, criarEnderecoEntradaSchema } from "../enderecos/endereco.ts";
import { poligonoZonaSchema, zonaTemGeometriaValida } from "../entregas/zonas.ts";
import { fusoHorarioSchema, periodoAtendimentoSchema } from "./horarios-atendimento.ts";

/*
 * MOTOR PROFISSIONAL (Camada 1, sem IA) — contratos do Perfil Profissional.
 *
 * Perfil Profissional é uma capacidade da identidade PESSOAL: nada aqui cria conta, empresa ou
 * identidade nova. Serviço, especialidade e atributo são conceitos distintos e as escolhas pertencem
 * ao SERVIÇO do perfil. Categorias/serviços/opções vêm da API (dados), nunca de listas no frontend.
 */

/**
 * Limites da PRIMEIRA versão. Ficam num lugar só para que o futuro Gestor da Plataforma os torne
 * configuráveis sem mudar banco nem regras espalhadas.
 */
export const LIMITES_PERFIL_PROFISSIONAL = {
  maximoServicos: 3,
  // Áreas ATIVAS: desativadas continuam salvas e não ocupam vaga.
  maximoAreas: 5,
  raioMaximoMetros: 50_000,
  maximoEspecialidadesPorServico: 20,
  maximoOpcoesPorServico: 30,
  maximoPoligonosPorArea: 10,
} as const;

export const codigoIbgeMunicipioSchema = z.string().regex(/^\d{7}$/, "Código IBGE do município deve ter 7 dígitos.");

const idsSemRepeticao = (maximo: number) =>
  z
    .array(z.uuid())
    .max(maximo)
    .refine((ids) => new Set(ids).size === ids.length, "Há itens repetidos.")
    .default([]);

/* ---------- Base profissional ---------- */

// Mesmo endereço textual do cliente (sem apelido) + código IBGE informado pela consulta de CEP.
export const salvarBaseProfissionalEntradaSchema = criarEnderecoEntradaSchema.omit({ apelido: true }).extend({
  codigoIbge: codigoIbgeMunicipioSchema.nullable().default(null),
});

export type SalvarBaseProfissionalEntrada = z.input<typeof salvarBaseProfissionalEntradaSchema>;

/*
 * Ponto da base: só por confirmação explícita no mapa. `baseAtualizadaEm` é a versão do ENDEREÇO a que
 * o ponto se refere (a que a tela mostrava): se o endereço mudou desde então, o servidor recusa — um
 * ponto do endereço A nunca é gravado como confirmação do endereço B.
 */
export const confirmarPontoBaseProfissionalEntradaSchema = coordenadasSchema.extend({
  baseAtualizadaEm: z.iso.datetime().optional(),
});

/* ---------- Serviços do perfil ---------- */

export const servicoDoPerfilEntradaSchema = z.object({
  servicoId: z.uuid(),
  especialidadeIds: idsSemRepeticao(LIMITES_PERFIL_PROFISSIONAL.maximoEspecialidadesPorServico),
  opcaoIds: idsSemRepeticao(LIMITES_PERFIL_PROFISSIONAL.maximoOpcoesPorServico),
});

export type ServicoDoPerfilEntrada = z.input<typeof servicoDoPerfilEntradaSchema>;

export const detalhesServicoDoPerfilEntradaSchema = servicoDoPerfilEntradaSchema.omit({ servicoId: true });

export type DetalhesServicoDoPerfilEntrada = z.input<typeof detalhesServicoDoPerfilEntradaSchema>;

/* ---------- Áreas de atuação ---------- */

export const MODALIDADES_AREA_ATUACAO = ["raio", "poligono", "municipio"] as const;

export type ModalidadeAreaAtuacao = (typeof MODALIDADES_AREA_ATUACAO)[number];

const raioMetrosSchema = z
  .number()
  .int("Raio em metros inteiros.")
  .positive("O raio precisa ser maior que zero.")
  .max(LIMITES_PERFIL_PROFISSIONAL.raioMaximoMetros, "O raio máximo é de 50 km.");

// Um ou mais polígonos (vértices sem repetir o primeiro), no mesmo formato das zonas de entrega.
const poligonosAreaSchema = z
  .array(poligonoZonaSchema)
  .min(1)
  .max(LIMITES_PERFIL_PROFISSIONAL.maximoPoligonosPorArea)
  .refine((poligonos) => poligonos.every(zonaTemGeometriaValida), "Desenho inválido: a área não pode se cruzar.");

const camposComunsArea = {
  nome: z
    .string()
    .trim()
    .max(60)
    .transform((valor) => (valor === "" ? null : valor))
    .nullable()
    .default(null),
  /*
   * Vazio = a área vale para TODOS os serviços do perfil. Com ids = só para esses serviços do perfil
   * (o servidor confere que pertencem ao MESMO perfil).
   */
  servicoPerfilIds: idsSemRepeticao(LIMITES_PERFIL_PROFISSIONAL.maximoServicos),
};

export const areaAtuacaoEntradaSchema = z.discriminatedUnion("modalidade", [
  z.object({
    modalidade: z.literal("raio"),
    // A partir da BASE do perfil, em metros.
    raioMetros: raioMetrosSchema,
    ...camposComunsArea,
  }),
  z.object({
    modalidade: z.literal("poligono"),
    poligonos: poligonosAreaSchema,
    ...camposComunsArea,
  }),
  z.object({
    modalidade: z.literal("municipio"),
    codigoIbge: codigoIbgeMunicipioSchema,
    ...camposComunsArea,
  }),
]);

export type AreaAtuacaoEntrada = z.input<typeof areaAtuacaoEntradaSchema>;

/**
 * Edição de uma área existente (a modalidade não muda: outra modalidade = outra área).
 * `servicoPerfilIds`: ausente = mantém; vazio = todas as atividades; com ids = só essas.
 * `poligonos`: só área desenhada; substitui o desenho com as MESMAS validações da criação.
 */
export const editarAreaAtuacaoEntradaSchema = z
  .object({
    ativa: z.boolean().optional(),
    raioMetros: raioMetrosSchema.optional(),
    poligonos: poligonosAreaSchema.optional(),
    servicoPerfilIds: z
      .array(z.uuid())
      .max(LIMITES_PERFIL_PROFISSIONAL.maximoServicos)
      .refine((ids) => new Set(ids).size === ids.length, "Há itens repetidos.")
      .optional(),
  })
  .refine(
    (dados) => dados.ativa !== undefined || dados.raioMetros !== undefined || dados.poligonos !== undefined || dados.servicoPerfilIds !== undefined,
    "Nada para alterar.",
  );

export type EditarAreaAtuacaoEntrada = z.input<typeof editarAreaAtuacaoEntradaSchema>;

export const preferenciasPerfilProfissionalEntradaSchema = z
  .object({
    // "Oportunidades de outras regiões — Quero receber / Não quero receber".
    recebeOportunidadesOutrasRegioes: z.boolean().optional(),
    // Fuso (IANA) em que os horários de atendimento do perfil são interpretados.
    fusoHorario: fusoHorarioSchema.optional(),
  })
  .refine((dados) => dados.recebeOportunidadesOutrasRegioes !== undefined || dados.fusoHorario !== undefined, "Nada para alterar.");

/**
 * Configuração de um serviço do perfil. `permiteAgendamento` só diz que o serviço PODERÁ usar a Agenda
 * (futura) — não cria horário reservável nem reserva nenhuma. Decisão do profissional, serviço a serviço.
 */
export const configuracaoServicoDoPerfilEntradaSchema = z.object({
  permiteAgendamento: z.boolean(),
});

/* ---------- Catálogo (taxonomia) servido pela API ---------- */

const itemCatalogoSchema = z.object({ id: z.uuid(), slug: z.string(), nome: z.string() });

export const servicoCatalogoSchema = itemCatalogoSchema.extend({
  categoriaId: z.uuid(),
  especialidades: z.array(itemCatalogoSchema),
  atributos: z.array(
    itemCatalogoSchema.extend({
      tipoSelecao: z.enum(["unica", "multipla"]),
      // A atividade só é salva com pelo menos uma opção deste atributo (ex.: Veículo do Entregador).
      obrigatorio: z.boolean(),
      opcoes: z.array(itemCatalogoSchema),
    }),
  ),
});

export type ServicoCatalogo = z.infer<typeof servicoCatalogoSchema>;

export const catalogoServicosSchema = z.object({
  categorias: z.array(itemCatalogoSchema.extend({ servicos: z.array(servicoCatalogoSchema) })),
});

export type CatalogoServicos = z.infer<typeof catalogoServicosSchema>;

// Resultado da busca textual de serviços: o termo leva a um serviço e, às vezes, a um detalhe dele.
export const servicoEncontradoPorTermoSchema = z.object({
  servicoId: z.uuid(),
  servicoNome: z.string(),
  especialidadeId: z.uuid().nullable(),
  opcaoId: z.uuid().nullable(),
  termo: z.string(),
  // 0 = termo exato (inclusive só com espaço/pontuação diferente: "moto boy" = "motoboy"), 1 = prefixo, 2 = semelhante (trigramas).
  prioridade: z.union([z.literal(0), z.literal(1), z.literal(2)]),
});

export type ServicoEncontradoPorTermo = z.infer<typeof servicoEncontradoPorTermoSchema>;

/* ---------- Resultado PÚBLICO do matching ---------- */

/**
 * O que um terceiro pode ver de um profissional encontrado. `.strict()`: base, endereço, coordenadas,
 * geometria de área e localização atual NÃO existem aqui — nem por engano.
 * `distanciaAproximadaMetros` só vem quando há referência confiável (área por raio a partir da base) e
 * sempre arredondada; null = a interface mostra "Atende sua região", nunca uma distância inventada.
 */
export const profissionalEncontradoSchema = z
  .object({
    identidadeId: z.uuid(),
    nomeExibicao: z.string(),
    nomeUsuario: z.string(),
    servico: z.object({ id: z.uuid(), nome: z.string() }).strict(),
    especialidades: z.array(z.object({ id: z.uuid(), nome: z.string() }).strict()),
    regiao: z.object({ cidade: z.string(), uf: z.string() }).strict(),
    distanciaAproximadaMetros: z.number().int().positive().nullable(),
    // Dentro dos horários de atendimento DESTE serviço no horário consultado; null = nenhum horário consultado.
    atendeNoHorario: z.boolean().nullable(),
  })
  .strict();

export type ProfissionalEncontrado = z.infer<typeof profissionalEncontradoSchema>;

/**
 * Distância PÚBLICA, sempre arredondada PARA CIMA ("até X"): nunca revela a posição exata da base.
 * Até 1 km → 1 km; até 10 km → múltiplos de 500 m; acima → múltiplos de 1 km.
 */
export function distanciaPublicaMetros(metros: number): number {
  if (!Number.isFinite(metros) || metros < 0) throw new RangeError("Distância inválida.");
  if (metros <= 1000) return 1000;
  if (metros <= 10_000) return Math.ceil(metros / 500) * 500;
  return Math.ceil(metros / 1000) * 1000;
}

/* ---------- Perfil do DONO (privado) ---------- */

/*
 * O que o PRÓPRIO profissional vê e edita — inclui a base completa e a coordenada confirmada. NUNCA
 * reutilizar este contrato para terceiros: o que é público está em `profissionalEncontradoSchema`.
 * Na interface, "serviço do perfil" é apresentado como ATIVIDADE PROFISSIONAL.
 */

// O que falta para o perfil ser utilizável.
export const PENDENCIAS_PERFIL_PROFISSIONAL = ["base", "atividade", "area"] as const;

export type PendenciaPerfilProfissional = (typeof PENDENCIAS_PERFIL_PROFISSIONAL)[number];

// inativo = desligado pelo dono (ou nunca ligado); incompleto = ligado, mas falta algo; ativo = utilizável.
export const situacaoPerfilProfissionalSchema = z.enum(["inativo", "incompleto", "ativo"]);

export type SituacaoPerfilProfissional = z.infer<typeof situacaoPerfilProfissionalSchema>;

export const atividadeDoPerfilSchema = z.object({
  // Id da atividade DO PERFIL (é o que as rotas e as áreas usam).
  id: z.uuid(),
  // Id da atividade no CATÁLOGO.
  atividadeId: z.uuid(),
  nome: z.string(),
  especialidadeIds: z.array(z.uuid()),
  opcaoIds: z.array(z.uuid()),
  periodos: z.array(periodoAtendimentoSchema),
  permiteAgendamento: z.boolean(),
});

export type AtividadeDoPerfil = z.infer<typeof atividadeDoPerfilSchema>;

export const baseProfissionalDoDonoSchema = z.object({
  cep: z.string(),
  logradouro: z.string(),
  numero: z.string(),
  complemento: z.string().nullable(),
  bairro: z.string(),
  cidade: z.string(),
  uf: z.string(),
  pontoReferencia: z.string().nullable(),
  codigoIbge: z.string().nullable(),
  // PRIVADO: só existe na resposta ao dono, e só depois da confirmação no mapa.
  coordenadas: coordenadasSchema.nullable(),
  // Versão do endereço: acompanha a confirmação do ponto (ver `confirmarPontoBaseProfissionalEntradaSchema`).
  atualizadoEm: z.iso.datetime(),
});

export type BaseProfissionalDoDono = z.infer<typeof baseProfissionalDoDonoSchema>;

export const municipioCatalogoSchema = z.object({ codigoIbge: z.string(), nome: z.string(), uf: z.string() });

export type MunicipioCatalogo = z.infer<typeof municipioCatalogoSchema>;

export const listaMunicipiosSchema = z.object({ municipios: z.array(municipioCatalogoSchema) });

export const areaAtuacaoDoDonoSchema = z.object({
  id: z.uuid(),
  modalidade: z.enum(MODALIDADES_AREA_ATUACAO),
  nome: z.string().nullable(),
  ativa: z.boolean(),
  raioMetros: z.number().int().nullable(),
  municipio: municipioCatalogoSchema.nullable(),
  /*
   * Desenho da área (só modalidade polígono), para o PRÓPRIO dono reabrir e editar no mapa. É dado
   * PRIVADO como a base: nunca entra em DTO público nem no resultado de busca.
   */
  poligonos: z.array(poligonoZonaSchema).nullable(),
  // true = vale para todas as atividades; false = só para `atividadeIds` (ids das atividades do perfil).
  todasAtividades: z.boolean(),
  atividadeIds: z.array(z.uuid()),
});

export type AreaAtuacaoDoDono = z.infer<typeof areaAtuacaoDoDonoSchema>;

export const perfilProfissionalDoDonoSchema = z.object({
  id: z.uuid(),
  situacao: situacaoPerfilProfissionalSchema,
  ativo: z.boolean(),
  pendencias: z.array(z.enum(PENDENCIAS_PERFIL_PROFISSIONAL)),
  recebeOportunidadesOutrasRegioes: z.boolean(),
  atividades: z.array(atividadeDoPerfilSchema),
  base: baseProfissionalDoDonoSchema.nullable(),
  areas: z.array(areaAtuacaoDoDonoSchema),
});

export type PerfilProfissionalDoDono = z.infer<typeof perfilProfissionalDoDonoSchema>;

// null = a pessoa ainda não ativou o Perfil Profissional.
export const respostaPerfilProfissionalSchema = z.object({ perfil: perfilProfissionalDoDonoSchema.nullable() });

export type RespostaPerfilProfissional = z.infer<typeof respostaPerfilProfissionalSchema>;

export function situacaoDoPerfil(ativo: boolean, pendencias: readonly PendenciaPerfilProfissional[]): SituacaoPerfilProfissional {
  if (!ativo) return "inativo";
  return pendencias.length > 0 ? "incompleto" : "ativo";
}
