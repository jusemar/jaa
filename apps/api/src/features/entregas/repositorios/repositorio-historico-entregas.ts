import type { Banco } from "@jaa/banco";
import { atribuicoesEntrega, entregadoresEmpresa, historicoStatusPedido, pedidos } from "@jaa/banco/schema";
import type { IntervaloDePedidos } from "@jaa/contratos";
import { and, count, desc, eq, gte, isNotNull, lt } from "drizzle-orm";
import { MOTIVO_ENCERRAMENTO_PEDIDO_ENTREGUE } from "../lib/motivos-encerramento.js";

/*
 * HISTÓRICO DE ENTREGAS: o que um vínculo de entregador efetivamente concluiu para a empresa dele.
 * Nenhuma tabela própria — é leitura do que a operação já grava:
 *
 * - QUEM recebe o crédito: a atribuição do pedido ENCERRADA com o motivo de entrega. Quem perdeu o
 *   pedido antes (reatribuição, recusa, desativação) tem outro motivo e fica de fora; atribuição ainda
 *   aberta também. Quem apertou "Entregue" (entregador ou empresa) não muda o crédito;
 * - QUE a entrega aconteceu: o pedido está `entregue` E existe a linha `entregue` no histórico de
 *   status. Faltando qualquer uma das evidências, nada é creditado;
 * - QUANDO: `ocorrido_em` dessa linha (relógio do banco, gravado junto com o status) — nunca a criação
 *   do pedido, a saída ou o encerramento da atribuição;
 * - ORDEM e cursor: o id (UUIDv7) da linha `entregue`, gerado no instante da conclusão.
 */

export interface VinculoDaPessoaRegistro {
  id: string;
  empresaId: string;
}

/**
 * O vínculo é DESTA conta? Em QUALQUER status: desativar o entregador não apaga o que ele entregou.
 * O `usuarioId` no filtro é a autorização — vínculo de outra pessoa é indistinguível de inexistente.
 */
export async function buscarVinculoDaPessoa(banco: Banco, entregadorId: string, usuarioId: string): Promise<VinculoDaPessoaRegistro | null> {
  const [vinculo] = await banco
    .select({ id: entregadoresEmpresa.id, empresaId: entregadoresEmpresa.empresaId })
    .from(entregadoresEmpresa)
    .where(and(eq(entregadoresEmpresa.id, entregadorId), eq(entregadoresEmpresa.usuarioId, usuarioId)))
    .limit(1);
  return vinculo ?? null;
}

export interface EntregaConcluidaRegistro {
  id: string;
  numeroPedido: number;
  concluidaEm: Date;
}

interface FiltroDoHistorico {
  entregadorId: string;
  empresaId: string;
  intervalo: IntervaloDePedidos;
}

// As duas evidências juntas (atribuição encerrada em entrega + pedido entregue), no escopo da empresa.
function condicoesDoHistorico({ entregadorId, empresaId, intervalo }: FiltroDoHistorico) {
  return [
    eq(atribuicoesEntrega.entregadorId, entregadorId),
    eq(atribuicoesEntrega.empresaId, empresaId),
    eq(atribuicoesEntrega.motivoEncerramento, MOTIVO_ENCERRAMENTO_PEDIDO_ENTREGUE),
    isNotNull(atribuicoesEntrega.encerradoEm),
    eq(pedidos.status, "entregue"),
    ...(intervalo.de ? [gte(historicoStatusPedido.ocorridoEm, intervalo.de)] : []),
    ...(intervalo.ate ? [lt(historicoStatusPedido.ocorridoEm, intervalo.ate)] : []),
  ];
}

// Pedido da MESMA empresa da atribuição.
const pedidoDaAtribuicao = and(eq(pedidos.id, atribuicoesEntrega.pedidoId), eq(pedidos.empresaId, atribuicoesEntrega.empresaId));
// No máximo uma linha `entregue` por pedido (índice único), então o join não multiplica entregas.
const conclusaoDoPedido = and(eq(historicoStatusPedido.pedidoId, pedidos.id), eq(historicoStatusPedido.status, "entregue"));

/** Uma página do histórico, da entrega mais recente para a mais antiga — nunca a lista inteira. */
export function listarEntregasConcluidas(banco: Banco, filtro: FiltroDoHistorico & { limite: number; antesDe?: string | undefined }): Promise<EntregaConcluidaRegistro[]> {
  return banco
    .select({ id: historicoStatusPedido.id, numeroPedido: pedidos.numero, concluidaEm: historicoStatusPedido.ocorridoEm })
    .from(atribuicoesEntrega)
    .innerJoin(pedidos, pedidoDaAtribuicao)
    .innerJoin(historicoStatusPedido, conclusaoDoPedido)
    .where(and(...condicoesDoHistorico(filtro), ...(filtro.antesDe ? [lt(historicoStatusPedido.id, filtro.antesDe)] : [])))
    .orderBy(desc(historicoStatusPedido.id))
    .limit(filtro.limite);
}

/** Quantas entregas o período tem ao todo, independentemente da página. */
export async function contarEntregasConcluidas(banco: Banco, filtro: FiltroDoHistorico): Promise<number> {
  const [linha] = await banco
    .select({ total: count() })
    .from(atribuicoesEntrega)
    .innerJoin(pedidos, pedidoDaAtribuicao)
    .innerJoin(historicoStatusPedido, conclusaoDoPedido)
    .where(and(...condicoesDoHistorico(filtro)));
  return linha?.total ?? 0;
}
