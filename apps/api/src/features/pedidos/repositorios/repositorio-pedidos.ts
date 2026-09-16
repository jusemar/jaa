import type { Banco } from "@jaa/banco";
import { historicoStatusPedido, identidades, itensPedido, mensagens, pedidos } from "@jaa/banco/schema";
import type { EventoStatusPedido, FormaPagamentoEntrega, ItemPedido, StatusPedido } from "@jaa/contratos";
import { and, asc, count, desc, eq, inArray, lt, sql } from "drizzle-orm";

export type PedidoRegistro = typeof pedidos.$inferSelect;

export type ClientePublico = { identidadeId: string; tipo: "pessoal" | "empresarial"; nomeExibicao: string; nomeUsuario: string };

export interface PedidoComItensRegistro {
  pedido: PedidoRegistro;
  itens: ItemPedido[];
  cliente: ClientePublico;
  // Append-only, em ordem cronológica (o primeiro evento é sempre "recebido").
  historico: EventoStatusPedido[];
}

export interface ItemParaGravar {
  produtoId: string;
  nomeProduto: string;
  precoUnitarioCentavos: number;
  quantidade: number;
  subtotalCentavos: number;
}

export class ErroPedidoDuplicado extends Error {
  constructor() {
    super("Já existe pedido para esta tentativa (idCliente).");
  }
}

