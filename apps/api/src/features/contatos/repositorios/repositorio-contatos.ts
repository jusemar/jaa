import type { Banco } from "@jaa/banco";
import { contatos, empresas, identidades, preferenciasIdentidade, users } from "@jaa/banco/schema";
import { LIMITE_RESULTADOS_EXTERNOS } from "@jaa/contratos";
import { and, asc, eq, ilike, inArray, ne, notInArray, or, sql } from "drizzle-orm";

/*
 * AGENDA e BUSCA. Tudo escopado pela identidade ATUANTE: a agenda pessoal e a da empresa que a mesma
 * conta opera são agendas diferentes, e nenhuma consulta daqui aceita identidade vinda do cliente.
 */

export interface IdentidadePublica {
  identidadeId: string;
  tipo: "pessoal" | "empresarial";
  nomeExibicao: string;
  nomeUsuario: string;
}

export interface ContatoRegistro {
  identidade: IdentidadePublica;
  apelido: string | null;
  favorito: boolean;
  criadoEm: Date;
}

const colunasPublicas = {
  identidadeId: identidades.id,
  tipo: identidades.tipo,
  nomeExibicao: identidades.nomeExibicao,
  nomeUsuario: identidades.nomeUsuario,
};

export async function listarContatos(banco: Banco, identidadeId: string): Promise<ContatoRegistro[]> {
  const linhas = await banco
    .select({ ...colunasPublicas, apelido: contatos.apelido, favorito: contatos.favorito, criadoEm: contatos.criadoEm })
    .from(contatos)
    .innerJoin(identidades, eq(identidades.id, contatos.contatoIdentidadeId))
    .where(eq(contatos.identidadeId, identidadeId))
    .orderBy(asc(identidades.nomeExibicao));

  return linhas.map(({ apelido, favorito, criadoEm, ...identidade }) => ({ identidade, apelido, favorito, criadoEm }));
}

export async function contatoExiste(banco: Banco, identidadeId: string, contatoIdentidadeId: string): Promise<boolean> {
  const [linha] = await banco
    .select({ id: contatos.contatoIdentidadeId })
    .from(contatos)
    .where(and(eq(contatos.identidadeId, identidadeId), eq(contatos.contatoIdentidadeId, contatoIdentidadeId)))
    .limit(1);
  return linha !== undefined;
}

/**
 * Salva na agenda de QUEM PEDIU. Unilateral por definição: nenhuma linha é criada no sentido oposto.
 * Repetir é idempotente (atualiza o apelido).
 */
export async function salvarContato(banco: Banco, identidadeId: string, contatoIdentidadeId: string, apelido: string | null): Promise<void> {
  await banco
    .insert(contatos)
    .values({ identidadeId, contatoIdentidadeId, apelido })
    .onConflictDoUpdate({ target: [contatos.identidadeId, contatos.contatoIdentidadeId], set: { apelido } });
}

export async function removerContato(banco: Banco, identidadeId: string, contatoIdentidadeId: string): Promise<boolean> {
  const removidos = await banco
    .delete(contatos)
    .where(and(eq(contatos.identidadeId, identidadeId), eq(contatos.contatoIdentidadeId, contatoIdentidadeId)))
    .returning({ id: contatos.contatoIdentidadeId });
  return removidos.length > 0;
}

export async function buscarIdentidadePublica(banco: Banco, identidadeId: string): Promise<IdentidadePublica | null> {
  const [linha] = await banco.select(colunasPublicas).from(identidades).where(eq(identidades.id, identidadeId)).limit(1);
  return linha ?? null;
}

/** Contatos que casam com o termo (nome ou @usuario). Busca na MINHA agenda, sempre primeiro. */
export async function buscarNosContatos(banco: Banco, identidadeId: string, termo: string): Promise<ContatoRegistro[]> {
  const padrao = `%${termo}%`;
  const linhas = await banco
    .select({ ...colunasPublicas, apelido: contatos.apelido, favorito: contatos.favorito, criadoEm: contatos.criadoEm })
    .from(contatos)
    .innerJoin(identidades, eq(identidades.id, contatos.contatoIdentidadeId))
    .where(
      and(
        eq(contatos.identidadeId, identidadeId),
        or(ilike(identidades.nomeExibicao, padrao), ilike(identidades.nomeUsuario, padrao), ilike(sql`coalesce(${contatos.apelido}, '')`, padrao)),
      ),
    )
    .orderBy(asc(identidades.nomeExibicao))
    .limit(20);

  return linhas.map(({ apelido, favorito, criadoEm, ...identidade }) => ({ identidade, apelido, favorito, criadoEm }));
}

/**
 * DESCOBERTA no Jaa, limitada. Encontra por nome e @usuario; por TELEFONE só encontra quem escolheu
 * ser encontrado assim (`preferencias_identidade.buscavel_por_telefone`, padrão FALSE).
 *
 * O telefone jamais é devolvido — ele só participa da comparação, dentro do banco.
 */
export async function buscarNoJaa(
  banco: Banco,
  { identidadeAtual, termo, telefoneNormalizado, excluir }: { identidadeAtual: string; termo: string; telefoneNormalizado: string | null; excluir: string[] },
): Promise<IdentidadePublica[]> {
  const padrao = `%${termo}%`;
  const condicoes = [or(ilike(identidades.nomeExibicao, padrao), ilike(identidades.nomeUsuario, padrao))];

  if (telefoneNormalizado) {
    // Opt-in: sem a preferência ligada, a pessoa simplesmente não aparece na busca por telefone.
    condicoes.push(
      sql`exists (
        select 1 from ${users}
        join ${preferenciasIdentidade} on ${preferenciasIdentidade.identidadeId} = ${identidades.id}
        where ${users.id} = ${identidades.usuarioId}
          and ${users.phoneNumber} = ${telefoneNormalizado}
          and ${preferenciasIdentidade.buscavelPorTelefone} = true
      )`,
    );
  }

  const filtros = [
    or(...condicoes),
    ne(identidades.id, identidadeAtual),
    // Empresa só aparece quando está ativa (a identidade empresarial é a loja).
    sql`(${identidades.tipo} = 'pessoal' or exists (select 1 from ${empresas} where ${empresas.id} = ${identidades.empresaId} and ${empresas.status} = 'ativa'))`,
  ];
  // Quem já apareceu em "meus contatos" não se repete na descoberta.
  if (excluir.length > 0) filtros.push(notInArray(identidades.id, excluir));

  return banco
    .select(colunasPublicas)
    .from(identidades)
    .where(and(...filtros))
    .orderBy(asc(identidades.nomeExibicao))
    .limit(LIMITE_RESULTADOS_EXTERNOS);
}

/** Quais destas identidades já estão na minha agenda (para marcar o resultado da busca). */
export async function filtrarContatosConhecidos(banco: Banco, identidadeId: string, identidadeIds: string[]): Promise<Map<string, string | null>> {
  if (identidadeIds.length === 0) return new Map();
  const linhas = await banco
    .select({ id: contatos.contatoIdentidadeId, apelido: contatos.apelido })
    .from(contatos)
    .where(and(eq(contatos.identidadeId, identidadeId), inArray(contatos.contatoIdentidadeId, identidadeIds)));
  return new Map(linhas.map((linha) => [linha.id, linha.apelido]));
}
