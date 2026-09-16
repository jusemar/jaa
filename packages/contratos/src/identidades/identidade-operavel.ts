import * as z from "zod";
import { papelMembroEmpresaSchema } from "../empresas/empresa.ts";

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
export const identidadeOperavelSchema = z.discriminatedUnion("tipo", [
  z.object({
    tipo: z.literal("pessoal"),
    identidadeId: z.uuid(),
    nomeExibicao: z.string(),
    nomeUsuario: z.string(),
  }),
  z.object({
    tipo: z.literal("empresarial"),
    identidadeId: z.uuid(),
    nomeExibicao: z.string(),
    nomeUsuario: z.string(),
    empresa: z.object({ id: z.uuid(), slug: z.string(), papel: papelMembroEmpresaSchema }),
  }),
]);

export type IdentidadeOperavel = z.infer<typeof identidadeOperavelSchema>;

export const listaIdentidadesOperaveisSchema = z.object({
  // A pessoal primeiro; depois as empresariais.
  identidades: z.array(identidadeOperavelSchema),
});

export type ListaIdentidadesOperaveis = z.infer<typeof listaIdentidadesOperaveisSchema>;
