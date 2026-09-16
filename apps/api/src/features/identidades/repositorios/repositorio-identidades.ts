import type { Banco } from "@jaa/banco";
import { empresas, identidades } from "@jaa/banco/schema";
import { and, eq, isNull, or } from "drizzle-orm";

export type IdentidadeRegistro = typeof identidades.$inferSelect;

export type ViolacaoUnicaIdentidade = "nomeUsuario" | "identidadePessoalDoUsuario";

// Nomes das constraints definidas em packages/banco/src/tabelas/identidades/identidades.ts.
const RESTRICOES_UNICAS = new Map<string, ViolacaoUnicaIdentidade>([
  ["identidades_nome_usuario_unico", "nomeUsuario"],
  ["identidades_pessoal_por_usuario_unico", "identidadePessoalDoUsuario"],
]);

export class ErroViolacaoUnicaIdentidade extends Error {
  constructor(readonly violacao: ViolacaoUnicaIdentidade) {
    super(`Violação de unicidade em identidades: ${violacao}`);
  }
}

export async function buscarIdentidadePessoalDoUsuario(
  banco: Banco,
  usuarioId: string,
): Promise<IdentidadeRegistro | null> {
  const [identidade] = await banco
    .select()
    .from(identidades)
    .where(and(eq(identidades.usuarioId, usuarioId), eq(identidades.tipo, "pessoal")))
    .limit(1);

  return identidade ?? null;
}

export async function inserirIdentidadePessoal(
  banco: Banco,
  dados: { usuarioId: string; nomeExibicao: string; nomeUsuario: string },
): Promise<IdentidadeRegistro> {
  try {
    const [identidade] = await banco
      .insert(identidades)
      .values({ ...dados, tipo: "pessoal" })
      .returning();

    if (!identidade) {
      throw new Error("Inserção de identidade não retornou registro.");
    }

    return identidade;
  } catch (erro) {
    const violacao = identificarViolacaoUnica(erro);
    if (violacao) {
      throw new ErroViolacaoUnicaIdentidade(violacao);
    }
    throw erro;
  }
}

// O Drizzle encapsula o erro do driver `pg` em `cause`; 23505 = unique_violation.
function identificarViolacaoUnica(erro: unknown): ViolacaoUnicaIdentidade | null {
  const candidatos = [erro, erro instanceof Error ? erro.cause : undefined];

  for (const candidato of candidatos) {
    if (
      typeof candidato === "object" &&
      candidato !== null &&
      "code" in candidato &&
      candidato.code === "23505" &&
      "constraint" in candidato &&
      typeof candidato.constraint === "string"
    ) {
      return RESTRICOES_UNICAS.get(candidato.constraint) ?? null;
    }
  }

  return null;
}

// `nomeUsuario` já deve estar na forma canônica (ver normalizarNomeUsuario em @jaa/contratos).
export async function buscarIdentidadePessoalPorNomeUsuario(
  banco: Banco,
  nomeUsuario: string,
): Promise<IdentidadeRegistro | null> {
  const [identidade] = await banco
    .select()
    .from(identidades)
    .where(and(eq(identidades.nomeUsuario, nomeUsuario), eq(identidades.tipo, "pessoal")))
    .limit(1);

  return identidade ?? null;
}

// Dados PÚBLICOS de uma identidade (nunca conta, telefone ou e-mail).
export async function buscarDadosPublicosIdentidade(
  banco: Banco,
  identidadeId: string,
): Promise<{ identidadeId: string; tipo: "pessoal" | "empresarial"; nomeExibicao: string; nomeUsuario: string } | null> {
  const [identidade] = await banco
    .select({ identidadeId: identidades.id, tipo: identidades.tipo, nomeExibicao: identidades.nomeExibicao, nomeUsuario: identidades.nomeUsuario })
    .from(identidades)
    .where(eq(identidades.id, identidadeId))
    .limit(1);
  return identidade ?? null;
}

/**
 * Identidade que pode ser procurada para conversar pelo @usuario: pessoa, ou empresa com status que
 * permite operação pública (hoje "ativa"). Não diz nada sobre quem OPERA a empresa.
 * `nomeUsuario` já deve estar na forma canônica.
 */
export async function buscarIdentidadeContatavelPorNomeUsuario(banco: Banco, nomeUsuario: string): Promise<IdentidadeRegistro | null> {
  const [linha] = await banco
    .select({ identidade: identidades })
    .from(identidades)
    .leftJoin(empresas, eq(empresas.id, identidades.empresaId))
    .where(and(eq(identidades.nomeUsuario, nomeUsuario), or(isNull(identidades.empresaId), eq(empresas.status, "ativa"))))
    .limit(1);
  return linha?.identidade ?? null;
}
