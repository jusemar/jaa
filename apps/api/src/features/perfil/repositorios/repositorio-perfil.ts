import type { Banco } from "@jaa/banco";
import { contatos, excecoesPrivacidade, identidades, preferenciasIdentidade } from "@jaa/banco/schema";
import type { DecisaoPrivacidade, StatusEscolhido, VisibilidadePerfil } from "@jaa/contratos";
import { and, asc, eq } from "drizzle-orm";

/*
 * PERFIL e PRIVACIDADE. Toda consulta é escopada pela identidade — nunca pela conta —, porque a mesma
 * conta opera identidades diferentes e cada uma tem o seu perfil, o seu status e a sua privacidade.
 */

export interface PreferenciasPerfil {
  buscavelPorTelefone: boolean;
  statusEscolhido: StatusEscolhido;
  visibilidadeFoto: VisibilidadePerfil;
  visibilidadeStatus: VisibilidadePerfil;
  visibilidadePresenca: VisibilidadePerfil;
}

// Sem linha em preferencias_identidade valem estes padrões — exatamente os defaults do banco.
export const PREFERENCIAS_PADRAO: PreferenciasPerfil = {
  buscavelPorTelefone: false,
  statusEscolhido: "disponivel",
  visibilidadeFoto: "todos",
  visibilidadeStatus: "contatos",
  visibilidadePresenca: "todos",
};

export interface PerfilRegistro {
  identidadeId: string;
  tipo: "pessoal" | "empresarial";
  nomeExibicao: string;
  nomeUsuario: string;
  fotoChave: string | null;
  fraseStatus: string | null;
  cidade: string | null;
  sobre: string | null;
  preferencias: PreferenciasPerfil;
}

const colunasPerfil = {
  identidadeId: identidades.id,
  tipo: identidades.tipo,
  nomeExibicao: identidades.nomeExibicao,
  nomeUsuario: identidades.nomeUsuario,
  fotoChave: identidades.fotoChave,
  fraseStatus: identidades.fraseStatus,
  cidade: identidades.cidade,
  sobre: identidades.sobre,
};

const colunasPreferencias = {
  buscavelPorTelefone: preferenciasIdentidade.buscavelPorTelefone,
  statusEscolhido: preferenciasIdentidade.statusEscolhido,
  visibilidadeFoto: preferenciasIdentidade.visibilidadeFoto,
  visibilidadeStatus: preferenciasIdentidade.visibilidadeStatus,
  visibilidadePresenca: preferenciasIdentidade.visibilidadePresenca,
};

export async function buscarPerfil(banco: Banco, identidadeId: string): Promise<PerfilRegistro | null> {
  const [linha] = await banco
    .select({ ...colunasPerfil, ...colunasPreferencias })
    .from(identidades)
    // LEFT JOIN: a linha de preferências é opcional; sem ela valem os padrões acima.
    .leftJoin(preferenciasIdentidade, eq(preferenciasIdentidade.identidadeId, identidades.id))
    .where(eq(identidades.id, identidadeId))
    .limit(1);

  if (!linha) return null;
  const { buscavelPorTelefone, statusEscolhido, visibilidadeFoto, visibilidadeStatus, visibilidadePresenca, ...perfil } = linha;
  return {
    ...perfil,
    preferencias: {
      buscavelPorTelefone: buscavelPorTelefone ?? PREFERENCIAS_PADRAO.buscavelPorTelefone,
      statusEscolhido: statusEscolhido ?? PREFERENCIAS_PADRAO.statusEscolhido,
      visibilidadeFoto: visibilidadeFoto ?? PREFERENCIAS_PADRAO.visibilidadeFoto,
      visibilidadeStatus: visibilidadeStatus ?? PREFERENCIAS_PADRAO.visibilidadeStatus,
      visibilidadePresenca: visibilidadePresenca ?? PREFERENCIAS_PADRAO.visibilidadePresenca,
    },
  };
}

