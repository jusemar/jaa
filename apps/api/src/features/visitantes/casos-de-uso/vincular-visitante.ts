import type { Banco } from "@jaa/banco";
import {
  anexosMensagem,
  bloqueiosIdentidade,
  contatos,
  conversas,
  excecoesPrivacidade,
  identidades,
  identidadesVisitantes,
  mensagens,
  mensagensExcluidasParaIdentidade,
  participantesConversa,
  recebimentosMensagem,
  sessions,
  users,
} from "@jaa/banco/schema";
import { and, eq, ne, sql } from "drizzle-orm";
import { chaveConversaDireta } from "../../conversas/repositorios/repositorio-conversas.js";
import { situacaoDoVisitante } from "../lib/situacao-visitante.js";

type Transacao = Parameters<Parameters<Banco["transaction"]>[0]>[0];

export type ResultadoVinculo =
  // Conta NOVA: a própria identidade visitante passou a ser da conta (mesmo id, mesmas conversas).
  | { tipo: "convertida"; identidadeId: string; sessoesEncerradas: string[] }
  // Conta EXISTENTE: as conversas do visitante passaram para a identidade pessoal dela.
  | { tipo: "unida"; identidadeId: string; sessoesEncerradas: string[] }
  | { tipo: "nada" };

/**
 * O VISITANTE ENTROU NUMA CONTA (criou agora ou já tinha). Chamado pelo servidor de autenticação
 * logo depois de uma entrada bem-sucedida feita POR QUEM TINHA a sessão visitante — só quem tem o
 * cookie da sessão temporária E acabou de provar a conta (código, senha ou PIN) chega aqui. Nada vem
 * do cliente: as duas contas são as das sessões.
 *
 * Tudo numa transação: ou o histórico inteiro passa para a conta, ou nada muda.
 *
 * - Conta SEM identidade pessoal (acabou de nascer pelo código): a identidade visitante simplesmente
 *   muda de dona. Mesmo id → mesma conversa, mesmas mensagens, mesmos estados; nada é copiado. A
 *   expiração para (marca "convertida") e só falta a pessoa escolher nome e @usuario definitivos.
 * - Conta COM identidade pessoal: cada conversa do visitante passa para a pessoal. Se ela já conversava
 *   com aquela pessoa, as mensagens entram NA conversa existente (nunca duas conversas para o mesmo
 *   par). Conversa do visitante consigo mesmo (abriu o próprio link) é descartada.
 *
 * Por fim a conta temporária é apagada (com as sessões dela).
 */
export async function vincularVisitanteAConta(
  banco: Banco,
  { usuarioVisitanteId, usuarioContaId }: { usuarioVisitanteId: string; usuarioContaId: string },
): Promise<ResultadoVinculo> {
  if (usuarioVisitanteId === usuarioContaId) return { tipo: "nada" };

  return banco.transaction(async (transacao) => {
    // A marca travada: a rotina de expiração (ou outra entrada simultânea) não age no meio.
    const [visitante] = await transacao
      .select({
        identidadeId: identidades.id,
        ultimaAtividadeEm: identidadesVisitantes.ultimaAtividadeEm,
        convertidaEm: identidadesVisitantes.convertidaEm,
        encerradaEm: identidadesVisitantes.encerradaEm,
      })
      .from(identidadesVisitantes)
      .innerJoin(identidades, eq(identidades.id, identidadesVisitantes.identidadeId))
      .where(eq(identidades.usuarioId, usuarioVisitanteId))
      .for("update", { of: identidadesVisitantes })
      .limit(1);

    // Visitante expirado não é convertido: a sessão dele já não valia.
    if (!visitante || situacaoDoVisitante(visitante, new Date()) !== "ativa") return { tipo: "nada" };

    const alvo = await identidadeDestino(transacao, usuarioContaId);
    if (alvo) {
      await unirConversas(transacao, visitante.identidadeId, alvo);
      await transferirDecisoesSobreOVisitante(transacao, visitante.identidadeId, alvo);
      await transferirAuditoria(transacao, usuarioVisitanteId, usuarioContaId);
      await transacao.delete(identidades).where(eq(identidades.id, visitante.identidadeId));
      const sessoesEncerradas = await apagarContaTemporaria(transacao, usuarioVisitanteId);
      return { tipo: "unida", identidadeId: alvo, sessoesEncerradas };
    }

    await transacao.update(identidades).set({ usuarioId: usuarioContaId }).where(eq(identidades.id, visitante.identidadeId));
    await transacao.update(identidadesVisitantes).set({ convertidaEm: sql`now()` }).where(eq(identidadesVisitantes.identidadeId, visitante.identidadeId));
    await transferirAuditoria(transacao, usuarioVisitanteId, usuarioContaId);
    const sessoesEncerradas = await apagarContaTemporaria(transacao, usuarioVisitanteId);
    return { tipo: "convertida", identidadeId: visitante.identidadeId, sessoesEncerradas };
  });
}

