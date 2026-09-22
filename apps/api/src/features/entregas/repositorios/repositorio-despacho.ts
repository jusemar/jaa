import type { Banco } from "@jaa/banco";
import { atribuicoesEntrega, entregadoresEmpresa, paradasSaida, pedidos, saidasEntrega } from "@jaa/banco/schema";
import { and, asc, eq, inArray, isNull, lte, ne, sql } from "drizzle-orm";

/*
 * FORMAÇÃO AUTOMÁTICA e DESPACHO. Tudo que decide capacidade, fechamento e escolha do entregador
 * acontece dentro de UMA transação com trava: duas saídas fechando ao mesmo tempo nunca ficam com o
 * mesmo entregador, e nenhum pedido entra numa saída além do máximo configurado.
 *
 * A trava é por EMPRESA (advisory lock da transação): serializa o despacho daquela operação sem
 * bloquear as outras empresas e sem exigir infraestrutura nova.
 */

const travarEmpresa = (transacao: { execute: (consulta: ReturnType<typeof sql>) => Promise<unknown> }, empresaId: string) =>
  transacao.execute(sql`select pg_advisory_xact_lock(hashtext(${empresaId}))`);

export interface ResultadoEncaixe {
  saidaId: string;
  quantidade: number;
  // A saída encheu: fechou na hora e a próxima da zona começa vazia.
  fechouPorQuantidade: boolean;
  criouSaida: boolean;
}

/**
 * Encaixa um pedido PRONTO na saída em formação da zona: usa a que já existe (se couber) ou cria uma.
 * O relógio da formação começa no PRIMEIRO pedido e o prazo é gravado no banco — reiniciar a API não
 * faz a saída perder o vencimento.
 */
export async function encaixarPedidoEmFormacao(
  banco: Banco,
  dados: { empresaId: string; zonaId: string; pedidoId: string; maxPedidos: number; tempoFormacaoMinutos: number; agora: Date },
): Promise<ResultadoEncaixe | { tipo: "pedido-ja-em-saida" }> {
  return banco.transaction(async (transacao) => {
    await travarEmpresa(transacao, dados.empresaId);

    const [jaEstá] = await transacao
      .select({ id: paradasSaida.id })
      .from(paradasSaida)
      .where(and(eq(paradasSaida.pedidoId, dados.pedidoId), isNull(paradasSaida.encerradaEm)))
      .limit(1);
    if (jaEstá) return { tipo: "pedido-ja-em-saida" as const };

    const [emFormacao] = await transacao
      .select({ id: saidasEntrega.id })
      .from(saidasEntrega)
      .where(and(eq(saidasEntrega.empresaId, dados.empresaId), eq(saidasEntrega.zonaPrincipalId, dados.zonaId), eq(saidasEntrega.status, "em_formacao")))
      .for("update")
      .limit(1);

    let saidaId = emFormacao?.id ?? null;
    let criouSaida = false;
    if (!saidaId) {
      const prazo = new Date(dados.agora.getTime() + dados.tempoFormacaoMinutos * 60_000);
      const [criada] = await transacao
        .insert(saidasEntrega)
        .values({
          empresaId: dados.empresaId,
          zonaPrincipalId: dados.zonaId,
          status: "em_formacao",
          automatica: true,
          formacaoIniciadaEm: dados.agora,
          prazoFormacaoEm: prazo,
        })
        .returning({ id: saidasEntrega.id });
      if (!criada) throw new Error("Criação da saída em formação não retornou registro.");
      saidaId = criada.id;
      criouSaida = true;
    }

    const ativas = await transacao
      .select({ id: paradasSaida.id })
      .from(paradasSaida)
      .where(and(eq(paradasSaida.saidaId, saidaId), isNull(paradasSaida.encerradaEm)));

    await transacao.insert(paradasSaida).values({ saidaId, pedidoId: dados.pedidoId, empresaId: dados.empresaId, posicao: ativas.length + 1 });
    const quantidade = ativas.length + 1;

    // Quantidade máxima atingida: fecha JÁ, para não passar do limite nem esperar o tempo à toa.
    const fechouPorQuantidade = quantidade >= dados.maxPedidos;
    if (fechouPorQuantidade) {
      await transacao
        .update(saidasEntrega)
        .set({ status: "aguardando_entregador", fechadaEm: dados.agora })
        .where(eq(saidasEntrega.id, saidaId));
    }

    return { saidaId, quantidade, fechouPorQuantidade, criouSaida };
  });
}

