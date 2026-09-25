import * as z from "zod";
import { grupoOpcoesPublicoSchema } from "../produtos/personalizacao.ts";

/*
 * Consulta de CLIENTE do catálogo (pública): o MESMO domínio Produto da administração, com outro
 * contrato. Só empresa ativa e só produtos DISPONÍVEIS; nunca proprietário, conta, membros,
 * permissões, empresaId interno ou campos administrativos. Reutilizável pela futura /loja/<slug>,
 * pelo chat e pelo app.
 */

export const empresaPublicaSchema = z.object({
  // A empresa é apresentada pela sua identidade pública (a mesma que conversa).
  identidadeId: z.uuid(),
  nome: z.string(),
  nomeUsuario: z.string(),
  // Endereço público da futura loja; identificador, não autorização.
  slug: z.string(),
});

export type EmpresaPublica = z.infer<typeof empresaPublicaSchema>;

/*
 * CATEGORIA na visão de cliente: só o necessário para navegar pelo cardápio (id, nome e a ordem que a
 * empresa escolheu). É a MESMA categoria da administração — nada é duplicado para o chat ou a loja.
 */
export const categoriaPublicaSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  posicao: z.number().int(),
});

export type CategoriaPublica = z.infer<typeof categoriaPublicaSchema>;

export const produtoPublicoSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  descricao: z.string().nullable(),
  // Centavos inteiros (R$ 39,90 = 3990). Com personalização, é o preço BASE: as opções acrescentam.
  precoCentavos: z.number().int(),
  // Na consulta de cliente só aparecem produtos disponíveis.
  disponibilidade: z.literal("disponivel"),
  // Organização do cardápio; null = "Outros" (produto sem categoria).
  categoriaId: z.uuid().nullable(),
  // Endereço público montado pela API a partir da chave gravada; null = produto sem imagem.
  imagemUrl: z.url().nullable(),
  /*
   * O produto tem grupos de opções a montar. Vem já na LISTA para o cardápio poder dizer "Monte o
   * seu" e abrir a montagem em vez de adicionar direto — sem carregar os grupos de todos os produtos.
   */
  personalizavel: z.boolean(),
});

export type ProdutoPublico = z.infer<typeof produtoPublicoSchema>;

export const catalogoPublicoSchema = z.object({
  empresa: empresaPublicaSchema,
  // Na ordem definida pela empresa; produtos sem categoria ficam fora delas (a interface agrupa em "Outros").
  categorias: z.array(categoriaPublicaSchema),
  produtos: z.array(produtoPublicoSchema),
});

export type CatalogoPublico = z.infer<typeof catalogoPublicoSchema>;

export const produtoPublicoDetalheSchema = z.object({
  empresa: empresaPublicaSchema,
  produto: produtoPublicoSchema,
  /*
   * Grupos de opções a montar, já filtrados pelo servidor: só opções disponíveis e só grupos que
   * ainda conseguem cumprir o próprio mínimo. Vazio = produto comum (adiciona direto).
   */
  grupos: z.array(grupoOpcoesPublicoSchema),
});

export type ProdutoPublicoDetalhe = z.infer<typeof produtoPublicoDetalheSchema>;

export const BUSCA_EMPRESAS_TAMANHO_MAXIMO = 50;
export const LIMITE_EMPRESAS_DESCOBERTA = 20;

// Descoberta TÉCNICA temporária (não é o "Encontrar" definitivo).
export const buscarEmpresasPublicasConsultaSchema = z.object({
  busca: z
    .string()
    .transform((valor) => valor.trim().replace(/^@/, ""))
    .pipe(z.string().max(BUSCA_EMPRESAS_TAMANHO_MAXIMO))
    .optional(),
});

export type BuscarEmpresasPublicasConsulta = z.input<typeof buscarEmpresasPublicasConsultaSchema>;

export const listaEmpresasPublicasSchema = z.object({
  empresas: z.array(empresaPublicaSchema),
});

export type ListaEmpresasPublicas = z.infer<typeof listaEmpresasPublicasSchema>;