function ehViolacaoIdempotencia(erro: unknown): boolean {
  for (const candidato of [erro, erro instanceof Error ? erro.cause : undefined]) {
    if (
      typeof candidato === "object" &&
      candidato !== null &&
      "code" in candidato &&
      candidato.code === "23505" &&
      "constraint" in candidato &&
      candidato.constraint === "pedidos_id_cliente_por_identidade_unico"
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Criação ATÔMICA: pedido + itens (com snapshot) + mensagem de card na conversa, tudo numa transação.
 * Falhou qualquer parte, nada existe. Preços, subtotais e total vêm de quem chama, já recalculados a
 * partir do banco; o próprio PostgreSQL ainda confere subtotal, troco por forma de pagamento e empresa
 * do item. `idCliente` é único por identidade cliente: confirmar duas vezes não cria dois pedidos.
 */
export async function inserirPedidoComItens(
  banco: Banco,
  dados: {
    empresaId: string;
    clienteIdentidadeId: string;
    conversaId: string;
    formaPagamentoNaEntrega: FormaPagamentoEntrega;
    trocoParaCentavos: number | null;
    totalCentavos: number;
    idCliente: string;
    itens: ItemParaGravar[];
    operadorUsuarioId: string;
  },
): Promise<{ pedidoId: string; mensagemId: string }> {
  try {
    return await banco.transaction(async (transacao) => {
      const [pedido] = await transacao
        .insert(pedidos)
        .values({
          empresaId: dados.empresaId,
          clienteIdentidadeId: dados.clienteIdentidadeId,
          origem: "conversa",
          conversaId: dados.conversaId,
          formaPagamentoNaEntrega: dados.formaPagamentoNaEntrega,
          trocoParaCentavos: dados.trocoParaCentavos,
          totalCentavos: dados.totalCentavos,
          idCliente: dados.idCliente,
        })
        .returning({ id: pedidos.id });
      if (!pedido) throw new Error("Inserção de pedido não retornou registro.");

      await transacao.insert(itensPedido).values(dados.itens.map((item) => ({ ...item, pedidoId: pedido.id, empresaId: dados.empresaId })));

      // Primeiro evento do histórico: o pedido nasce "recebido". Sem operador — quem criou foi o cliente.
      await transacao.insert(historicoStatusPedido).values({ pedidoId: pedido.id, status: "recebido" });

      // Card do pedido na conversa: mensagem normal (tipo "pedido") que REFERENCIA o pedido.
      const [mensagem] = await transacao
        .insert(mensagens)
        .values({
          conversaId: dados.conversaId,
          remetenteIdentidadeId: dados.clienteIdentidadeId,
          idCliente: dados.idCliente,
          tipo: "pedido",
          conteudo: "",
          pedidoId: pedido.id,
          operadorUsuarioId: dados.operadorUsuarioId,
        })
        .returning({ id: mensagens.id });
      if (!mensagem) throw new Error("Inserção do card do pedido não retornou registro.");

      return { pedidoId: pedido.id, mensagemId: mensagem.id };
    });
  } catch (erro) {
    if (ehViolacaoIdempotencia(erro)) throw new ErroPedidoDuplicado();
    throw erro;
  }
}

const colunasItem = {
  id: itensPedido.id,
  produtoId: itensPedido.produtoId,
  nomeProduto: itensPedido.nomeProduto,
  precoUnitarioCentavos: itensPedido.precoUnitarioCentavos,
  quantidade: itensPedido.quantidade,
  subtotalCentavos: itensPedido.subtotalCentavos,
};

const colunasEvento = {
  id: historicoStatusPedido.id,
  status: historicoStatusPedido.status,
  ocorridoEm: historicoStatusPedido.ocorridoEm,
  motivo: historicoStatusPedido.motivo,
};

// Auditoria (operador_usuario_id) fica fora de propósito: para o cliente quem opera é a EMPRESA.
export async function listarHistoricoPedido(banco: Banco, pedidoId: string): Promise<EventoStatusPedido[]> {
  const eventos = await banco.select(colunasEvento).from(historicoStatusPedido).where(eq(historicoStatusPedido.pedidoId, pedidoId)).orderBy(asc(historicoStatusPedido.id));
  return eventos.map((evento) => ({ ...evento, ocorridoEm: evento.ocorridoEm.toISOString() }));
}

async function montarPedido(banco: Banco, pedido: PedidoRegistro | undefined): Promise<PedidoComItensRegistro | null> {
  if (!pedido) return null;
  const itens = await banco.select(colunasItem).from(itensPedido).where(eq(itensPedido.pedidoId, pedido.id)).orderBy(asc(itensPedido.nomeProduto), asc(itensPedido.id));
  const [cliente] = await banco
    .select({ identidadeId: identidades.id, tipo: identidades.tipo, nomeExibicao: identidades.nomeExibicao, nomeUsuario: identidades.nomeUsuario })
    .from(identidades)
    .where(eq(identidades.id, pedido.clienteIdentidadeId))
    .limit(1);
  if (!cliente) throw new Error("Pedido sem identidade de cliente.");
  return { pedido, itens, cliente, historico: await listarHistoricoPedido(banco, pedido.id) };
}

export async function buscarPedido(banco: Banco, pedidoId: string): Promise<PedidoComItensRegistro | null> {
  const [pedido] = await banco.select().from(pedidos).where(eq(pedidos.id, pedidoId)).limit(1);
  return montarPedido(banco, pedido);
}

// Tentativa já gravada (retry do mesmo idCliente pela mesma identidade cliente).
export async function buscarPedidoPorTentativa(banco: Banco, clienteIdentidadeId: string, idCliente: string): Promise<PedidoComItensRegistro | null> {
  const [pedido] = await banco
    .select()
    .from(pedidos)
    .where(and(eq(pedidos.clienteIdentidadeId, clienteIdentidadeId), eq(pedidos.idCliente, idCliente)))
    .limit(1);
  return montarPedido(banco, pedido);
}

// Pedido de UMA empresa: o escopo faz parte da consulta (nunca só do id enviado pelo cliente).
export async function buscarPedidoDaEmpresa(banco: Banco, empresaId: string, pedidoId: string): Promise<PedidoComItensRegistro | null> {
  const [pedido] = await banco
    .select()
    .from(pedidos)
    .where(and(eq(pedidos.id, pedidoId), eq(pedidos.empresaId, empresaId)))
    .limit(1);
  return montarPedido(banco, pedido);
}

export interface PedidoDaEmpresaRegistro {
  id: string;
  status: StatusPedido;
  cliente: ClientePublico;
  conversaId: string | null;
  quantidadeItens: number;
  totalCentavos: number;
  formaPagamentoNaEntrega: FormaPagamentoEntrega;
  trocoParaCentavos: number | null;
  criadoEm: Date;
}

/**
 * Lista operacional da empresa: mais recentes primeiro, ordem determinística pelo id (UUIDv7) e
 * paginação por cursor — nunca "todos os pedidos". A quantidade de itens vem agregada (sem N+1).
 */
export async function listarPedidosDaEmpresa(
  banco: Banco,
  empresaId: string,
  opcoes: { status: readonly StatusPedido[]; limite: number; antesDe?: string | undefined },
): Promise<PedidoDaEmpresaRegistro[]> {
  const filtros = [eq(pedidos.empresaId, empresaId)];
  if (opcoes.status.length > 0) filtros.push(inArray(pedidos.status, [...opcoes.status]));
  if (opcoes.antesDe) filtros.push(lt(pedidos.id, opcoes.antesDe));

  return banco
    .select({
      id: pedidos.id,
      status: pedidos.status,
      conversaId: pedidos.conversaId,
      totalCentavos: pedidos.totalCentavos,
      formaPagamentoNaEntrega: pedidos.formaPagamentoNaEntrega,
      trocoParaCentavos: pedidos.trocoParaCentavos,
      criadoEm: pedidos.criadoEm,
      quantidadeItens: sql<number>`(select count(*)::int from ${itensPedido} where ${itensPedido.pedidoId} = ${pedidos.id})`,
      cliente: {
        identidadeId: identidades.id,
        tipo: identidades.tipo,
        nomeExibicao: identidades.nomeExibicao,
        nomeUsuario: identidades.nomeUsuario,
      },
    })
    .from(pedidos)
    .innerJoin(identidades, eq(identidades.id, pedidos.clienteIdentidadeId))
    .where(and(...filtros))
    .orderBy(desc(pedidos.id))
    .limit(opcoes.limite);
}

export type ResultadoAlteracaoStatus = { tipo: "alterado"; pedido: PedidoRegistro } | { tipo: "status-mudou"; statusAtual: StatusPedido | null };

/**
 * Mudança de status ATÔMICA e protegida contra concorrência: o UPDATE só acontece se o status no
 * banco ainda for `statusEsperado` (dois operadores simultâneos → um vence, o outro é recusado).
 * Status atual e histórico mudam na mesma transação: nunca divergem.
 */
export async function alterarStatusPedido(
  banco: Banco,
  dados: { pedidoId: string; empresaId: string; statusEsperado: StatusPedido; novoStatus: StatusPedido; motivo: string | null; operadorUsuarioId: string },
): Promise<ResultadoAlteracaoStatus> {
  return banco.transaction(async (transacao) => {
    const [atualizado] = await transacao
      .update(pedidos)
      .set({ status: dados.novoStatus, motivoCancelamento: dados.motivo })
      .where(and(eq(pedidos.id, dados.pedidoId), eq(pedidos.empresaId, dados.empresaId), eq(pedidos.status, dados.statusEsperado)))
      .returning();

    if (!atualizado) {
      const [atual] = await transacao
        .select({ status: pedidos.status })
        .from(pedidos)
        .where(and(eq(pedidos.id, dados.pedidoId), eq(pedidos.empresaId, dados.empresaId)))
        .limit(1);
      return { tipo: "status-mudou", statusAtual: atual?.status ?? null };
    }

    await transacao.insert(historicoStatusPedido).values({
      pedidoId: dados.pedidoId,
      status: dados.novoStatus,
      motivo: dados.motivo,
      operadorUsuarioId: dados.operadorUsuarioId,
    });

    return { tipo: "alterado", pedido: atualizado };
  });
}

export async function contarPedidosDaEmpresa(banco: Banco, empresaId: string): Promise<number> {
  const [linha] = await banco.select({ total: count() }).from(pedidos).where(eq(pedidos.empresaId, empresaId));
  return linha?.total ?? 0;
}

export type { StatusPedido };