// Fecha por tempo ou por decisão do gestor: congela a saída para novos pedidos.
export async function fecharFormacao(banco: Banco, saidaId: string, agora: Date): Promise<boolean> {
  const fechadas = await banco
    .update(saidasEntrega)
    .set({ status: "aguardando_entregador", fechadaEm: agora })
    .where(and(eq(saidasEntrega.id, saidaId), eq(saidasEntrega.status, "em_formacao")))
    .returning({ id: saidasEntrega.id });
  return fechadas.length > 0;
}

// Saídas cujo prazo de formação já passou (o vencimento vive no BANCO, não num timer em memória).
export function listarFormacoesVencidas(banco: Banco, referencia: Date, empresaId?: string): Promise<Array<{ id: string; empresaId: string }>> {
  const filtros = [eq(saidasEntrega.status, "em_formacao"), lte(saidasEntrega.prazoFormacaoEm, referencia)];
  if (empresaId) filtros.push(eq(saidasEntrega.empresaId, empresaId));
  return banco
    .select({ id: saidasEntrega.id, empresaId: saidasEntrega.empresaId })
    .from(saidasEntrega)
    .where(and(...filtros))
    .orderBy(asc(saidasEntrega.prazoFormacaoEm), asc(saidasEntrega.id))
    .limit(100);
}

export interface FormacaoRegistro {
  id: string;
  empresaId: string;
  zonaPrincipalId: string | null;
  quantidade: number;
  // Momento do pedido mais antigo que está esperando nesta saída (critério de prioridade).
  esperaDesde: Date;
}

async function listarPorStatus(banco: Banco, empresaId: string, status: "em_formacao" | "aguardando_entregador"): Promise<FormacaoRegistro[]> {
  const linhas = await banco
    .select({
      id: saidasEntrega.id,
      empresaId: saidasEntrega.empresaId,
      zonaPrincipalId: saidasEntrega.zonaPrincipalId,
      criadoEm: saidasEntrega.criadoEm,
      formacaoIniciadaEm: saidasEntrega.formacaoIniciadaEm,
      quantidade: sql<number>`(select count(*)::int from ${paradasSaida} where ${paradasSaida.saidaId} = ${saidasEntrega.id} and ${paradasSaida.encerradaEm} is null)`,
      // Pedido mais antigo ainda ativo na saída: é ele que está esperando há mais tempo.
      esperaDesde: sql<Date>`coalesce((select min(${paradasSaida.criadoEm}) from ${paradasSaida} where ${paradasSaida.saidaId} = ${saidasEntrega.id} and ${paradasSaida.encerradaEm} is null), ${saidasEntrega.criadoEm})`,
    })
    .from(saidasEntrega)
    .where(and(eq(saidasEntrega.empresaId, empresaId), eq(saidasEntrega.status, status)))
    .orderBy(asc(saidasEntrega.criadoEm), asc(saidasEntrega.id));

  return linhas.map((linha) => ({
    id: linha.id,
    empresaId: linha.empresaId,
    zonaPrincipalId: linha.zonaPrincipalId,
    quantidade: linha.quantidade,
    esperaDesde: new Date(linha.esperaDesde),
  }));
}

export function listarFormacoesDaEmpresa(banco: Banco, empresaId: string): Promise<FormacaoRegistro[]> {
  return listarPorStatus(banco, empresaId, "em_formacao");
}

