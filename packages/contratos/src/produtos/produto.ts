import * as z from "zod";

/*
 * PRODUTO DA EMPRESA: um único contrato para todos os canais (administração Web hoje; loja pública,
 * chat e app no futuro). Canais diferentes apresentam o mesmo domínio; não existem "produtos do chat"
 * ou "produtos da loja". A empresa dona NUNCA vem do corpo: vem da rota autorizada no servidor.
 */

export const NOME_PRODUTO_TAMANHO_MAXIMO = 120;
export const DESCRICAO_PRODUTO_TAMANHO_MAXIMO = 1000;

// Dinheiro em CENTAVOS inteiros (R$ 39,90 = 3990). Preço > 0; teto evita valores absurdos/overflow.
export const PRECO_PRODUTO_MINIMO_CENTAVOS = 1;
export const PRECO_PRODUTO_MAXIMO_CENTAVOS = 99_999_999; // R$ 999.999,99

const semCaracteresDeControle = (valor: string) => !/[\p{Cc}]/u.test(valor.replace(/[\n\r\t]/g, ""));
const tamanho = (valor: string) => [...valor].length;

export const nomeProdutoSchema = z
  .string()
  .transform((valor) => valor.normalize("NFC").replace(/\s+/g, " ").trim())
  .pipe(
    z
      .string()
      .min(1, "Informe o nome do produto.")
      .refine((valor) => tamanho(valor) <= NOME_PRODUTO_TAMANHO_MAXIMO, `O nome deve ter no máximo ${NOME_PRODUTO_TAMANHO_MAXIMO} caracteres.`)
      .refine(semCaracteresDeControle, "O nome contém caracteres inválidos."),
  );

// Opcional. Vazia ou só espaços vira null (o banco não guarda string vazia). Quebras de linha são mantidas.
export const descricaoProdutoSchema = z
  .string()
  .transform((valor) => {
    const limpa = valor.normalize("NFC").trim();
    return limpa === "" ? null : limpa;
  })
  .pipe(
    z
      .string()
      .refine((valor) => tamanho(valor) <= DESCRICAO_PRODUTO_TAMANHO_MAXIMO, `A descrição deve ter no máximo ${DESCRICAO_PRODUTO_TAMANHO_MAXIMO} caracteres.`)
      .refine(semCaracteresDeControle, "A descrição contém caracteres inválidos.")
      .nullable(),
  )
  .nullable();

// Número inteiro JSON (nunca string nem fração): 39.9 ou "3990" são recusados.
export const precoCentavosSchema = z
  .number({ error: "Informe o preço em centavos (número inteiro)." })
  .int("O preço deve ser um número inteiro de centavos.")
  .min(PRECO_PRODUTO_MINIMO_CENTAVOS, "O preço deve ser maior que zero.")
  .max(PRECO_PRODUTO_MAXIMO_CENTAVOS, "O preço está acima do limite permitido.");

export const disponibilidadeProdutoSchema = z.enum(["disponivel", "indisponivel"]);

export type DisponibilidadeProduto = z.infer<typeof disponibilidadeProdutoSchema>;

export const criarProdutoEntradaSchema = z.object({
  nome: nomeProdutoSchema,
  descricao: descricaoProdutoSchema.optional(),
  precoCentavos: precoCentavosSchema,
  disponibilidade: disponibilidadeProdutoSchema.default("disponivel"),
});

export type CriarProdutoEntrada = z.input<typeof criarProdutoEntradaSchema>;

// Edição dos dados comerciais. `empresaId`/`id` não fazem parte do contrato: são descartados.
export const atualizarProdutoEntradaSchema = z
  .object({
    nome: nomeProdutoSchema.optional(),
    descricao: descricaoProdutoSchema.optional(),
    precoCentavos: precoCentavosSchema.optional(),
    disponibilidade: disponibilidadeProdutoSchema.optional(),
  })
  .refine((entrada) => Object.values(entrada).some((valor) => valor !== undefined), "Informe ao menos um campo para alterar.");

export type AtualizarProdutoEntrada = z.input<typeof atualizarProdutoEntradaSchema>;

// Operação própria: futuramente um atendente poderá alterar disponibilidade sem poder mudar preço.
export const alterarDisponibilidadeProdutoEntradaSchema = z.object({
  disponibilidade: disponibilidadeProdutoSchema,
});

export type AlterarDisponibilidadeProdutoEntrada = z.input<typeof alterarDisponibilidadeProdutoEntradaSchema>;

// Visão ADMINISTRATIVA (membros autorizados da empresa). A futura visão pública terá contrato próprio.
export const produtoSchema = z.object({
  id: z.uuid(),
  empresaId: z.uuid(),
  nome: z.string(),
  descricao: z.string().nullable(),
  precoCentavos: z.number().int(),
  disponibilidade: disponibilidadeProdutoSchema,
  criadoEm: z.iso.datetime(),
  atualizadoEm: z.iso.datetime(),
});

export type Produto = z.infer<typeof produtoSchema>;

export const listaProdutosSchema = z.object({
  produtos: z.array(produtoSchema),
});

export type ListaProdutos = z.infer<typeof listaProdutosSchema>;