/*
 * Para onde vão as conversas: a identidade pessoal da conta — ou, se a conta ainda está escolhendo o
 * @usuario de uma conversão anterior, essa identidade convertida (nunca uma segunda pessoal).
 */
async function identidadeDestino(transacao: Transacao, usuarioId: string): Promise<string | null> {
  const [linha] = await transacao
    .select({ id: identidades.id })
    .from(identidades)
    .where(and(eq(identidades.usuarioId, usuarioId), eq(identidades.tipo, "pessoal")))
    .limit(1);
  return linha?.id ?? null;
}

async function unirConversas(transacao: Transacao, visitanteId: string, alvoId: string) {
  const participacoes = await transacao
    .select()
    .from(participantesConversa)
    .where(eq(participantesConversa.identidadeId, visitanteId));

  for (const participacao of participacoes) {
    const conversaId = participacao.conversaId;
    const [outro] = await transacao
      .select({ identidadeId: participantesConversa.identidadeId })
      .from(participantesConversa)
      .where(and(eq(participantesConversa.conversaId, conversaId), ne(participantesConversa.identidadeId, visitanteId)))
      .limit(1);

    // Abriu o próprio link sem estar logado: os dois lados são a mesma pessoa. Nada a preservar.
    if (!outro || outro.identidadeId === alvoId) {
      await apagarConversa(transacao, conversaId);
      continue;
    }

    // 1. A pessoal entra no lugar do visitante NESTA conversa (participante novo antes de mover as
    //    referências, para as FKs compostas valerem a cada passo; o antigo sai por último).
    const { conversaId: _c, identidadeId: _i, criadoEm: _d, ...estado } = participacao;
    await transacao.insert(participantesConversa).values({ ...estado, conversaId, identidadeId: alvoId });
    await transacao.update(mensagens).set({ remetenteIdentidadeId: alvoId }).where(and(eq(mensagens.conversaId, conversaId), eq(mensagens.remetenteIdentidadeId, visitanteId)));
    await transacao
      .update(recebimentosMensagem)
      .set({ destinatarioIdentidadeId: alvoId })
      .where(and(eq(recebimentosMensagem.conversaId, conversaId), eq(recebimentosMensagem.destinatarioIdentidadeId, visitanteId)));
    await transacao
      .update(mensagensExcluidasParaIdentidade)
      .set({ identidadeId: alvoId })
      .where(and(eq(mensagensExcluidasParaIdentidade.conversaId, conversaId), eq(mensagensExcluidasParaIdentidade.identidadeId, visitanteId)));
    await transacao.delete(participantesConversa).where(and(eq(participantesConversa.conversaId, conversaId), eq(participantesConversa.identidadeId, visitanteId)));

    // 2. Par canônico: se a conta já conversava com essa pessoa, as mensagens vão para AQUELA conversa.
    const chave = chaveConversaDireta(alvoId, outro.identidadeId);
    const [existente] = await transacao.select({ id: conversas.id }).from(conversas).where(eq(conversas.chaveDireta, chave)).limit(1);
    if (!existente) {
      await transacao.update(conversas).set({ chaveDireta: chave }).where(eq(conversas.id, conversaId));
      continue;
    }
    await moverMensagens(transacao, conversaId, existente.id);
    await transacao.delete(participantesConversa).where(eq(participantesConversa.conversaId, conversaId));
    await transacao.delete(conversas).where(eq(conversas.id, conversaId));
  }
}

/*
 * Move as mensagens de uma conversa para outra com os MESMOS participantes, preservando ids (UUIDv7 =
 * ordem), conteúdo, respostas, anexos, confirmações e exclusões "para mim". As tabelas dependentes
 * apontam para (conversa, mensagem) sem cascata de atualização: saem, a mensagem muda de conversa, e
 * voltam iguais. A coerência imagem/áudio ↔ anexo é conferida no COMMIT (gatilhos diferidos).
 */