/**
 * Saídas fechadas esperando alguém elegível. Ordem = pedido mais antigo primeiro, para nenhuma zona
 * ficar eternamente atrás de outra (desempate estável pelo id da saída).
 */
export async function listarAguardandoEntregador(banco: Banco, empresaId: string): Promise<FormacaoRegistro[]> {
  const linhas = await listarPorStatus(banco, empresaId, "aguardando_entregador");
  return linhas.sort((a, b) => a.esperaDesde.getTime() - b.esperaDesde.getTime() || a.id.localeCompare(b.id));
}

// Empresas com alguma saída fechada esperando entregador (usado pela reconciliação periódica).
export async function listarEmpresasComSaidaPendente(banco: Banco): Promise<string[]> {
  const linhas = await banco
    .selectDistinct({ empresaId: saidasEntrega.empresaId })
    .from(saidasEntrega)
    .where(eq(saidasEntrega.status, "aguardando_entregador"))
    .limit(200);
  return linhas.map((linha) => linha.empresaId);
}

export interface ParadaMovivel {
  pedidoId: string;
  criadoEm: Date;
}

export async function listarParadasAtivas(banco: Banco, saidaId: string): Promise<ParadaMovivel[]> {
  return banco
    .select({ pedidoId: paradasSaida.pedidoId, criadoEm: paradasSaida.criadoEm })
    .from(paradasSaida)
    .where(and(eq(paradasSaida.saidaId, saidaId), isNull(paradasSaida.encerradaEm)))
    .orderBy(asc(paradasSaida.criadoEm), asc(paradasSaida.id));
}

/**
 * COMBINAÇÃO: move pedidos de uma saída em formação para a que está fechando, respeitando a
 * capacidade. Quem não couber permanece na saída de origem, que continua em formação com o próprio
 * prazo; se a origem ficar vazia, ela é encerrada (não há mais o que levar).
 */
export async function moverParadas(
  banco: Banco,
  dados: { origemId: string; destinoId: string; pedidoIds: string[]; agora: Date },
): Promise<number> {
  if (dados.pedidoIds.length === 0) return 0;
  return banco.transaction(async (transacao) => {
    const [destino] = await transacao
      .select({ id: saidasEntrega.id, empresaId: saidasEntrega.empresaId })
      .from(saidasEntrega)
      .where(eq(saidasEntrega.id, dados.destinoId))
      .for("update")
      .limit(1);
    const [origem] = await transacao
      .select({ id: saidasEntrega.id, status: saidasEntrega.status })
      .from(saidasEntrega)
      .where(eq(saidasEntrega.id, dados.origemId))
      .for("update")
      .limit(1);
    // Só saída EM FORMAÇÃO cede pedidos: nada é tirado de uma saída já atribuída ou iniciada.
    if (!destino || !origem || origem.status !== "em_formacao") return 0;

    const [{ maior = 0 } = { maior: 0 }] = await transacao
      .select({ maior: sql<number>`coalesce(max(${paradasSaida.posicao}), 0)::int` })
      .from(paradasSaida)
      .where(eq(paradasSaida.saidaId, dados.destinoId));

    let posicao = maior;
    for (const pedidoId of dados.pedidoIds) {
      posicao += 1;
      await transacao
        .update(paradasSaida)
        .set({ saidaId: dados.destinoId, posicao })
        .where(and(eq(paradasSaida.saidaId, dados.origemId), eq(paradasSaida.pedidoId, pedidoId), isNull(paradasSaida.encerradaEm)));
    }

    const restantes = await transacao
      .select({ id: paradasSaida.id })
      .from(paradasSaida)
      .where(and(eq(paradasSaida.saidaId, dados.origemId), isNull(paradasSaida.encerradaEm)));
    if (restantes.length === 0) {
      await transacao
        .update(saidasEntrega)
        .set({ status: "concluida", fechadaEm: dados.agora, concluidaEm: dados.agora })
        .where(eq(saidasEntrega.id, dados.origemId));
    }
    return dados.pedidoIds.length;
  });
}

