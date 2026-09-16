import type { Banco } from "@jaa/banco";
import { empresas, identidades } from "@jaa/banco/schema";
import { LIMITE_EMPRESAS_DESCOBERTA } from "@jaa/contratos";
import { and, asc, eq, ilike, or, type SQL } from "drizzle-orm";

// Empresa como vista PUBLICAMENTE. `empresaId` fica só no servidor (para buscar produtos); nunca é serializado.
export interface EmpresaPublicaRegistro {
  empresaId: string;
  identidadeId: string;
  nome: string;
  nomeUsuario: string;
  slug: string;
}

const colunasEmpresaPublica = {
  empresaId: empresas.id,
  identidadeId: identidades.id,
  nome: identidades.nomeExibicao,
  nomeUsuario: identidades.nomeUsuario,
  slug: empresas.slug,
};

// Só empresas cujo status permite operação pública (hoje: "ativa").
const empresaPublicamenteDisponivel = eq(empresas.status, "ativa");

export async function buscarEmpresaPublicaPorIdentidade(banco: Banco, identidadeId: string): Promise<EmpresaPublicaRegistro | null> {
  const [empresa] = await banco
    .select(colunasEmpresaPublica)
    .from(identidades)
    .innerJoin(empresas, eq(empresas.id, identidades.empresaId))
    .where(and(eq(identidades.id, identidadeId), eq(identidades.tipo, "empresarial"), empresaPublicamenteDisponivel))
    .limit(1);
  return empresa ?? null;
}

// Escapa curingas do ILIKE: a busca é por texto literal.
const literal = (texto: string) => texto.replace(/[\\%_]/g, (caractere) => `\\${caractere}`);

// Descoberta TÉCNICA temporária por nome ou @usuario (não é o "Encontrar" definitivo).
export async function buscarEmpresasPublicas(banco: Banco, busca: string | undefined): Promise<EmpresaPublicaRegistro[]> {
  const filtroBusca: SQL | undefined = busca
    ? or(ilike(identidades.nomeExibicao, `%${literal(busca)}%`), ilike(identidades.nomeUsuario, `%${literal(busca)}%`))
    : undefined;

  return banco
    .select(colunasEmpresaPublica)
    .from(identidades)
    .innerJoin(empresas, eq(empresas.id, identidades.empresaId))
    .where(and(eq(identidades.tipo, "empresarial"), empresaPublicamenteDisponivel, filtroBusca))
    .orderBy(asc(identidades.nomeExibicao), asc(identidades.id))
    .limit(LIMITE_EMPRESAS_DESCOBERTA);
}
