import { randomBytes } from "node:crypto";
import type { Banco } from "@jaa/banco";
import { identidades, identidadesVisitantes } from "@jaa/banco/schema";
import { PREFIXO_NOME_USUARIO_VISITANTE, VISITANTE_INATIVIDADE_MAXIMA_MS } from "@jaa/contratos";
import { and, eq, isNull, lt, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import type { MarcaVisitante } from "../lib/situacao-visitante.js";

type Executor = Banco | Parameters<Parameters<Banco["transaction"]>[0]>[0];

export interface VisitanteRegistro extends MarcaVisitante {
  identidadeId: string;
  nomeExibicao: string;
}

/*
 * A identidade NÃO é de visitante. Usada em toda consulta que procura "a identidade pessoal da conta"
 * ou identidades encontráveis por @usuario/busca: uma identidade visitante nunca é a pessoal de
 * ninguém, nunca é contatável pelo @usuario técnico e nunca aparece em pesquisa.
 */
export function naoEhVisitante(identidadeId: PgColumn): SQL {
  return sql`not exists (select 1 from ${identidadesVisitantes} where ${identidadesVisitantes.identidadeId} = ${identidadeId})`;
}

/** A identidade visitante da conta (qualquer situação), ou null. */
export async function buscarVisitanteDoUsuario(banco: Executor, usuarioId: string): Promise<VisitanteRegistro | null> {
  const [linha] = await banco
    .select({
      identidadeId: identidades.id,
      nomeExibicao: identidades.nomeExibicao,
      ultimaAtividadeEm: identidadesVisitantes.ultimaAtividadeEm,
      convertidaEm: identidadesVisitantes.convertidaEm,
      encerradaEm: identidadesVisitantes.encerradaEm,
    })
    .from(identidades)
    .innerJoin(identidadesVisitantes, eq(identidadesVisitantes.identidadeId, identidades.id))
    .where(and(eq(identidades.usuarioId, usuarioId), eq(identidades.tipo, "pessoal")))
    .limit(1);
  return linha ?? null;
}

// @usuario técnico: imprevisível e no prefixo reservado (ninguém consegue cadastrar um igual).
function nomeUsuarioTecnico(): string {
  return `${PREFIXO_NOME_USUARIO_VISITANTE}${randomBytes(9).toString("hex")}`;
}

/** Cria a identidade visitante da conta temporária (identidade pessoal + marca), numa transação. */
export async function inserirIdentidadeVisitante(banco: Banco, dados: { usuarioId: string; nomeExibicao: string }): Promise<VisitanteRegistro> {
  return banco.transaction(async (transacao) => {
    const [identidade] = await transacao
      .insert(identidades)
      .values({ usuarioId: dados.usuarioId, tipo: "pessoal", nomeExibicao: dados.nomeExibicao, nomeUsuario: nomeUsuarioTecnico() })
      .returning({ id: identidades.id, nomeExibicao: identidades.nomeExibicao });
    if (!identidade) throw new Error("Inserção de identidade visitante não retornou registro.");
    const [marca] = await transacao
      .insert(identidadesVisitantes)
      .values({ identidadeId: identidade.id })
      .returning({ ultimaAtividadeEm: identidadesVisitantes.ultimaAtividadeEm });
    if (!marca) throw new Error("Inserção da marca de visitante não retornou registro.");
    return { identidadeId: identidade.id, nomeExibicao: identidade.nomeExibicao, ultimaAtividadeEm: marca.ultimaAtividadeEm, convertidaEm: null, encerradaEm: null };
  });
}

// Renovar a cada requisição seria uma escrita por mensagem: um minuto de folga não muda um prazo de 24 h.
const INTERVALO_MINIMO_RENOVACAO = sql`interval '1 minute'`;

/**
 * Atividade válida: o prazo de 24 h recomeça agora (relógio do banco). Só renova visitante ATIVO e
 * ainda dentro do prazo — expirado não "ressuscita" por uma requisição atrasada.
 */
export async function registrarAtividadeVisitante(banco: Banco, identidadeId: string): Promise<void> {
  await banco
    .update(identidadesVisitantes)
    .set({ ultimaAtividadeEm: sql`now()` })
    .where(
      and(
        eq(identidadesVisitantes.identidadeId, identidadeId),
        isNull(identidadesVisitantes.convertidaEm),
        isNull(identidadesVisitantes.encerradaEm),
        lt(identidadesVisitantes.ultimaAtividadeEm, sql`now() - ${INTERVALO_MINIMO_RENOVACAO}`),
        sql`${identidadesVisitantes.ultimaAtividadeEm} >= now() - make_interval(secs => ${VISITANTE_INATIVIDADE_MAXIMA_MS / 1000})`,
      ),
    );
}