export type ResultadoAtribuicaoAutomatica =
  | { tipo: "atribuida"; entregadorId: string }
  | { tipo: "sem-entregador" }
  // A saída mudou de estado antes da tentativa (outro despacho, cancelamento, intervenção manual).
  | { tipo: "nao-aplicavel" };

/**
 * DESPACHO: reserva a saída para o PRIMEIRO entregador apto da fila da base daquela empresa.
 *
 * A fila existente é a autoridade: só entra quem está ativo, aceitando, NA BASE e apto — quem está
 * fora da base nunca é escolhido. A trava por empresa garante que duas saídas fechando ao mesmo tempo
 * peguem pessoas diferentes; quem já tem saída em aberto não é considerado.
 */
export async function atribuirSaidaAoPrimeiroDaFila(
  banco: Banco,
  dados: { empresaId: string; saidaId: string; agora: Date },
): Promise<ResultadoAtribuicaoAutomatica> {
  return banco.transaction(async (transacao) => {
    await travarEmpresa(transacao, dados.empresaId);

    const [saida] = await transacao
      .select({ id: saidasEntrega.id, status: saidasEntrega.status, liberadaEm: saidasEntrega.liberadaEm })
      .from(saidasEntrega)
      .where(and(eq(saidasEntrega.id, dados.saidaId), eq(saidasEntrega.empresaId, dados.empresaId), eq(saidasEntrega.status, "aguardando_entregador")))
      .for("update")
      .limit(1);
    if (!saida) return { tipo: "nao-aplicavel" as const };

    const paradas = await transacao
      .select({ pedidoId: paradasSaida.pedidoId })
      .from(paradasSaida)
      .where(and(eq(paradasSaida.saidaId, dados.saidaId), isNull(paradasSaida.encerradaEm)));
    // Saída que ficou sem pedido (todos cancelados) não consome entregador: encerra e sai.
    if (paradas.length === 0) {
      await transacao.update(saidasEntrega).set({ status: "concluida", concluidaEm: dados.agora }).where(eq(saidasEntrega.id, dados.saidaId));
      return { tipo: "nao-aplicavel" as const };
    }

    const [entregador] = await transacao
      .select({ id: entregadoresEmpresa.id })
      .from(entregadoresEmpresa)
      .where(
        and(
          eq(entregadoresEmpresa.empresaId, dados.empresaId),
          eq(entregadoresEmpresa.status, "ativo"),
          eq(entregadoresEmpresa.disponivel, true),
          eq(entregadoresEmpresa.naBase, true),
          eq(entregadoresEmpresa.aptoParaSaida, true),
          sql`${entregadoresEmpresa.filaEntrouEm} is not null`,
          sql`not exists (select 1 from ${saidasEntrega} where ${saidasEntrega.entregadorId} = ${entregadoresEmpresa.id} and ${saidasEntrega.status} <> 'concluida')`,
        ),
      )
      .orderBy(asc(entregadoresEmpresa.filaEntrouEm), asc(entregadoresEmpresa.id))
      .for("update")
      .limit(1);
    if (!entregador) return { tipo: "sem-entregador" as const };

    await transacao
      .update(saidasEntrega)
      .set({
        entregadorId: entregador.id,
        // A decisão de liberar pode ter ocorrido antes de existir alguém na fila.
        status: saida.liberadaEm ? "liberada_retirada" : "preparada",
        atribuidaEm: dados.agora,
      })
      .where(eq(saidasEntrega.id, dados.saidaId));

    for (const parada of paradas) {
      // A atribuição continua sendo a fonte única de "quem está com este pedido".
      await transacao
        .update(atribuicoesEntrega)
        .set({ encerradoEm: dados.agora, motivoEncerramento: "Reatribuído pela saída de entrega" })
        .where(and(eq(atribuicoesEntrega.pedidoId, parada.pedidoId), isNull(atribuicoesEntrega.encerradoEm)));
      await transacao.insert(atribuicoesEntrega).values({ pedidoId: parada.pedidoId, entregadorId: entregador.id, empresaId: dados.empresaId });
    }

    return { tipo: "atribuida" as const, entregadorId: entregador.id };
  });
}

