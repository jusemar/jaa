import type { Banco } from "@jaa/banco";
import { atribuicoesEntrega, entregadoresEmpresa, identidades, pedidos } from "@jaa/banco/schema";
import { entregadorPodeReceberAtribuicao, type EventoAtribuicao, type StatusEntregador } from "@jaa/contratos";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";

export interface AtribuicaoAtualRegistro {
  atribuicaoId: string;
  pedidoId: string;
  entregadorId: string;
  empresaId: string;
  usuarioId: string;
  status: StatusEntregador;
  disponivel: boolean;
  atribuidoEm: Date;
  pessoa: { identidadeId: string; tipo: "pessoal" | "empresarial"; nomeExibicao: string; nomeUsuario: string };
}

const colunasAtribuicaoAtual = {
  atribuicaoId: atribuicoesEntrega.id,
  pedidoId: atribuicoesEntrega.pedidoId,
  entregadorId: atribuicoesEntrega.entregadorId,
  empresaId: atribuicoesEntrega.empresaId,
  usuarioId: entregadoresEmpresa.usuarioId,
  status: entregadoresEmpresa.status,
  disponivel: entregadoresEmpresa.disponivel,
  atribuidoEm: atribuicoesEntrega.atribuidoEm,
  pessoa: {
    identidadeId: identidades.id,
    tipo: identidades.tipo,
    nomeExibicao: identidades.nomeExibicao,
    nomeUsuario: identidades.nomeUsuario,
  },
};

const consultaAtribuicoesAtuais = (banco: Banco) =>
  banco
    .select(colunasAtribuicaoAtual)
    .from(atribuicoesEntrega)
    .innerJoin(entregadoresEmpresa, eq(entregadoresEmpresa.id, atribuicoesEntrega.entregadorId))
    .innerJoin(identidades, and(eq(identidades.usuarioId, entregadoresEmpresa.usuarioId), eq(identidades.tipo, "pessoal")));

// Atribuição ATUAL do pedido (linha sem encerramento). É ela que autoriza o acesso do entregador.
export async function buscarAtribuicaoAtual(banco: Banco, pedidoId: string): Promise<AtribuicaoAtualRegistro | null> {
  const [atual] = await consultaAtribuicoesAtuais(banco)
    .where(and(eq(atribuicoesEntrega.pedidoId, pedidoId), isNull(atribuicoesEntrega.encerradoEm)))
    .limit(1);
  return atual ?? null;
}

// Pedidos atualmente atribuídos a estes vínculos de entregador (a lista "Minhas entregas").
export function listarAtribuicoesAtuaisDosVinculos(banco: Banco, entregadorIds: string[]): Promise<AtribuicaoAtualRegistro[]> {
  if (entregadorIds.length === 0) return Promise.resolve([]);
  return consultaAtribuicoesAtuais(banco)
    .where(and(inArray(atribuicoesEntrega.entregadorId, entregadorIds), isNull(atribuicoesEntrega.encerradoEm)))
    .orderBy(desc(atribuicoesEntrega.pedidoId));
}

// Histórico completo do pedido (visão operacional da empresa): quem esteve atribuído e quando.
export async function listarHistoricoAtribuicoes(banco: Banco, pedidoId: string): Promise<EventoAtribuicao[]> {
  const eventos = await banco
    .select({
      id: atribuicoesEntrega.id,
      atribuidoEm: atribuicoesEntrega.atribuidoEm,
      encerradoEm: atribuicoesEntrega.encerradoEm,
      motivoEncerramento: atribuicoesEntrega.motivoEncerramento,
      entregador: {
        identidadeId: identidades.id,
        tipo: identidades.tipo,
        nomeExibicao: identidades.nomeExibicao,
        nomeUsuario: identidades.nomeUsuario,
      },
    })
    .from(atribuicoesEntrega)
    .innerJoin(entregadoresEmpresa, eq(entregadoresEmpresa.id, atribuicoesEntrega.entregadorId))
    .innerJoin(identidades, and(eq(identidades.usuarioId, entregadoresEmpresa.usuarioId), eq(identidades.tipo, "pessoal")))
    .where(eq(atribuicoesEntrega.pedidoId, pedidoId))
    .orderBy(asc(atribuicoesEntrega.id));

  return eventos.map((evento) => ({
    ...evento,
    atribuidoEm: evento.atribuidoEm.toISOString(),
    encerradoEm: evento.encerradoEm?.toISOString() ?? null,
  }));
}

export class ErroAtribuicaoConcorrente extends Error {
  constructor() {
    super("Outra atribuição para este pedido aconteceu ao mesmo tempo.");
  }
}