export async function atualizarPerfil(
  banco: Banco,
  identidadeId: string,
  campos: { nomeExibicao?: string; fraseStatus?: string | null; cidade?: string | null; sobre?: string | null },
): Promise<void> {
  await banco.update(identidades).set(campos).where(eq(identidades.id, identidadeId));
}

/** Upsert: a primeira mudança de privacidade cria a linha; as seguintes só alteram o que foi enviado. */
export async function atualizarPreferencias(banco: Banco, identidadeId: string, campos: Partial<PreferenciasPerfil>): Promise<void> {
  await banco
    .insert(preferenciasIdentidade)
    .values({ identidadeId, ...PREFERENCIAS_PADRAO, ...campos })
    .onConflictDoUpdate({ target: preferenciasIdentidade.identidadeId, set: campos });
}

/** Troca a foto e devolve a chave ANTERIOR, para que o arquivo velho possa ser removido do storage. */
export async function definirFotoChave(banco: Banco, identidadeId: string, fotoChave: string | null): Promise<string | null> {
  const [linha] = await banco.select({ anterior: identidades.fotoChave }).from(identidades).where(eq(identidades.id, identidadeId)).limit(1);
  await banco.update(identidades).set({ fotoChave }).where(eq(identidades.id, identidadeId));
  return linha?.anterior ?? null;
}

export async function ehContatoDe(banco: Banco, identidadeId: string, contatoIdentidadeId: string): Promise<boolean> {
  const [linha] = await banco
    .select({ id: contatos.contatoIdentidadeId })
    .from(contatos)
    .where(and(eq(contatos.identidadeId, identidadeId), eq(contatos.contatoIdentidadeId, contatoIdentidadeId)))
    .limit(1);
  return linha !== undefined;
}

/** A exceção que o DONO do perfil definiu para quem está olhando. */
export async function buscarExcecao(banco: Banco, donoId: string, observadorId: string): Promise<DecisaoPrivacidade | null> {
  const [linha] = await banco
    .select({ decisao: excecoesPrivacidade.decisao })
    .from(excecoesPrivacidade)
    .where(and(eq(excecoesPrivacidade.identidadeId, donoId), eq(excecoesPrivacidade.alvoIdentidadeId, observadorId)))
    .limit(1);
  return linha?.decisao ?? null;
}

export interface ExcecaoRegistro {
  identidade: { identidadeId: string; nomeExibicao: string; nomeUsuario: string; tipo: "pessoal" | "empresarial" };
  decisao: DecisaoPrivacidade;
}

export async function listarExcecoes(banco: Banco, identidadeId: string): Promise<ExcecaoRegistro[]> {
  const linhas = await banco
    .select({
      identidadeId: identidades.id,
      nomeExibicao: identidades.nomeExibicao,
      nomeUsuario: identidades.nomeUsuario,
      tipo: identidades.tipo,
      decisao: excecoesPrivacidade.decisao,
    })
    .from(excecoesPrivacidade)
    .innerJoin(identidades, eq(identidades.id, excecoesPrivacidade.alvoIdentidadeId))
    .where(eq(excecoesPrivacidade.identidadeId, identidadeId))
    .orderBy(asc(identidades.nomeExibicao));

  return linhas.map(({ decisao, ...identidade }) => ({ identidade, decisao }));
}

export async function salvarExcecao(banco: Banco, identidadeId: string, alvoIdentidadeId: string, decisao: DecisaoPrivacidade): Promise<void> {
  await banco
    .insert(excecoesPrivacidade)
    .values({ identidadeId, alvoIdentidadeId, decisao })
    .onConflictDoUpdate({ target: [excecoesPrivacidade.identidadeId, excecoesPrivacidade.alvoIdentidadeId], set: { decisao } });
}

export async function removerExcecao(banco: Banco, identidadeId: string, alvoIdentidadeId: string): Promise<boolean> {
  const removidas = await banco
    .delete(excecoesPrivacidade)
    .where(and(eq(excecoesPrivacidade.identidadeId, identidadeId), eq(excecoesPrivacidade.alvoIdentidadeId, alvoIdentidadeId)))
    .returning({ id: excecoesPrivacidade.alvoIdentidadeId });
  return removidas.length > 0;
}
