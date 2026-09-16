import type { Banco } from "@jaa/banco";
import { conversas, identidades, mensagens, participantesConversa } from "@jaa/banco/schema";
import { and, asc, desc, eq, inArray, lt, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { colunasMensagemCompleta, visivelPara, type MensagemRegistro } from "../../mensagens/repositorios/repositorio-mensagens.js";
import { naoLidasSql } from "./nao-lidas-sql.js";

export interface ParticipanteRegistro {
  identidadeId: string;
  tipo: "pessoal" | "empresarial";
  nomeExibicao: string;
  nomeUsuario: string;
}

// Mesma chave para A↔B e B↔A.
function chaveConversaDireta(identidadeA: string, identidadeB: string): string {
  return identidadeA < identidadeB ? `${identidadeA}:${identidadeB}` : `${identidadeB}:${identidadeA}`;
}

/**
 * Retorna a conversa direta entre duas identidades, criando-a se ainda não existir.
 * Concorrência: a chave direta é UNIQUE. Duas criações simultâneas disputam a mesma linha;
 * a perdedora não insere nada (ON CONFLICT DO NOTHING) e lê a conversa já confirmada.
 * Conversa e participantes são gravados na mesma transação: nunca existe conversa sem os dois.
 */
export async function obterOuCriarConversaDireta(
  banco: Banco,
  identidadeA: string,
  identidadeB: string,
): Promise<{ conversaId: string; criada: boolean }> {
  const chaveDireta = chaveConversaDireta(identidadeA, identidadeB);

  const criada = await banco.transaction(async (transacao) => {
    const [nova] = await transacao
      .insert(conversas)
      .values({ tipo: "direta", chaveDireta })
      .onConflictDoNothing({ target: conversas.chaveDireta })
      .returning({ id: conversas.id });

    if (!nova) {
      return null;
    }

    await transacao.insert(participantesConversa).values([
      { conversaId: nova.id, identidadeId: identidadeA },
      { conversaId: nova.id, identidadeId: identidadeB },
    ]);

    return nova.id;
  });

  if (criada) {
    return { conversaId: criada, criada: true };
  }

  const [existente] = await banco
    .select({ id: conversas.id })
    .from(conversas)
    .where(eq(conversas.chaveDireta, chaveDireta))
    .limit(1);

  if (!existente) {
    throw new Error("Conversa direta não encontrada após conflito de criação.");
  }

  return { conversaId: existente.id, criada: false };
}

export async function listarParticipantesDaConversa(banco: Banco, conversaId: string): Promise<ParticipanteRegistro[]> {
  return banco
    .select({
      identidadeId: participantesConversa.identidadeId,
      tipo: identidades.tipo,
      nomeExibicao: identidades.nomeExibicao,
      nomeUsuario: identidades.nomeUsuario,
    })
    .from(participantesConversa)
    .innerJoin(identidades, eq(identidades.id, participantesConversa.identidadeId))
    .where(eq(participantesConversa.conversaId, conversaId))
    .orderBy(asc(identidades.nomeUsuario));
}

export interface ItemListaConversasRegistro {
  conversaId: string;
  tipo: "direta";
  outraIdentidade: ParticipanteRegistro;
  ultimaMensagem: MensagemRegistro;
  naoLidas: number;
}

/**
 * Conversas da identidade com a mensagem mais recente de cada uma, da atividade mais recente
 * para a mais antiga. Ordem e cursor = id da última mensagem (UUIDv7): único entre conversas,
 * portanto a ordem é total e determinística mesmo com horários iguais.
 *
 * Uma única consulta, sem N+1 e sem ler históricos:
 * 1. `pagina`: para cada participação da identidade (índice por identidade_id), a última mensagem
 *    vem de uma busca LATERAL `LIMIT 1` no índice (conversa_id, id), somente leitura de índice;
 *    ordena só esses ids e corta a página;
 * 2. só as linhas da página buscam conteúdo da mensagem, conversa e a outra identidade.
 * Custo da etapa 1 cresce com o número de conversas DA identidade (não com o de mensagens).
 * Conversas sem mensagens não têm atividade e não aparecem.
 */
export async function listarConversasDaIdentidade(
  banco: Banco,
  identidadeId: string,
  { antesDe, limite }: { antesDe?: string | undefined; limite: number },
): Promise<{ conversas: ItemListaConversasRegistro[]; haMais: boolean }> {
  const participacao = alias(participantesConversa, "participacao");
  const outroParticipante = alias(participantesConversa, "outro_participante");

  const ultimaMensagem = banco
    .select({ ultimaMensagemId: sql<string>`${mensagens.id}`.as("ultima_mensagem_id") })
    .from(mensagens)
    // Última mensagem que ESTA identidade vê: as excluídas "para mim" são puladas.
    .where(and(eq(mensagens.conversaId, participacao.conversaId), visivelPara(identidadeId)))
    .orderBy(desc(mensagens.id))
    .limit(1)
    .as("ultima_mensagem");

  const pagina = banco
    .select({
      conversaId: participacao.conversaId,
      lidaAteMensagemId: participacao.lidaAteMensagemId,
      ultimaMensagemId: ultimaMensagem.ultimaMensagemId,
    })
    .from(participacao)
    .crossJoinLateral(ultimaMensagem)
    .where(
      and(
        eq(participacao.identidadeId, identidadeId),
        antesDe ? lt(ultimaMensagem.ultimaMensagemId, antesDe) : undefined,
      ),
    )
    .orderBy(desc(ultimaMensagem.ultimaMensagemId))
    .limit(limite + 1)
    .as("pagina");

  const linhas = await banco
    .select({
      conversaId: pagina.conversaId,
      tipo: conversas.tipo,
      outraIdentidade: {
        identidadeId: identidades.id,
        tipo: identidades.tipo,
        nomeExibicao: identidades.nomeExibicao,
        nomeUsuario: identidades.nomeUsuario,
      },
      // Estado e referência de resposta calculados só para as linhas da página.
      ultimaMensagem: colunasMensagemCompleta,
      // Contagem limitada, calculada só para as linhas da página.
      naoLidas: naoLidasSql(sql`${pagina.conversaId}`, sql`${pagina.lidaAteMensagemId}`, identidadeId),
    })
    .from(pagina)
    .innerJoin(conversas, eq(conversas.id, pagina.conversaId))
    .innerJoin(mensagens, eq(mensagens.id, pagina.ultimaMensagemId))
    .innerJoin(
      outroParticipante,
      and(eq(outroParticipante.conversaId, pagina.conversaId), ne(outroParticipante.identidadeId, identidadeId)),
    )
    .innerJoin(identidades, eq(identidades.id, outroParticipante.identidadeId))
    .orderBy(desc(pagina.ultimaMensagemId));

  return { conversas: linhas.slice(0, limite), haMais: linhas.length > limite };
}

export async function listarIdsParticipantesDaConversa(banco: Banco, conversaId: string): Promise<string[]> {
  const linhas = await banco
    .select({ identidadeId: participantesConversa.identidadeId })
    .from(participantesConversa)
    .where(eq(participantesConversa.conversaId, conversaId));

  return linhas.map((linha) => linha.identidadeId);
}

export async function listarIdsParticipantesPorConversa(banco: Banco, conversaIds: string[]): Promise<Map<string, string[]>> {
  const linhas = await banco
    .select({ conversaId: participantesConversa.conversaId, identidadeId: participantesConversa.identidadeId })
    .from(participantesConversa)
    .where(inArray(participantesConversa.conversaId, conversaIds));

  const porConversa = new Map<string, string[]>();
  for (const { conversaId, identidadeId } of linhas) {
    porConversa.set(conversaId, [...(porConversa.get(conversaId) ?? []), identidadeId]);
  }
  return porConversa;
}

// Não lidas atuais de uma conversa para uma identidade (null se ela não participa).
export async function contarNaoLidas(banco: Banco, conversaId: string, identidadeId: string): Promise<number | null> {
  const [linha] = await banco
    .select({
      naoLidas: naoLidasSql(sql`${participantesConversa.conversaId}`, sql`${participantesConversa.lidaAteMensagemId}`, identidadeId),
    })
    .from(participantesConversa)
    .where(and(eq(participantesConversa.conversaId, conversaId), eq(participantesConversa.identidadeId, identidadeId)))
    .limit(1);
  return linha?.naoLidas ?? null;
}
