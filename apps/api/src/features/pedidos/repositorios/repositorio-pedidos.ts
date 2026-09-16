import type { Banco } from "@jaa/banco";
import { identidades, itensPedido, mensagens, pedidos } from "@jaa/banco/schema";
import type { FormaPagamentoEntrega, ItemPedido, StatusPedido } from "@jaa/contratos";
import { and, asc, eq } from "drizzle-orm";

export type PedidoRegistro = typeof pedidos.$inferSelect;

export interface PedidoComItensRegistro {
  pedido: PedidoRegistro;
  itens: ItemPedido[];
  cliente: { identidadeId: string; tipo: "pessoal" | "empresarial"; nomeExibicao: string; nomeUsuario: string };
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

async function montarPedido(banco: Banco, pedido: PedidoRegistro | undefined): Promise<PedidoComItensRegistro | null> {
  if (!pedido) return null;
  const itens = await banco.select(colunasItem).from(itensPedido).where(eq(itensPedido.pedidoId, pedido.id)).orderBy(asc(itensPedido.nomeProduto), asc(itensPedido.id));
  const [cliente] = await banco
    .select({ identidadeId: identidades.id, tipo: identidades.tipo, nomeExibicao: identidades.nomeExibicao, nomeUsuario: identidades.nomeUsuario })
    .from(identidades)
    .where(eq(identidades.id, pedido.clienteIdentidadeId))
    .limit(1);
  if (!cliente) throw new Error("Pedido sem identidade de cliente.");
  return { pedido, itens, cliente };
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

export type { StatusPedido };
