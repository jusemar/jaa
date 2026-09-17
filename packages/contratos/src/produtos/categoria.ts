import * as z from "zod";

/*
 * CATEGORIA DE PRODUTO — sempre DE UMA EMPRESA. Não existe lista global: "Bebidas" de uma empresa não
 * é "Bebidas" de outra. A empresa dona nunca vem do corpo; vem da rota autorizada no servidor.
 *
 * Categoria organiza o catálogo e não é regra comercial: não muda preço, disponibilidade nem pedido.
 */

export const NOME_CATEGORIA_TAMANHO_MAXIMO = 60;

export const nomeCategoriaSchema = z
  .string()
  .transform((valor) => valor.normalize("NFC").replace(/\s+/g, " ").trim())
  .pipe(
    z
      .string()
      .min(1, "Informe o nome da categoria.")
      .max(NOME_CATEGORIA_TAMANHO_MAXIMO, `O nome deve ter no máximo ${NOME_CATEGORIA_TAMANHO_MAXIMO} caracteres.`),
  );

export const posicaoCategoriaSchema = z.number().int().min(0).max(9999);

export const criarCategoriaEntradaSchema = z.object({
  nome: nomeCategoriaSchema,
  posicao: posicaoCategoriaSchema.optional(),
});

export type CriarCategoriaEntrada = z.input<typeof criarCategoriaEntradaSchema>;

export const atualizarCategoriaEntradaSchema = z
  .object({
    nome: nomeCategoriaSchema.optional(),
    posicao: posicaoCategoriaSchema.optional(),
  })
  .refine((entrada) => Object.values(entrada).some((valor) => valor !== undefined), "Informe ao menos um campo para alterar.");

export type AtualizarCategoriaEntrada = z.input<typeof atualizarCategoriaEntradaSchema>;

export const categoriaProdutoSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  posicao: z.number().int(),
  // Quantos produtos estão nela hoje: a empresa precisa saber antes de apagar.
  produtos: z.number().int().nonnegative(),
});

export type CategoriaProduto = z.infer<typeof categoriaProdutoSchema>;

export const listaCategoriasSchema = z.object({ categorias: z.array(categoriaProdutoSchema) });
export type ListaCategorias = z.infer<typeof listaCategoriasSchema>;