async function moverMensagens(transacao: Transacao, origemId: string, destinoId: string) {
  const anexos = await transacao.select().from(anexosMensagem).where(eq(anexosMensagem.conversaId, origemId));
  const recebimentos = await transacao.select().from(recebimentosMensagem).where(eq(recebimentosMensagem.conversaId, origemId));
  const excluidas = await transacao.select().from(mensagensExcluidasParaIdentidade).where(eq(mensagensExcluidasParaIdentidade.conversaId, origemId));

  await transacao.delete(anexosMensagem).where(eq(anexosMensagem.conversaId, origemId));
  await transacao.delete(recebimentosMensagem).where(eq(recebimentosMensagem.conversaId, origemId));
  await transacao.delete(mensagensExcluidasParaIdentidade).where(eq(mensagensExcluidasParaIdentidade.conversaId, origemId));

  // Uma instrução só: respostas entre mensagens movidas continuam válidas (FK conferida no fim dela).
  await transacao.update(mensagens).set({ conversaId: destinoId }).where(eq(mensagens.conversaId, origemId));

  if (anexos.length > 0) await transacao.insert(anexosMensagem).values(anexos.map((linha) => ({ ...linha, conversaId: destinoId })));
  if (recebimentos.length > 0) await transacao.insert(recebimentosMensagem).values(recebimentos.map((linha) => ({ ...linha, conversaId: destinoId })));
  if (excluidas.length > 0) await transacao.insert(mensagensExcluidasParaIdentidade).values(excluidas.map((linha) => ({ ...linha, conversaId: destinoId })));
}

// Conversa sem ninguém a preservar (só a própria pessoa dos dois lados). Arquivos de anexo viram órfãos
// no armazenamento, como em qualquer exclusão — a varredura de órfãos é a pendência já registrada.
export async function apagarConversa(transacao: Transacao, conversaId: string) {
  await transacao.delete(anexosMensagem).where(eq(anexosMensagem.conversaId, conversaId));
  await transacao.delete(mensagens).where(eq(mensagens.conversaId, conversaId));
  await transacao.delete(participantesConversa).where(eq(participantesConversa.conversaId, conversaId));
  await transacao.delete(conversas).where(eq(conversas.id, conversaId));
}

/*
 * O que OUTROS decidiram sobre o visitante continua valendo para a conta dele: quem bloqueou o
 * visitante continua bloqueando a pessoa; quem o salvou na agenda ou fez exceção de privacidade para
 * ele mantém isso. E os bloqueios que o próprio visitante fez são decisões da mesma pessoa.
 */
async function transferirDecisoesSobreOVisitante(transacao: Transacao, visitanteId: string, alvoId: string) {
  await transacao.execute(sql`
    insert into ${bloqueiosIdentidade} (bloqueador_identidade_id, bloqueado_identidade_id, criado_em)
    select case when bloqueador_identidade_id = ${visitanteId} then ${alvoId}::uuid else bloqueador_identidade_id end,
           case when bloqueado_identidade_id = ${visitanteId} then ${alvoId}::uuid else bloqueado_identidade_id end,
           criado_em
      from ${bloqueiosIdentidade}
     where (bloqueador_identidade_id = ${visitanteId} and bloqueado_identidade_id <> ${alvoId})
        or (bloqueado_identidade_id = ${visitanteId} and bloqueador_identidade_id <> ${alvoId})
    on conflict do nothing`);
  await transacao.execute(sql`
    insert into ${contatos} (identidade_id, contato_identidade_id, apelido, favorito, criado_em)
    select identidade_id, ${alvoId}::uuid, apelido, favorito, criado_em
      from ${contatos}
     where contato_identidade_id = ${visitanteId} and identidade_id <> ${alvoId}
    on conflict do nothing`);
  await transacao.execute(sql`
    insert into ${excecoesPrivacidade} (identidade_id, alvo_identidade_id, decisao, criado_em)
    select identidade_id, ${alvoId}::uuid, decisao, criado_em
      from ${excecoesPrivacidade}
     where alvo_identidade_id = ${visitanteId} and identidade_id <> ${alvoId}
    on conflict do nothing`);
}

// Auditoria interna das mensagens (nunca serializada): a conta que executou passa a ser a definitiva.
async function transferirAuditoria(transacao: Transacao, deUsuarioId: string, paraUsuarioId: string) {
  await transacao.update(mensagens).set({ operadorUsuarioId: paraUsuarioId }).where(eq(mensagens.operadorUsuarioId, deUsuarioId));
  await transacao.update(mensagens).set({ editadaPorUsuarioId: paraUsuarioId }).where(eq(mensagens.editadaPorUsuarioId, deUsuarioId));
  await transacao.update(mensagens).set({ excluidaPorUsuarioId: paraUsuarioId }).where(eq(mensagens.excluidaPorUsuarioId, deUsuarioId));
}

/** Apaga a conta temporária (sessões e credenciais em cascata). Devolve as sessões encerradas. */
export async function apagarContaTemporaria(transacao: Transacao, usuarioId: string): Promise<string[]> {
  const encerradas = await transacao.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, usuarioId));
  // Só conta ANÔNIMA: nunca uma conta de verdade, venha o id de onde vier.
  await transacao.delete(users).where(and(eq(users.id, usuarioId), eq(users.isAnonymous, true)));
  return encerradas.map((sessao) => sessao.id);
}
