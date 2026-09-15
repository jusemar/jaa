import type { Banco } from "@jaa/banco";
import { conversas, identidades, mensagens, participantesConversa } from "@jaa/banco/schema";
import { and, asc, desc, eq, getTableColumns, lt, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { MensagemRegistro } from "../../mensagens/repositorios/repositorio-mensagens.js";

export interface ParticipanteRegistro {
  identidadeId: string;
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
    .where(eq(mensagens.conversaId, participacao.conversaId))
    .orderBy(desc(mensagens.id))
    .limit(1)
    .as("ultima_mensagem");

  const pagina = banco
    .select({ conversaId: participacao.conversaId, ultimaMensagemId: ultimaMensagem.ultimaMensagemId })
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
        nomeExibicao: identidades.nomeExibicao,
        nomeUsuario: identidades.nomeUsuario,
      },
      ultimaMensagem: getTableColumns(mensagens),
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
