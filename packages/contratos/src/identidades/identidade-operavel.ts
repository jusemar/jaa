import * as z from "zod";
import { papelMembroEmpresaSchema, type PapelMembroEmpresa } from "../empresas/empresa.ts";

export const tipoIdentidadeSchema = z.enum(["pessoal", "empresarial"]);

/**
 * Identidade ATUANTE nas operações do mensageiro (HTTP: este cabeçalho; Socket.IO: `auth.identidadeId`).
 * É só a INTENÇÃO do cliente. O servidor valida sessão → conta → vínculo; sem o cabeçalho vale a identidade
 * pessoal; identidade não autorizada é recusada (IDENTIDADE_NAO_AUTORIZADA), nunca trocada em silêncio.
 */
export const CABECALHO_IDENTIDADE_ATUANTE = "x-jaa-identidade";

export type TipoIdentidade = z.infer<typeof tipoIdentidadeSchema>;

/**
 * Identidade que a CONTA autenticada pode operar, segundo o servidor (pessoal própria ou empresarial
 * por vínculo). Escolher uma delas no cliente é só intenção de interface: toda ação em nome de uma
 * identidade é autorizada de novo no servidor contra os vínculos.
 */
// Foto (avatar da pessoa ou logo da empresa) para o seletor "Agindo como". São identidades que a
// própria conta opera, então a privacidade de terceiros não se aplica; null = sem foto.
const fotoUrlSchema = z.url().nullable();

const identidadeOperavelPessoalSchema = z.object({
  tipo: z.literal("pessoal"),
  identidadeId: z.uuid(),
  nomeExibicao: z.string(),
  nomeUsuario: z.string(),
  fotoUrl: fotoUrlSchema,
});

const identidadeOperavelEmpresarialSchema = z.object({
  tipo: z.literal("empresarial"),
  identidadeId: z.uuid(),
  nomeExibicao: z.string(),
  nomeUsuario: z.string(),
  fotoUrl: fotoUrlSchema,
  empresa: z.object({ id: z.uuid(), slug: z.string(), papel: papelMembroEmpresaSchema }),
});

export const identidadeOperavelSchema = z.discriminatedUnion("tipo", [identidadeOperavelPessoalSchema, identidadeOperavelEmpresarialSchema]);

export type IdentidadeOperavel = z.infer<typeof identidadeOperavelSchema>;

/*
 * LEITURA TOLERANTE pelos clientes (contexto da conta). Só o PAPEL é aberto: papéis novos (atendente,
 * administrador...) virão, e um app antigo não pode perder o contexto inteiro por isso. Papel que o
 * cliente não conhece é só um rótulo — nunca vira "proprietário" nem concede nada (ver
 * `papelEmpresaConhecido`); quem autoriza cada ação continua sendo o servidor.
 *
 * O TIPO continua fechado de propósito: pessoal × empresarial é decisão estrutural (dono da identidade,
 * inbox, identidade atuante), não algo que cresce com o produto — capacidades novas NÃO são tipos novos.
 * Um tipo novo seria mudança de arquitetura, com migração coordenada dos clientes.
 */
// A FOTO também é tolerante: ausente ou inválida vira null (o app mostra as iniciais) em vez de
// derrubar o contexto — foto é apresentação, nunca decide nada.
const fotoUrlRecebidaSchema = fotoUrlSchema.catch(null);

export const identidadeOperavelRecebidaSchema = z.discriminatedUnion("tipo", [
  identidadeOperavelPessoalSchema.extend({ fotoUrl: fotoUrlRecebidaSchema }),
  identidadeOperavelEmpresarialSchema.extend({
    fotoUrl: fotoUrlRecebidaSchema,
    empresa: identidadeOperavelEmpresarialSchema.shape.empresa.extend({ papel: z.string() }),
  }),
]);

export type IdentidadeOperavelRecebida = z.infer<typeof identidadeOperavelRecebidaSchema>;

/** Papel que ESTA versão conhece, ou `null`. Papel desconhecido nunca é tratado como um conhecido. */
export function papelEmpresaConhecido(papel: string): PapelMembroEmpresa | null {
  const resultado = papelMembroEmpresaSchema.safeParse(papel);
  return resultado.success ? resultado.data : null;
}

export const listaIdentidadesOperaveisSchema = z.object({
  // A pessoal primeiro; depois as empresariais.
  identidades: z.array(identidadeOperavelSchema),
});

export type ListaIdentidadesOperaveis = z.infer<typeof listaIdentidadesOperaveisSchema>;
