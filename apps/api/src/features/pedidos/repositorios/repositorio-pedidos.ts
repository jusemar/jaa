import { randomUUID } from "node:crypto";
import type { Banco } from "@jaa/banco";
import { destinosPedido, escolhasItemPedido, historicoStatusPedido, identidades, itensPedido, mensagens, pedidos } from "@jaa/banco/schema";
import type { DestinoPedido, EscolhaItemPedido, EventoStatusPedido, FormaPagamentoEntrega, ItemPedido, StatusPedido, Uf } from "@jaa/contratos";
import { and, asc, count, desc, eq, inArray, lt, sql } from "drizzle-orm";

export type PedidoRegistro = typeof pedidos.$inferSelect;

export type ClientePublico = { identidadeId: string; tipo: "pessoal" | "empresarial"; nomeExibicao: string; nomeUsuario: string };

export type DestinoRegistro = typeof destinosPedido.$inferSelect;

export interface PedidoComItensRegistro {
  pedido: PedidoRegistro;
  itens: ItemPedido[];
  cliente: ClientePublico;
  // null em pedidos legados (criados antes do ponto de entrega confirmado).
  destino: DestinoPedido | null;
  // Append-only, em ordem cronológica (o primeiro evento é sempre "recebido").
  historico: EventoStatusPedido[];
}

/** Escolha a gravar em SNAPSHOT (nome do grupo, nome da opção e acréscimo do momento da compra). */
export interface EscolhaParaGravar {
  // Referência auxiliar: se a opção for apagada depois, o snapshot continua legível.
  opcaoId: string;
  grupoNome: string;
  opcaoNome: string;
  precoAdicionalCentavos: number;
  posicao: number;
}

export interface ItemParaGravar {
  produtoId: string;
  nomeProduto: string;
  // Já inclui os acréscimos das opções escolhidas (calculado pelo servidor, nunca pelo cliente).
  precoUnitarioCentavos: number;
  quantidade: number;
  subtotalCentavos: number;
  // Vazio = produto comum, sem personalização.
  escolhas: EscolhaParaGravar[];
  // Instrução de preparo desta linha; null = sem observação.
  observacao: string | null;
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
    // Snapshot do endereço + ponto confirmado, já lido do banco por quem chama.
    destino: Omit<DestinoRegistro, "pedidoId">;
    operadorUsuarioId: string;
  },
): Promise<{ pedidoId: string; mensagemId: string }> {
  try {
    return await banco.transaction(async (transacao) => {
      /*
       * NÚMERO DO PEDIDO NA EMPRESA. A trava é por EMPRESA e dura só esta transação: dois pedidos
       * simultâneos da mesma empresa são serializados aqui (um espera o outro), enquanto empresas
       * diferentes seguem em paralelo. Sem ela, dois `max+1` concorrentes leriam o mesmo valor.
       * O índice único (empresa_id, numero) é a garantia final, caso alguém insira por fora daqui.
       */
      await transacao.execute(sql`select pg_advisory_xact_lock(hashtextextended(${dados.empresaId}, 0))`);
      const [ultimo] = await transacao
        .select({ numero: sql<number>`coalesce(max(${pedidos.numero}), 0)` })
        .from(pedidos)
        .where(eq(pedidos.empresaId, dados.empresaId));

      const [pedido] = await transacao
        .insert(pedidos)
        .values({
          numero: (ultimo?.numero ?? 0) + 1,
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

      /*
       * Itens + escolhas na MESMA transação do pedido: um item personalizado nunca existe sem a
       * montagem que o cliente escolheu. O id de cada item é gerado AQUI, para ligar item e escolhas
       * sem depender da ordem em que o INSERT devolve as linhas.
       */
      const itens = dados.itens.map(({ escolhas, ...item }) => ({
        linha: { ...item, id: randomUUID(), pedidoId: pedido.id, empresaId: dados.empresaId },
        escolhas,
      }));
      await transacao.insert(itensPedido).values(itens.map(({ linha }) => linha));

      const escolhas = itens.flatMap(({ linha, escolhas: doItem }) => doItem.map((escolha) => ({ ...escolha, itemPedidoId: linha.id })));
      if (escolhas.length > 0) await transacao.insert(escolhasItemPedido).values(escolhas);

      // Destino: snapshot do endereço e do ponto confirmado (não depende do endereço salvo depois).
      await transacao.insert(destinosPedido).values({ ...dados.destino, pedidoId: pedido.id });

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
  observacao: itensPedido.observacao,
};

/** Escolhas de TODOS os itens do pedido em uma consulta (sem N+1), na ordem em que foram montadas. */
async function escolhasPorItem(banco: Banco, itemIds: string[]): Promise<Map<string, EscolhaItemPedido[]>> {
  const porItem = new Map<string, EscolhaItemPedido[]>();
  if (itemIds.length === 0) return porItem;

  const linhas = await banco
    .select({
      itemPedidoId: escolhasItemPedido.itemPedidoId,
      grupoNome: escolhasItemPedido.grupoNome,
      opcaoNome: escolhasItemPedido.opcaoNome,
      precoAdicionalCentavos: escolhasItemPedido.precoAdicionalCentavos,
    })
    .from(escolhasItemPedido)
    .where(inArray(escolhasItemPedido.itemPedidoId, itemIds))
    .orderBy(asc(escolhasItemPedido.itemPedidoId), asc(escolhasItemPedido.posicao), asc(escolhasItemPedido.id));

  for (const { itemPedidoId, ...escolha } of linhas) {
    porItem.set(itemPedidoId, [...(porItem.get(itemPedidoId) ?? []), escolha]);
  }
  return porItem;
}

function serializarDestino(destino: DestinoRegistro): DestinoPedido {
  return {
    enderecoId: destino.enderecoId,
    cep: destino.cep,
    logradouro: destino.logradouro,
    numero: destino.numero,
    complemento: destino.complemento,
    bairro: destino.bairro,
    cidade: destino.cidade,
    uf: destino.uf as Uf,
    pontoReferencia: destino.pontoReferencia,
    latitude: destino.latitude,
    longitude: destino.longitude,
    localizacaoConfirmadaEm: destino.localizacaoConfirmadaEm.toISOString(),
  };
}

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
  const linhasItens = await banco.select(colunasItem).from(itensPedido).where(eq(itensPedido.pedidoId, pedido.id)).orderBy(asc(itensPedido.nomeProduto), asc(itensPedido.id));
  const escolhas = await escolhasPorItem(
    banco,
    linhasItens.map((item) => item.id),
  );
  const itens: ItemPedido[] = linhasItens.map((item) => ({ ...item, escolhas: escolhas.get(item.id) ?? [] }));
  const [cliente] = await banco
    .select({ identidadeId: identidades.id, tipo: identidades.tipo, nomeExibicao: identidades.nomeExibicao, nomeUsuario: identidades.nomeUsuario })
    .from(identidades)
    .where(eq(identidades.id, pedido.clienteIdentidadeId))
    .limit(1);
  if (!cliente) throw new Error("Pedido sem identidade de cliente.");
  const [destino] = await banco.select().from(destinosPedido).where(eq(destinosPedido.pedidoId, pedido.id)).limit(1);
  return {
    pedido,
    itens,
    cliente,
    destino: destino ? serializarDestino(destino) : null,
    historico: await listarHistoricoPedido(banco, pedido.id),
  };
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
  numero: number;
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
      numero: pedidos.numero,
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
