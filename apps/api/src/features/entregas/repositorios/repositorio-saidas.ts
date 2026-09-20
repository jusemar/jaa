import type { Banco } from "@jaa/banco";
import { atribuicoesEntrega, destinosPedido, entregadoresEmpresa, identidades, paradasSaida, pedidos, posicoesSaida, saidasEntrega, zonasEntrega } from "@jaa/banco/schema";
import { classificarPonto, poligonoZonaSchema, type StatusSaida, type Uf } from "@jaa/contratos";
import { and, asc, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";

export type SaidaRegistro = typeof saidasEntrega.$inferSelect;

export interface ParadaRegistro {
  id: string;
  pedidoId: string;
  numeroPedido: number;
  posicao: number;
  statusPedido: (typeof pedidos.$inferSelect)["status"];
  totalCentavos: number;
  encerradaEm: Date | null;
  motivoEncerramento: string | null;
  cliente: { identidadeId: string; tipo: "pessoal" | "empresarial"; nomeExibicao: string; nomeUsuario: string };
  destino: {
    enderecoId: string | null;
    cep: string;
    logradouro: string;
    numero: string;
    complemento: string | null;
    bairro: string;
    cidade: string;
    uf: Uf;
    pontoReferencia: string | null;
    latitude: number;
    longitude: number;
    localizacaoConfirmadaEm: Date;
  };
}

export interface SaidaComParadasRegistro {
  saida: SaidaRegistro;
  // Nulo enquanto a saída está em formação ou aguardando alguém elegível na fila da base.
  entregador: { identidadeId: string; tipo: "pessoal" | "empresarial"; nomeExibicao: string; nomeUsuario: string } | null;
  paradas: ParadaRegistro[];
  // Zona que originou a saída e as que entraram por combinação autorizada (derivadas das paradas).
  zonaPrincipal: { id: string; nome: string } | null;
  zonasCombinadas: Array<{ id: string; nome: string }>;
}

/*
 * A saída guarda só o agrupamento e a ordem: o DESTINO de cada parada vem do snapshot do pedido
 * (`destinos_pedido`), que é a fonte de verdade daquela entrega.
 */
async function listarParadas(banco: Banco, saidaId: string): Promise<ParadaRegistro[]> {
  const linhas = await banco
    .select({
      id: paradasSaida.id,
      pedidoId: paradasSaida.pedidoId,
      numeroPedido: pedidos.numero,
      posicao: paradasSaida.posicao,
      encerradaEm: paradasSaida.encerradaEm,
      motivoEncerramento: paradasSaida.motivoEncerramento,
      statusPedido: pedidos.status,
      totalCentavos: pedidos.totalCentavos,
      cliente: { identidadeId: identidades.id, tipo: identidades.tipo, nomeExibicao: identidades.nomeExibicao, nomeUsuario: identidades.nomeUsuario },
      destino: {
        enderecoId: destinosPedido.enderecoId,
        cep: destinosPedido.cep,
        logradouro: destinosPedido.logradouro,
        numero: destinosPedido.numero,
        complemento: destinosPedido.complemento,
        bairro: destinosPedido.bairro,
        cidade: destinosPedido.cidade,
        uf: destinosPedido.uf,
        pontoReferencia: destinosPedido.pontoReferencia,
        latitude: destinosPedido.latitude,
        longitude: destinosPedido.longitude,
        localizacaoConfirmadaEm: destinosPedido.localizacaoConfirmadaEm,
      },
    })
    .from(paradasSaida)
    .innerJoin(pedidos, eq(pedidos.id, paradasSaida.pedidoId))
    .innerJoin(destinosPedido, eq(destinosPedido.pedidoId, paradasSaida.pedidoId))
    .innerJoin(identidades, eq(identidades.id, pedidos.clienteIdentidadeId))
    .where(eq(paradasSaida.saidaId, saidaId))
    .orderBy(asc(paradasSaida.posicao), asc(paradasSaida.id));

  return linhas.map((linha) => ({ ...linha, destino: { ...linha.destino, uf: linha.destino.uf as Uf } }));
}

/**
 * Zonas presentes na saída: a principal (que a originou) e as demais, deduzidas do PONTO SNAPSHOT de
 * cada parada. São derivadas — mudar o desenho da zona depois não reescreve saída nenhuma.
 */
async function zonasDaSaida(
  banco: Banco,
  saida: SaidaRegistro,
  paradas: ParadaRegistro[],
): Promise<{ zonaPrincipal: { id: string; nome: string } | null; zonasCombinadas: Array<{ id: string; nome: string }> }> {
  const linhas = await banco
    .select({ id: zonasEntrega.id, nome: zonasEntrega.nome, vertices: zonasEntrega.vertices, ativa: zonasEntrega.ativa })
    .from(zonasEntrega)
    .where(eq(zonasEntrega.empresaId, saida.empresaId));
  if (linhas.length === 0) return { zonaPrincipal: null, zonasCombinadas: [] };

  const zonas = linhas.map((linha) => ({ ...linha, vertices: poligonoZonaSchema.parse(linha.vertices) }));
  const principal = zonas.find((zona) => zona.id === saida.zonaPrincipalId) ?? null;

  const combinadas = new Map<string, { id: string; nome: string }>();
  for (const parada of paradas) {
    if (parada.encerradaEm !== null) continue;
    const zonaId = classificarPonto(zonas, { latitude: parada.destino.latitude, longitude: parada.destino.longitude });
    if (!zonaId || zonaId === saida.zonaPrincipalId) continue;
    const zona = zonas.find((item) => item.id === zonaId);
    if (zona) combinadas.set(zona.id, { id: zona.id, nome: zona.nome });
  }
  return {
    zonaPrincipal: principal ? { id: principal.id, nome: principal.nome } : null,
    zonasCombinadas: [...combinadas.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
  };
}

async function montarSaida(banco: Banco, saida: SaidaRegistro | undefined): Promise<SaidaComParadasRegistro | null> {
  if (!saida) return null;
  const paradas = await listarParadas(banco, saida.id);
  const zonas = await zonasDaSaida(banco, saida, paradas);
  if (!saida.entregadorId) return { saida, entregador: null, paradas, ...zonas };

  const [entregador] = await banco
    .select({ identidadeId: identidades.id, tipo: identidades.tipo, nomeExibicao: identidades.nomeExibicao, nomeUsuario: identidades.nomeUsuario })
    .from(entregadoresEmpresa)
    .innerJoin(identidades, and(eq(identidades.usuarioId, entregadoresEmpresa.usuarioId), eq(identidades.tipo, "pessoal")))
    .where(eq(entregadoresEmpresa.id, saida.entregadorId))
    .limit(1);
  if (!entregador) throw new Error("Saída sem identidade de entregador.");
  return { saida, entregador, paradas, ...zonas };
}

export async function buscarSaida(banco: Banco, saidaId: string): Promise<SaidaComParadasRegistro | null> {
  const [saida] = await banco.select().from(saidasEntrega).where(eq(saidasEntrega.id, saidaId)).limit(1);
  return montarSaida(banco, saida);
}

// Saída de UMA empresa: o escopo faz parte da consulta (id sozinho nunca dá acesso).
export async function buscarSaidaDaEmpresa(banco: Banco, empresaId: string, saidaId: string): Promise<SaidaComParadasRegistro | null> {
  const [saida] = await banco
    .select()
    .from(saidasEntrega)
    .where(and(eq(saidasEntrega.id, saidaId), eq(saidasEntrega.empresaId, empresaId)))
    .limit(1);
  return montarSaida(banco, saida);
}

export async function listarSaidasDaEmpresa(banco: Banco, empresaId: string, apenasAtivas: boolean): Promise<SaidaComParadasRegistro[]> {
  const filtros = [eq(saidasEntrega.empresaId, empresaId)];
  if (apenasAtivas) filtros.push(ne(saidasEntrega.status, "concluida"));
  const linhas = await banco.select().from(saidasEntrega).where(and(...filtros)).orderBy(desc(saidasEntrega.id)).limit(50);
  return (await Promise.all(linhas.map((saida) => montarSaida(banco, saida)))).filter((saida): saida is SaidaComParadasRegistro => saida !== null);
}

// Saídas dos vínculos da pessoa (a área do entregador). Vazio quando ela não tem vínculo ativo.
export async function listarSaidasDosVinculos(banco: Banco, entregadorIds: string[], apenasAtivas: boolean): Promise<SaidaComParadasRegistro[]> {
  if (entregadorIds.length === 0) return [];
  const filtros = [inArray(saidasEntrega.entregadorId, entregadorIds)];
  if (apenasAtivas) filtros.push(ne(saidasEntrega.status, "concluida"));
  const linhas = await banco.select().from(saidasEntrega).where(and(...filtros)).orderBy(desc(saidasEntrega.id)).limit(50);
  return (await Promise.all(linhas.map((saida) => montarSaida(banco, saida)))).filter((saida): saida is SaidaComParadasRegistro => saida !== null);
}

// Saída ATIVA que contém este pedido (a parada ainda conta na sequência).
export async function buscarSaidaAtivaDoPedido(banco: Banco, pedidoId: string): Promise<{ saidaId: string; posicao: number } | null> {
  const [parada] = await banco
    .select({ saidaId: paradasSaida.saidaId, posicao: paradasSaida.posicao })
    .from(paradasSaida)
    .where(and(eq(paradasSaida.pedidoId, pedidoId), isNull(paradasSaida.encerradaEm)))
    .limit(1);
  return parada ?? null;
}

export interface PedidoElegivelRegistro {
  pedidoId: string;
  latitude: number;
  longitude: number;
}

/**
 * Pedidos que podem entrar numa saída nova: desta empresa, PRONTOS, com destino confirmado e fora de
 * qualquer saída ativa. A checagem definitiva acontece de novo dentro da transação de criação.
 */
export function listarPedidosElegiveis(banco: Banco, empresaId: string, pedidoIds: string[]): Promise<PedidoElegivelRegistro[]> {
  if (pedidoIds.length === 0) return Promise.resolve([]);
  return banco
    .select({ pedidoId: pedidos.id, latitude: destinosPedido.latitude, longitude: destinosPedido.longitude })
    .from(pedidos)
    .innerJoin(destinosPedido, eq(destinosPedido.pedidoId, pedidos.id))
    .where(
      and(
        eq(pedidos.empresaId, empresaId),
        inArray(pedidos.id, pedidoIds),
        eq(pedidos.status, "pronto"),
        sql`not exists (select 1 from ${paradasSaida} where ${paradasSaida.pedidoId} = ${pedidos.id} and ${paradasSaida.encerradaEm} is null)`,
      ),
    )
    .orderBy(asc(pedidos.id));
}

export class ErroSaidaConcorrente extends Error {
  constructor() {
    super("Algum pedido entrou em outra saída ao mesmo tempo.");
  }
}

function ehViolacaoParadaAtiva(erro: unknown): boolean {
  for (const candidato of [erro, erro instanceof Error ? erro.cause : undefined]) {
    if (
      typeof candidato === "object" &&
      candidato !== null &&
      "code" in candidato &&
      candidato.code === "23505" &&
      "constraint" in candidato &&
      typeof candidato.constraint === "string" &&
      candidato.constraint.startsWith("paradas_saida_pedido")
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Cria a saída ATOMICAMENTE: saída + paradas na ordem sugerida + atribuição de cada pedido ao
 * entregador. A atribuição continua sendo a ÚNICA fonte de verdade de "quem é o entregador atual" —
 * a saída só agrupa e ordena. Dois gestores disputando o mesmo pedido: um vence (índice único).
 */
export async function inserirSaidaComParadas(
  banco: Banco,
  dados: { empresaId: string; entregadorId: string; criadaPorUsuarioId: string; ordem: string[] },
): Promise<{ saidaId: string } | { tipo: "conflito" }> {
  try {
    return await banco.transaction(async (transacao) => {
      // Saída manual nasce PREPARADA: já fechada (o gestor escolheu os pedidos) e já atribuída.
      const agora = new Date();
      const [saida] = await transacao
        .insert(saidasEntrega)
        .values({
          empresaId: dados.empresaId,
          entregadorId: dados.entregadorId,
          criadaPorUsuarioId: dados.criadaPorUsuarioId,
          fechadaEm: agora,
          atribuidaEm: agora,
        })
        .returning({ id: saidasEntrega.id });
      if (!saida) throw new Error("Inserção de saída não retornou registro.");

      await transacao.insert(paradasSaida).values(
        dados.ordem.map((pedidoId, indice) => ({ saidaId: saida.id, pedidoId, empresaId: dados.empresaId, posicao: indice + 1 })),
      );

      for (const pedidoId of dados.ordem) {
        // Encerra atribuição anterior (se houver) e abre a desta saída: um entregador atual por pedido.
        await transacao
          .update(atribuicoesEntrega)
          .set({ encerradoEm: new Date(), motivoEncerramento: "Reatribuído pela saída de entrega" })
          .where(and(eq(atribuicoesEntrega.pedidoId, pedidoId), isNull(atribuicoesEntrega.encerradoEm)));
        await transacao.insert(atribuicoesEntrega).values({
          pedidoId,
          entregadorId: dados.entregadorId,
          empresaId: dados.empresaId,
          atribuidoPorUsuarioId: dados.criadaPorUsuarioId,
        });
      }

      return { saidaId: saida.id };
    });
  } catch (erro) {
    if (ehViolacaoParadaAtiva(erro)) return { tipo: "conflito" };
    throw erro;
  }
}

/**
 * Reordena a sequência: só acontece se a `versaoEsperada` ainda for a do banco (tela velha não
 * sobrescreve alteração mais nova). As posições são reescritas na mesma transação e a versão avança.
 */
export async function reordenarParadas(
  banco: Banco,
  { saidaId, versaoEsperada, ordem }: { saidaId: string; versaoEsperada: number; ordem: string[] },
): Promise<"reordenada" | "versao-desatualizada"> {
  return banco.transaction(async (transacao) => {
    const [saida] = await transacao
      .select({ versaoSequencia: saidasEntrega.versaoSequencia })
      .from(saidasEntrega)
      .where(eq(saidasEntrega.id, saidaId))
      .for("update")
      .limit(1);
    if (!saida || saida.versaoSequencia !== versaoEsperada) return "versao-desatualizada";

    // Posições das encerradas ficam depois das ativas (o histórico não some, só sai da fila).
    for (const [indice, pedidoId] of ordem.entries()) {
      await transacao
        .update(paradasSaida)
        .set({ posicao: indice + 1 })
        .where(and(eq(paradasSaida.saidaId, saidaId), eq(paradasSaida.pedidoId, pedidoId)));
    }
    await transacao
      .update(saidasEntrega)
      .set({ versaoSequencia: versaoEsperada + 1 })
      .where(eq(saidasEntrega.id, saidaId));
    return "reordenada";
  });
}

export async function marcarSaidaIniciada(banco: Banco, saidaId: string): Promise<SaidaRegistro | null> {
  const [saida] = await banco
    .update(saidasEntrega)
    .set({ status: "em_andamento", iniciadaEm: new Date() })
    .where(and(eq(saidasEntrega.id, saidaId), eq(saidasEntrega.status, "preparada")))
    .returning();
  return saida ?? null;
}

// Parada sai da sequência ativa quando o pedido termina (entregue ou cancelado). Nada é apagado.
export async function encerrarParadaDoPedido(banco: Banco, pedidoId: string, motivo: string): Promise<{ saidaId: string } | null> {
  const [parada] = await banco
    .update(paradasSaida)
    .set({ encerradaEm: new Date(), motivoEncerramento: motivo })
    .where(and(eq(paradasSaida.pedidoId, pedidoId), isNull(paradasSaida.encerradaEm)))
    .returning({ saidaId: paradasSaida.saidaId });
  return parada ?? null;
}

/**
 * Saída sem parada ativa está terminada: fecha sozinha (com data), sem depender de alguém lembrar.
 * Saída "preparada" que perdeu todas as paradas também é encerrada — não há mais o que levar.
 */
export async function concluirSaidaSeTerminou(banco: Banco, saidaId: string): Promise<boolean> {
  const [restante] = await banco
    .select({ id: paradasSaida.id })
    .from(paradasSaida)
    .where(and(eq(paradasSaida.saidaId, saidaId), isNull(paradasSaida.encerradaEm)))
    .limit(1);
  if (restante) return false;

  // Saída em FORMAÇÃO que perdeu o último pedido também encerra — e encerrar é fechar para novos.
  const concluidas = await banco
    .update(saidasEntrega)
    .set({ status: "concluida", concluidaEm: new Date(), fechadaEm: sql`coalesce(${saidasEntrega.fechadaEm}, now())` })
    .where(and(eq(saidasEntrega.id, saidaId), ne(saidasEntrega.status, "concluida")))
    .returning({ id: saidasEntrega.id });
  /*
   * Terminou a operação, o rastreamento acaba: a última posição é apagada junto. O Jaa não guarda
   * onde a pessoa estava depois que a saída acabou.
   */
  if (concluidas.length > 0) await banco.delete(posicoesSaida).where(eq(posicoesSaida.saidaId, saidaId));
  return concluidas.length > 0;
}

export type { StatusSaida };
