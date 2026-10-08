import * as z from "zod";
import { NOME_EXIBICAO_TAMANHO_MAXIMO, normalizarNomeExibicao, nomeUsuarioSchema } from "../identidades/identidade-pessoal.ts";

export const SLUG_EMPRESA_TAMANHO_MINIMO = 3;
export const SLUG_EMPRESA_TAMANHO_MAXIMO = 60;

// Minúsculas, dígitos e hífens simples entre partes. Mantido em sincronia com `empresas_slug_formato`.
export const SLUG_EMPRESA_FORMATO = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Slugs que colidiriam com rotas/termos institucionais do Jaa. Lista central, pode evoluir.
export const SLUGS_EMPRESA_RESERVADOS: ReadonlySet<string> = new Set([
  "jaa",
  "admin",
  "api",
  "app",
  "ajuda",
  "suporte",
  "loja",
  "lojas",
  "nova",
  "novo",
  "entrar",
  "sair",
  "conta",
  "configuracoes",
  "oficial",
]);

// O slug é identificador PÚBLICO da futura loja (/loja/<slug>); nunca é usado para autorizar.
export function normalizarSlugEmpresa(valor: string): string {
  return valor.trim().toLowerCase();
}

export const slugEmpresaSchema = z
  .string()
  .transform(normalizarSlugEmpresa)
  .pipe(
    z
      .string()
      .min(SLUG_EMPRESA_TAMANHO_MINIMO, "O endereço da loja deve ter pelo menos 3 caracteres.")
      .max(SLUG_EMPRESA_TAMANHO_MAXIMO, "O endereço da loja deve ter no máximo 60 caracteres.")
      .regex(SLUG_EMPRESA_FORMATO, "Use letras sem acento, números e hífens (ex.: pizzaria-bh).")
      .refine((valor) => !SLUGS_EMPRESA_RESERVADOS.has(valor), "Este endereço de loja não está disponível."),
  );

// Nome público da empresa = nome de exibição da identidade empresarial (mesmas regras do banco).
export const nomeEmpresaSchema = z
  .string()
  .transform(normalizarNomeExibicao)
  .pipe(
    z
      .string()
      .min(1, "Informe o nome da empresa.")
      .refine((valor) => [...valor].length <= NOME_EXIBICAO_TAMANHO_MAXIMO, "O nome deve ter no máximo 50 caracteres.")
      .refine((valor) => !/\p{Cc}/u.test(valor), "O nome contém caracteres inválidos."),
  );

// Proprietário, conta e identidade vêm SEMPRE da sessão; campos extras são descartados.
export const criarEmpresaEntradaSchema = z.object({
  nome: nomeEmpresaSchema,
  // @usuario da identidade empresarial: mesmo espaço único dos @usuario pessoais.
  nomeUsuario: nomeUsuarioSchema,
  slug: slugEmpresaSchema,
});

export type CriarEmpresaEntrada = z.input<typeof criarEmpresaEntradaSchema>;

export const atualizarEmpresaEntradaSchema = z
  .object({
    nome: nomeEmpresaSchema.optional(),
    slug: slugEmpresaSchema.optional(),
  })
  .refine((entrada) => entrada.nome !== undefined || entrada.slug !== undefined, "Informe o nome ou o endereço da loja.");

export type AtualizarEmpresaEntrada = z.input<typeof atualizarEmpresaEntradaSchema>;

export const statusEmpresaSchema = z.enum(["ativa"]);
// Papel da conta na empresa. Futuros: administrador, atendente, funcionário, entregador.
export const papelMembroEmpresaSchema = z.enum(["proprietario"]);

export type PapelMembroEmpresa = z.infer<typeof papelMembroEmpresaSchema>;

// Empresa vista por quem pode operá-la. Nunca inclui dados da conta ou da identidade pessoal do membro.
export const empresaSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  slug: z.string(),
  status: statusEmpresaSchema,
  identidadeId: z.uuid(),
  nomeUsuario: z.string(),
  papel: papelMembroEmpresaSchema,
  criadoEm: z.iso.datetime(),
  atualizadoEm: z.iso.datetime(),
});

export type Empresa = z.infer<typeof empresaSchema>;

export const listaEmpresasSchema = z.object({
  empresas: z.array(empresaSchema),
});

export type ListaEmpresas = z.infer<typeof listaEmpresasSchema>;

/*
 * LIMITE DE CRIAÇÃO: por enquanto cada conta pode CRIAR uma empresa. "Criada por ela" = empresa em que
 * a conta é PROPRIETÁRIA (hoje só a criação torna alguém proprietário). Participar de outras empresas
 * por vínculo/permissão não conta. Quem garante é a API (409 `LIMITE_DE_EMPRESAS_ATINGIDO`); a
 * interface usa `podeCriarEmpresa` só para não oferecer uma ação que seria recusada.
 */
export const MAXIMO_EMPRESAS_CRIADAS_POR_CONTA = 1;

export const MENSAGEM_LIMITE_DE_EMPRESAS = "Você já possui uma empresa criada.";

// Dito ao lado do botão "Criar empresa" desativado (Web e Mobile).
export const AVISO_LIMITE_DE_EMPRESAS = `Limite: ${MAXIMO_EMPRESAS_CRIADAS_POR_CONTA} empresa por usuário.`;

export function podeCriarEmpresa(empresas: readonly Pick<Empresa, "papel">[]): boolean {
  return empresas.filter((empresa) => empresa.papel === "proprietario").length < MAXIMO_EMPRESAS_CRIADAS_POR_CONTA;
}
