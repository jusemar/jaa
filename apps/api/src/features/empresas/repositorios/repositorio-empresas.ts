import type { Banco } from "@jaa/banco";
import { empresas, identidades, membrosEmpresa } from "@jaa/banco/schema";
import type { PapelMembroEmpresa } from "@jaa/contratos";
import { and, asc, eq } from "drizzle-orm";

// Empresa como vista por um membro: dados da empresa + identidade empresarial + papel do membro.
export interface EmpresaDoMembroRegistro {
  id: string;
  slug: string;
  status: "ativa";
  criadoEm: Date;
  atualizadoEm: Date;
  identidadeId: string;
  nome: string;
  nomeUsuario: string;
  papel: PapelMembroEmpresa;
}

export type ViolacaoUnicaEmpresa = "slug" | "nomeUsuario";

const RESTRICOES_UNICAS = new Map<string, ViolacaoUnicaEmpresa>([
  ["empresas_slug_unico", "slug"],
  ["identidades_nome_usuario_unico", "nomeUsuario"],
]);

export class ErroViolacaoUnicaEmpresa extends Error {
  constructor(readonly violacao: ViolacaoUnicaEmpresa) {
    super(`Violação de unicidade ao gravar empresa: ${violacao}`);
  }
}

function violacaoUnica(erro: unknown): ViolacaoUnicaEmpresa | null {
  for (const candidato of [erro, erro instanceof Error ? erro.cause : undefined]) {
    if (typeof candidato === "object" && candidato !== null && "code" in candidato && candidato.code === "23505" && "constraint" in candidato) {
      return typeof candidato.constraint === "string" ? (RESTRICOES_UNICAS.get(candidato.constraint) ?? null) : null;
    }
  }
  return null;
}

const colunasEmpresaDoMembro = {
  id: empresas.id,
  slug: empresas.slug,
  status: empresas.status,
  criadoEm: empresas.criadoEm,
  atualizadoEm: empresas.atualizadoEm,
  identidadeId: identidades.id,
  nome: identidades.nomeExibicao,
  nomeUsuario: identidades.nomeUsuario,
  papel: membrosEmpresa.papel,
};

/**
 * Fundação da empresa numa ÚNICA transação: empresa → identidade empresarial → vínculo de proprietário.
 * Qualquer falha desfaz tudo; o banco ainda confere no commit (trigger diferido) que a empresa tem
 * identidade e proprietário. `usuarioId` vem da sessão.
 */
export async function inserirEmpresaComProprietario(
  banco: Banco,
  { usuarioId, nome, nomeUsuario, slug }: { usuarioId: string; nome: string; nomeUsuario: string; slug: string },
): Promise<string> {
  try {
    return await banco.transaction(async (transacao) => {
      const [empresa] = await transacao.insert(empresas).values({ slug }).returning({ id: empresas.id });
      if (!empresa) throw new Error("Inserção de empresa não retornou registro.");
      await transacao.insert(identidades).values({ tipo: "empresarial", empresaId: empresa.id, nomeExibicao: nome, nomeUsuario });
      await transacao.insert(membrosEmpresa).values({ empresaId: empresa.id, usuarioId, papel: "proprietario" });
      return empresa.id;
    });
  } catch (erro) {
    const violacao = violacaoUnica(erro);
    if (violacao) throw new ErroViolacaoUnicaEmpresa(violacao);
    throw erro;
  }
}

// Empresas que a conta pode operar (qualquer papel), da mais antiga para a mais nova.
export async function listarEmpresasDoUsuario(banco: Banco, usuarioId: string): Promise<EmpresaDoMembroRegistro[]> {
  return banco
    .select(colunasEmpresaDoMembro)
    .from(membrosEmpresa)
    .innerJoin(empresas, eq(empresas.id, membrosEmpresa.empresaId))
    .innerJoin(identidades, eq(identidades.empresaId, empresas.id))
    .where(eq(membrosEmpresa.usuarioId, usuarioId))
    .orderBy(asc(empresas.criadoEm), asc(empresas.id));
}

// Só devolve a empresa se a conta for membro dela; caso contrário null (sem revelar existência).
export async function buscarEmpresaDoUsuario(banco: Banco, usuarioId: string, empresaId: string): Promise<EmpresaDoMembroRegistro | null> {
  const [empresa] = await banco
    .select(colunasEmpresaDoMembro)
    .from(membrosEmpresa)
    .innerJoin(empresas, eq(empresas.id, membrosEmpresa.empresaId))
    .innerJoin(identidades, eq(identidades.empresaId, empresas.id))
    .where(and(eq(membrosEmpresa.usuarioId, usuarioId), eq(membrosEmpresa.empresaId, empresaId)))
    .limit(1);
  return empresa ?? null;
}

export async function buscarPapelDoUsuarioNaEmpresa(banco: Banco, usuarioId: string, empresaId: string): Promise<PapelMembroEmpresa | null> {
  const [membro] = await banco
    .select({ papel: membrosEmpresa.papel })
    .from(membrosEmpresa)
    .where(and(eq(membrosEmpresa.usuarioId, usuarioId), eq(membrosEmpresa.empresaId, empresaId)))
    .limit(1);
  return membro?.papel ?? null;
}

// Identidade empresarial → empresa dona (null se a identidade não for empresarial).
export async function buscarEmpresaDaIdentidade(banco: Banco, identidadeId: string): Promise<string | null> {
  const [identidade] = await banco
    .select({ empresaId: identidades.empresaId })
    .from(identidades)
    .where(and(eq(identidades.id, identidadeId), eq(identidades.tipo, "empresarial")))
    .limit(1);
  return identidade?.empresaId ?? null;
}

// Atualiza dados básicos numa transação: nome (na identidade empresarial) e/ou slug (na empresa).
export async function atualizarDadosBasicosEmpresa(banco: Banco, empresaId: string, dados: { nome?: string | undefined; slug?: string | undefined }) {
  try {
    await banco.transaction(async (transacao) => {
      if (dados.nome !== undefined) {
        await transacao.update(identidades).set({ nomeExibicao: dados.nome }).where(eq(identidades.empresaId, empresaId));
      }
      await transacao
        .update(empresas)
        .set({ ...(dados.slug !== undefined ? { slug: dados.slug } : {}), atualizadoEm: new Date() })
        .where(eq(empresas.id, empresaId));
    });
  } catch (erro) {
    const violacao = violacaoUnica(erro);
    if (violacao) throw new ErroViolacaoUnicaEmpresa(violacao);
    throw erro;
  }
}
