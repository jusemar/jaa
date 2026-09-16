import type { Banco } from "@jaa/banco";
import { mensagens, participantesConversa, recebimentosMensagem } from "@jaa/banco/schema";
import { and, eq, exists, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";

export interface MensagemRecebidaRegistro {
  mensagemId: string;
  conversaId: string;
}

/**
 * Das mensagens pedidas, somente as RECEBIDAS pela identidade: de conversa em que ela participa e
 * enviadas por OUTRA identidade. Mensagem própria, de terceiros ou inexistente não volta.
 */
export async function listarMensagensRecebidasPorIdentidade(
  banco: Banco,
  identidadeId: string,
  mensagemIds: string[],
): Promise<MensagemRecebidaRegistro[]> {
  return banco
    .select({ mensagemId: mensagens.id, conversaId: mensagens.conversaId })
    .from(mensagens)
    .innerJoin(
      participantesConversa,
      and(eq(participantesConversa.conversaId, mensagens.conversaId), eq(participantesConversa.identidadeId, identidadeId)),
    )
    .where(and(inArray(mensagens.id, mensagemIds), ne(mensagens.remetenteIdentidadeId, identidadeId)));
}

/**
 * Grava as confirmações de recebimento numa única instrução. PK (mensagem, destinatário) +
 * ON CONFLICT DO NOTHING: ACKs repetidos ou simultâneos (várias abas) nunca duplicam; só as linhas
 * realmente novas voltam, para que apenas elas gerem evento realtime.
 */
export async function registrarRecebimentos(
  banco: Banco,
  destinatarioIdentidadeId: string,
  recebidas: MensagemRecebidaRegistro[],
): Promise<MensagemRecebidaRegistro[]> {
  if (recebidas.length === 0) return [];

  return banco
    .insert(recebimentosMensagem)
    .values(recebidas.map(({ mensagemId, conversaId }) => ({ mensagemId, conversaId, destinatarioIdentidadeId })))
    .onConflictDoNothing({ target: [recebimentosMensagem.mensagemId, recebimentosMensagem.destinatarioIdentidadeId] })
    .returning({ mensagemId: recebimentosMensagem.mensagemId, conversaId: recebimentosMensagem.conversaId });
}

export async function mensagemRecebidaNaConversa(
  banco: Banco,
  identidadeId: string,
  conversaId: string,
  mensagemId: string,
): Promise<boolean> {
  const [linha] = await banco
    .select({ id: mensagens.id })
    .from(mensagens)
    .where(
      and(eq(mensagens.id, mensagemId), eq(mensagens.conversaId, conversaId), ne(mensagens.remetenteIdentidadeId, identidadeId)),
    )
    .limit(1);

  return linha !== undefined;
}

/**
 * Avança o marcador de leitura da identidade na conversa até `ateMensagemId`, NUNCA para trás.
 * Uma instrução condicional: sob READ COMMITTED o PostgreSQL reavalia o WHERE na versão mais nova
 * da linha bloqueada, então confirmações simultâneas ou fora de ordem não fazem o marcador regredir.
 * A validação da mensagem (desta conversa, de outra identidade) está na mesma instrução.
 * Retorna true somente se o marcador avançou.
 */
export async function avancarMarcadorLeitura(
  banco: Banco,
  identidadeId: string,
  conversaId: string,
  ateMensagemId: string,
): Promise<boolean> {
  const mensagemValida = banco
    .select({ id: sql`1` })
    .from(mensagens)
    .where(
      and(eq(mensagens.id, ateMensagemId), eq(mensagens.conversaId, conversaId), ne(mensagens.remetenteIdentidadeId, identidadeId)),
    );

  const atualizadas = await banco
    .update(participantesConversa)
    .set({ lidaAteMensagemId: ateMensagemId })
    .where(
      and(
        eq(participantesConversa.conversaId, conversaId),
        eq(participantesConversa.identidadeId, identidadeId),
        or(isNull(participantesConversa.lidaAteMensagemId), lt(participantesConversa.lidaAteMensagemId, ateMensagemId)),
        exists(mensagemValida),
      ),
    )
    .returning({ conversaId: participantesConversa.conversaId });

  return atualizadas.length > 0;
}

export async function obterMarcadorLeitura(banco: Banco, identidadeId: string, conversaId: string): Promise<string | null> {
  const [linha] = await banco
    .select({ lidaAteMensagemId: participantesConversa.lidaAteMensagemId })
    .from(participantesConversa)
    .where(and(eq(participantesConversa.conversaId, conversaId), eq(participantesConversa.identidadeId, identidadeId)))
    .limit(1);

  return linha?.lidaAteMensagemId ?? null;
}