/**
 * Pedidos PRONTOS da empresa que ainda não estão em saída nenhuma — a base da automação e, para os
 * que ficam fora das zonas, a lista de pendências que o gestor resolve à mão.
 */
export function listarPedidosProntosSemSaida(banco: Banco, empresaId: string): Promise<Array<{ pedidoId: string; latitude: number; longitude: number }>> {
  return banco
    .select({
      pedidoId: pedidos.id,
      latitude: sql<number>`(select latitude from destinos_pedido where destinos_pedido.pedido_id = ${pedidos.id})`,
      longitude: sql<number>`(select longitude from destinos_pedido where destinos_pedido.pedido_id = ${pedidos.id})`,
    })
    .from(pedidos)
    .where(
      and(
        eq(pedidos.empresaId, empresaId),
        eq(pedidos.status, "pronto"),
        sql`exists (select 1 from destinos_pedido where destinos_pedido.pedido_id = ${pedidos.id})`,
        sql`not exists (select 1 from ${paradasSaida} where ${paradasSaida.pedidoId} = ${pedidos.id} and ${paradasSaida.encerradaEm} is null)`,
      ),
    )
    .orderBy(asc(pedidos.id));
}

// Ponto SNAPSHOT do pedido: é ele (e não o endereço atual do cliente) que classifica o pedido.
export async function buscarPontoDoPedido(banco: Banco, pedidoId: string): Promise<{ latitude: number; longitude: number } | null> {
  const [linha] = await banco
    .select({
      latitude: sql<number | null>`(select latitude from destinos_pedido where destinos_pedido.pedido_id = ${pedidos.id})`,
      longitude: sql<number | null>`(select longitude from destinos_pedido where destinos_pedido.pedido_id = ${pedidos.id})`,
    })
    .from(pedidos)
    .where(eq(pedidos.id, pedidoId))
    .limit(1);
  if (!linha || linha.latitude === null || linha.longitude === null) return null;
  return { latitude: Number(linha.latitude), longitude: Number(linha.longitude) };
}

// Zonas presentes nas paradas ativas de uma saída (a principal + as que entraram por combinação).
export async function listarZonasDosPedidos(banco: Banco, pedidoIds: string[]): Promise<Array<{ pedidoId: string; latitude: number; longitude: number }>> {
  if (pedidoIds.length === 0) return [];
  return banco
    .select({
      pedidoId: pedidos.id,
      latitude: sql<number>`(select latitude from destinos_pedido where destinos_pedido.pedido_id = ${pedidos.id})`,
      longitude: sql<number>`(select longitude from destinos_pedido where destinos_pedido.pedido_id = ${pedidos.id})`,
    })
    .from(pedidos)
    .where(and(inArray(pedidos.id, pedidoIds), sql`exists (select 1 from destinos_pedido where destinos_pedido.pedido_id = ${pedidos.id})`));
}

// Saída ativa (não concluída) de um entregador — usado para conferir elegibilidade fora da transação.
export async function entregadorTemSaidaAtiva(banco: Banco, entregadorId: string): Promise<boolean> {
  const [linha] = await banco
    .select({ id: saidasEntrega.id })
    .from(saidasEntrega)
    .where(and(eq(saidasEntrega.entregadorId, entregadorId), ne(saidasEntrega.status, "concluida")))
    .limit(1);
  return linha !== undefined;
}
