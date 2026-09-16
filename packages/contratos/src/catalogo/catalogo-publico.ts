import * as z from "zod";

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

export const produtoPublicoSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  descricao: z.string().nullable(),
  // Centavos inteiros (R$ 39,90 = 3990).
  precoCentavos: z.number().int(),
  // Na consulta de cliente só aparecem produtos disponíveis.
  disponibilidade: z.literal("disponivel"),
});

export type ProdutoPublico = z.infer<typeof produtoPublicoSchema>;

export const catalogoPublicoSchema = z.object({
  empresa: empresaPublicaSchema,
  produtos: z.array(produtoPublicoSchema),
});

export type CatalogoPublico = z.infer<typeof catalogoPublicoSchema>;

export const produtoPublicoDetalheSchema = z.object({
  empresa: empresaPublicaSchema,
  produto: produtoPublicoSchema,
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
