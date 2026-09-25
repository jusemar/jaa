import * as z from "zod";

/*
 * PERSONALIZAÇÃO DO PRODUTO — grupos de opções CONFIGURÁVEIS pela empresa.
 *
 * O domínio não conhece "tamanho", "guarnição", "carne" nem limite 5: isso é conteúdo que cada
 * empresa cadastra. O que existe aqui é a ESTRUTURA: um produto tem grupos, cada grupo tem opções e
 * um intervalo de quantas podem ser escolhidas.
 *
 * `minimoEscolhas`/`maximoEscolhas` descrevem sozinhos o comportamento — não há campo separado de
 * "obrigatório" ou "única/múltipla" que possa contradizê-los:
 *   - obrigatório  = minimoEscolhas >= 1;
 *   - escolha única = maximoEscolhas === 1 (a interface mostra rádio; caso contrário, caixas).
 *
 * Preço: a opção carrega um ACRÉSCIMO em centavos sobre o preço do produto (0 = não muda o preço).
 * Um grupo "Tamanho" com Pequeno +0 e Grande +500 resolve o caso da referência sem preço paralelo,
 * e o servidor continua sendo a única autoridade sobre dinheiro.
 */

export const NOME_GRUPO_OPCOES_TAMANHO_MAXIMO = 80;
export const INSTRUCAO_GRUPO_OPCOES_TAMANHO_MAXIMO = 200;
export const NOME_OPCAO_TAMANHO_MAXIMO = 80;

export const MAXIMO_GRUPOS_POR_PRODUTO = 10;
export const MAXIMO_OPCOES_POR_GRUPO = 50;
// Teto de escolhas em um grupo: acompanha o teto de opções (não faz sentido exigir mais do que existe).
export const MAXIMO_ESCOLHAS_POR_GRUPO = MAXIMO_OPCOES_POR_GRUPO;
// Acréscimo por opção, em centavos inteiros. 0 é válido (opção que não muda o preço).
export const ACRESCIMO_OPCAO_MAXIMO_CENTAVOS = 99_999_999;

const texto = (maximo: number, vazio: string) =>
  z
    .string()
    .transform((valor) => valor.normalize("NFC").replace(/\s+/g, " ").trim())
    .pipe(
      z
        .string()
        .min(1, vazio)
        .max(maximo, `Use no máximo ${maximo} caracteres.`),
    );

export const nomeGrupoOpcoesSchema = texto(
  NOME_GRUPO_OPCOES_TAMANHO_MAXIMO,
  "Informe o nome do grupo.",
);
export const nomeOpcaoSchema = texto(
  NOME_OPCAO_TAMANHO_MAXIMO,
  "Informe o nome da opção.",
);

// Linha de ajuda exibida abaixo do título do grupo ("As guarnições valem para os dois tamanhos.").
export const instrucaoGrupoOpcoesSchema = z
  .string()
  .transform((valor) => {
    const limpa = valor.normalize("NFC").replace(/\s+/g, " ").trim();
    return limpa === "" ? null : limpa;
  })
  .pipe(z.string().max(INSTRUCAO_GRUPO_OPCOES_TAMANHO_MAXIMO).nullable())
  .nullable();

export const acrescimoOpcaoSchema = z
  .number({ error: "Informe o acréscimo em centavos (número inteiro)." })
  .int("O acréscimo deve ser um número inteiro de centavos.")
  .min(0, "O acréscimo não pode ser negativo.")
  .max(
    ACRESCIMO_OPCAO_MAXIMO_CENTAVOS,
    "O acréscimo está acima do limite permitido.",
  );

export const posicaoSchema = z.number().int().min(0).max(9999);

export const disponibilidadeOpcaoSchema = z.enum([
  "disponivel",
  "indisponivel",
]);
export type DisponibilidadeOpcao = z.infer<typeof disponibilidadeOpcaoSchema>;

/** min ≤ max e max ≥ 1: um grupo que não aceita nenhuma escolha não é um grupo. */
const faixaCoerente = <
  T extends {
    minimoEscolhas?: number | undefined;
    maximoEscolhas?: number | undefined;
  },
>(
  entrada: T,
) =>
  entrada.minimoEscolhas === undefined ||
  entrada.maximoEscolhas === undefined ||
  entrada.minimoEscolhas <= entrada.maximoEscolhas;