function ehViolacaoAtribuicaoAtual(erro: unknown): boolean {
  for (const candidato of [erro, erro instanceof Error ? erro.cause : undefined]) {
    if (
      typeof candidato === "object" &&
      candidato !== null &&
      "code" in candidato &&
      candidato.code === "23505" &&
      "constraint" in candidato &&
      candidato.constraint === "atribuicoes_entrega_atual_unica"
    ) {
      return true;
    }
  }
  return false;
}

/**
 * ATRIBUIR / REATRIBUIR numa transação: encerra a atribuição atual (se houver) e abre a nova.
 * `entregadorAtualEsperadoId` é o que a empresa via na tela: se já mudou, nada é gravado (409), em vez
 * de duas pessoas "atuais". O índice único parcial ainda barra corridas que passem por aqui juntas.
 * O histórico nunca é apagado: a linha encerrada continua registrando quem esteve atribuído.
 */
export async function atribuirEntrega(
  banco: Banco,
  dados: { pedidoId: string; empresaId: string; entregadorId: string; atribuidoPorUsuarioId: string; entregadorAtualEsperadoId?: string | null | undefined },
): Promise<{ tipo: "atribuido"; anteriorEntregadorId: string | null } | { tipo: "conflito" } | { tipo: "indisponivel" }> {
  try {
    return await banco.transaction(async (transacao) => {
      /*
       * Estado ATUAL do entregador no momento da operação, travado até o commit: a tela do gestor pode
       * estar velha (o entregador acabou de ficar indisponível) e nada disso pode virar atribuição.
       */
      const [entregador] = await transacao
        .select({ status: entregadoresEmpresa.status, disponivel: entregadoresEmpresa.disponivel })
        .from(entregadoresEmpresa)
        .where(and(eq(entregadoresEmpresa.id, dados.entregadorId), eq(entregadoresEmpresa.empresaId, dados.empresaId)))
        .for("update")
        .limit(1);
      if (!entregador || !entregadorPodeReceberAtribuicao(entregador)) return { tipo: "indisponivel" as const };

      const [atual] = await transacao
        .select({ id: atribuicoesEntrega.id, entregadorId: atribuicoesEntrega.entregadorId })
        .from(atribuicoesEntrega)
        .where(and(eq(atribuicoesEntrega.pedidoId, dados.pedidoId), isNull(atribuicoesEntrega.encerradoEm)))
        .for("update")
        .limit(1);

      const esperado = dados.entregadorAtualEsperadoId;
      if (esperado !== undefined && (atual?.entregadorId ?? null) !== (esperado ?? null)) return { tipo: "conflito" as const };
      // Reatribuir para a mesma pessoa não cria linha nova (nem "encerra" a atribuição vigente).
      if (atual?.entregadorId === dados.entregadorId) return { tipo: "atribuido" as const, anteriorEntregadorId: null };

      if (atual) {
        await transacao
          .update(atribuicoesEntrega)
          .set({ encerradoEm: new Date(), motivoEncerramento: "Reatribuído a outro entregador" })
          .where(eq(atribuicoesEntrega.id, atual.id));
      }

      await transacao.insert(atribuicoesEntrega).values({
        pedidoId: dados.pedidoId,
        entregadorId: dados.entregadorId,
        empresaId: dados.empresaId,
        atribuidoPorUsuarioId: dados.atribuidoPorUsuarioId,
      });

      return { tipo: "atribuido" as const, anteriorEntregadorId: atual?.entregadorId ?? null };
    });
  } catch (erro) {
    if (ehViolacaoAtribuicaoAtual(erro)) return { tipo: "conflito" };
    throw erro;
  }
}

/**
 * Encerra a atribuição atual de um pedido (cancelamento do pedido, entrega concluída ou revogação do
 * vínculo). O acesso operacional do entregador acaba aqui; o histórico permanece.
 */
export async function encerrarAtribuicaoAtual(banco: Banco, pedidoId: string, motivo: string): Promise<{ entregadorId: string } | null> {
  const [encerrada] = await banco
    .update(atribuicoesEntrega)
    .set({ encerradoEm: new Date(), motivoEncerramento: motivo })
    .where(and(eq(atribuicoesEntrega.pedidoId, pedidoId), isNull(atribuicoesEntrega.encerradoEm)))
    .returning({ entregadorId: atribuicoesEntrega.entregadorId });
  return encerrada ?? null;
}

// Empresa do pedido (para conferir escopo antes de qualquer operação de entrega).
export async function buscarEmpresaDoPedido(banco: Banco, pedidoId: string): Promise<string | null> {
  const [pedido] = await banco.select({ empresaId: pedidos.empresaId }).from(pedidos).where(eq(pedidos.id, pedidoId)).limit(1);
  return pedido?.empresaId ?? null;
}