export const criarGrupoOpcoesEntradaSchema = z
  .object({
    nome: nomeGrupoOpcoesSchema,
    instrucao: instrucaoGrupoOpcoesSchema.optional(),
    minimoEscolhas: z
      .number()
      .int()
      .min(0)
      .max(MAXIMO_ESCOLHAS_POR_GRUPO)
      .default(0),
    maximoEscolhas: z
      .number()
      .int()
      .min(1)
      .max(MAXIMO_ESCOLHAS_POR_GRUPO)
      .default(1),
    posicao: posicaoSchema.optional(),
  })
  .refine(faixaCoerente, {
    error: "O mínimo não pode ser maior que o máximo.",
    path: ["minimoEscolhas"],
  });

export type CriarGrupoOpcoesEntrada = z.input<
  typeof criarGrupoOpcoesEntradaSchema
>;

export const atualizarGrupoOpcoesEntradaSchema = z
  .object({
    nome: nomeGrupoOpcoesSchema.optional(),
    instrucao: instrucaoGrupoOpcoesSchema.optional(),
    minimoEscolhas: z
      .number()
      .int()
      .min(0)
      .max(MAXIMO_ESCOLHAS_POR_GRUPO)
      .optional(),
    maximoEscolhas: z
      .number()
      .int()
      .min(1)
      .max(MAXIMO_ESCOLHAS_POR_GRUPO)
      .optional(),
    posicao: posicaoSchema.optional(),
  })
  .refine(
    (entrada) => Object.values(entrada).some((valor) => valor !== undefined),
    "Informe ao menos um campo para alterar.",
  )
  .refine(faixaCoerente, {
    error: "O mínimo não pode ser maior que o máximo.",
    path: ["minimoEscolhas"],
  });

export type AtualizarGrupoOpcoesEntrada = z.input<
  typeof atualizarGrupoOpcoesEntradaSchema
>;

export const criarOpcaoEntradaSchema = z.object({
  nome: nomeOpcaoSchema,
  precoAdicionalCentavos: acrescimoOpcaoSchema.default(0),
  disponibilidade: disponibilidadeOpcaoSchema.default("disponivel"),
  posicao: posicaoSchema.optional(),
});

export type CriarOpcaoEntrada = z.input<typeof criarOpcaoEntradaSchema>;

export const atualizarOpcaoEntradaSchema = z
  .object({
    nome: nomeOpcaoSchema.optional(),
    precoAdicionalCentavos: acrescimoOpcaoSchema.optional(),
    disponibilidade: disponibilidadeOpcaoSchema.optional(),
    posicao: posicaoSchema.optional(),
  })
  .refine(
    (entrada) => Object.values(entrada).some((valor) => valor !== undefined),
    "Informe ao menos um campo para alterar.",
  );

export type AtualizarOpcaoEntrada = z.input<typeof atualizarOpcaoEntradaSchema>;

// Visão ADMINISTRATIVA: inclui opção indisponível, que continua existindo e administrável.
export const opcaoProdutoSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  precoAdicionalCentavos: z.number().int(),
  disponibilidade: disponibilidadeOpcaoSchema,
  posicao: z.number().int(),
});

export type OpcaoProduto = z.infer<typeof opcaoProdutoSchema>;

export const grupoOpcoesProdutoSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  instrucao: z.string().nullable(),
  minimoEscolhas: z.number().int(),
  maximoEscolhas: z.number().int(),
  posicao: z.number().int(),
  opcoes: z.array(opcaoProdutoSchema),
});

export type GrupoOpcoesProduto = z.infer<typeof grupoOpcoesProdutoSchema>;

export const listaGruposOpcoesSchema = z.object({
  grupos: z.array(grupoOpcoesProdutoSchema),
});
export type ListaGruposOpcoes = z.infer<typeof listaGruposOpcoesSchema>;

/*
 * Visão de CLIENTE: só opções DISPONÍVEIS, sem campos administrativos. Um grupo cujas opções
 * disponíveis não alcançam o mínimo exigido não é apresentado pelo servidor — pedir o impossível
 * deixaria o produto sem como ser montado.
 */
export const opcaoPublicaSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  precoAdicionalCentavos: z.number().int(),
});

export type OpcaoPublica = z.infer<typeof opcaoPublicaSchema>;

export const grupoOpcoesPublicoSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  instrucao: z.string().nullable(),
  minimoEscolhas: z.number().int(),
  maximoEscolhas: z.number().int(),
  opcoes: z.array(opcaoPublicaSchema).min(1),
});

export type GrupoOpcoesPublico = z.infer<typeof grupoOpcoesPublicoSchema>;

export function grupoObrigatorio(grupo: { minimoEscolhas: number }): boolean {
  return grupo.minimoEscolhas >= 1;
}

export function grupoDeEscolhaUnica(grupo: {
  maximoEscolhas: number;
}): boolean {
  return grupo.maximoEscolhas === 1;
}

/*
 * VARIAÇÃO BASE do produto: o PRIMEIRO grupo de escolha única, na ordem que a empresa cadastrou.
 *
 * Por construção do modelo, é ele que define QUAL versão do item está sendo montada — tamanho,
 * porção, voltagem — porque a pessoa escolhe exatamente uma alternativa e essa alternativa vale
 * para o item inteiro. Os grupos de escolha única que vêm depois são refinamentos DENTRO dessa
 * versão (o tipo de carne do prato, por exemplo).
 *
 * Isso é derivado de `maximoEscolhas` e da ORDEM, nunca do nome: o domínio não conhece "Tamanho".
 * A interface usa esta distinção para duas coisas — o rótulo do resumo ("Monte seu prato (Grande)")
 * e a forma de mostrar preço: a variação base exibe o PREÇO FINAL de cada alternativa (é o preço do
 * item naquela versão), e os demais grupos exibem só o ACRÉSCIMO. Nenhum cálculo depende disto:
 * dinheiro continua vindo de `precoUnitarioComEscolhas`, e a autoridade continua no servidor.
 */
export function grupoDeVariacaoBase<T extends { maximoEscolhas: number }>(
  grupos: readonly T[],
): T | null {
  return grupos.find((grupo) => grupoDeEscolhaUnica(grupo)) ?? null;
}

/**
 * Validação das escolhas contra os grupos — a MESMA regra pura no servidor (autoridade) e na
 * interface (para habilitar o botão e explicar o que falta). O servidor nunca confia no resultado
 * do navegador: ele reexecuta isto com os grupos lidos do banco.
 */
export type ResultadoEscolhas =
  | { valido: true }
  | {
      valido: false;
      motivo: "opcao-desconhecida" | "faltam-escolhas" | "escolhas-demais";
      grupoNome?: string;
      grupoId?: string;
    };

export function validarEscolhas(
  grupos: readonly GrupoOpcoesPublico[],
  opcaoIds: readonly string[],
): ResultadoEscolhas {
  const escolhidas = new Set(opcaoIds);
  // Toda opção enviada precisa pertencer a algum grupo DESTE produto (e estar disponível).
  const conhecidas = new Set(
    grupos.flatMap((grupo) => grupo.opcoes.map((opcao) => opcao.id)),
  );
  for (const id of escolhidas)
    if (!conhecidas.has(id))
      return { valido: false, motivo: "opcao-desconhecida" };

  for (const grupo of grupos) {
    const total = grupo.opcoes.filter((opcao) =>
      escolhidas.has(opcao.id),
    ).length;
    if (total < grupo.minimoEscolhas)
      return {
        valido: false,
        motivo: "faltam-escolhas",
        grupoNome: grupo.nome,
        grupoId: grupo.id,
      };
    if (total > grupo.maximoEscolhas)
      return {
        valido: false,
        motivo: "escolhas-demais",
        grupoNome: grupo.nome,
        grupoId: grupo.id,
      };
  }
  return { valido: true };
}

/** Preço unitário = preço do produto + acréscimos das opções escolhidas (centavos inteiros). */
export function precoUnitarioComEscolhas(
  precoBaseCentavos: number,
  grupos: readonly GrupoOpcoesPublico[],
  opcaoIds: readonly string[],
): number {
  const escolhidas = new Set(opcaoIds);
  return grupos.reduce(
    (total, grupo) =>
      total +
      grupo.opcoes
        .filter((opcao) => escolhidas.has(opcao.id))
        .reduce((soma, opcao) => soma + opcao.precoAdicionalCentavos, 0),
    precoBaseCentavos,
  );
}
