import type { Banco } from "@jaa/banco";
import { classificarPonto, type ConfiguracaoDespacho, type PainelDespacho } from "@jaa/contratos";
import { buscarEmpresaPublicaPorId } from "../../catalogo/repositorios/repositorio-empresas-publicas.js";
import { listarPedidosDaEmpresa } from "../../pedidos/repositorios/repositorio-pedidos.js";
import { serializarPedidoDaEmpresa } from "../../pedidos/lib/serializar-pedido.js";
import type { CanalEventosEntregas } from "../lib/eventos-entregas.js";
import type { MotorDeRotas } from "../lib/motor-rotas.js";
import { publicarSaidaPorId } from "../lib/publicar-saida.js";
import { publicarOperacao } from "../lib/publicar-operacao.js";
import {
  atribuirSaidaAoPrimeiroDaFila,
  encaixarPedidoEmFormacao,
  fecharFormacao,
  listarAguardandoEntregador,
  listarFormacoesDaEmpresa,
  listarFormacoesVencidas,
  listarParadasAtivas,
  listarPedidosProntosSemSaida,
  moverParadas,
  buscarPontoDoPedido,
} from "../repositorios/repositorio-despacho.js";
import { buscarSaida } from "../repositorios/repositorio-saidas.js";
import { planejarRotaDaSaida } from "./planejar-rota.js";
import { buscarConfiguracaoDespacho, listarCompativeisDaZona, listarZonasAtivas } from "../repositorios/repositorio-zonas.js";
import { listarZonasSerializadas } from "./gerir-zonas.js";
import { reavaliarFila } from "./presenca-e-fila.js";

/*
 * DESPACHO AUTOMÁTICO.
 *
 * Pedido PRONTO → zona (pelo ponto snapshot) → saída EM FORMAÇÃO daquela zona → fecha por QUANTIDADE
 * ou por TEMPO (o que vier primeiro) → combina zonas compatíveis quando o volume é baixo → reserva o
 * PRIMEIRO entregador apto da fila da base.
 *
 * A automação só age quando a empresa tem zona ativa: sem zonas, tudo continua manual como antes.
 * Pedido cujo ponto não cai em nenhuma zona NUNCA é encaixado à força — vira pendência do gestor.
 */

export interface DependenciasDespacho {
  banco: Banco;
  eventosEntregas: CanalEventosEntregas;
  // Motor de rotas do Jaa (provedor real quando configurado; aproximação local como fallback).
  motorRotas?: MotorDeRotas | undefined;
  // Relógio injetável: os testes controlam o vencimento sem esperar minutos reais.
  agora?: () => Date;
}

const relogio = (dependencias: DependenciasDespacho) => dependencias.agora?.() ?? new Date();

/**
 * Saída fechada: o MOTOR DE ROTAS sugere a sequência e calcula o percurso real (origem = base da
 * empresa). É o único momento do fluxo automático em que o provedor é chamado.
 */
async function aplicarSequenciaSugerida(dependencias: DependenciasDespacho, saidaId: string): Promise<void> {
  await planejarRotaDaSaida(dependencias, saidaId);
}

/**
 * COMBINAÇÃO CONTROLADA: a saída venceu com capacidade sobrando e a empresa autorizou combinar.
 * Só entram zonas que o gestor marcou como compatíveis — nada de "está no caminho" inventado.
 * Prioriza a saída candidata cujo pedido espera há mais tempo; o limite de capacidade continua valendo.
 */
async function combinarZonasCompativeis(dependencias: DependenciasDespacho, saidaId: string, empresaId: string, configuracao: ConfiguracaoDespacho): Promise<boolean> {
  const { banco } = dependencias;
  const saida = await buscarSaida(banco, saidaId);
  if (!saida?.saida.zonaPrincipalId) return false;

  const capacidade = configuracao.maxPedidosPorSaida - saida.paradas.filter((parada) => parada.encerradaEm === null).length;
  if (capacidade <= 0) return false;

  const compativeis = new Set(await listarCompativeisDaZona(banco, empresaId, saida.saida.zonaPrincipalId));
  if (compativeis.size === 0) return false;

  const candidatas = (await listarFormacoesDaEmpresa(banco, empresaId))
    .filter((formacao) => formacao.id !== saidaId && formacao.zonaPrincipalId !== null && compativeis.has(formacao.zonaPrincipalId))
    // Determinístico: quem espera há mais tempo entra primeiro; empate resolvido pelo id da saída.
    .sort((a, b) => a.esperaDesde.getTime() - b.esperaDesde.getTime() || a.id.localeCompare(b.id));

  let restante = capacidade;
  let combinou = false;
  for (const candidata of candidatas) {
    if (restante <= 0) break;
    const paradas = await listarParadasAtivas(banco, candidata.id);
    // Os excedentes ficam na saída de origem, que continua em formação com o próprio prazo.
    const levar = paradas.slice(0, restante).map((parada) => parada.pedidoId);
    if (levar.length === 0) continue;
    const movidos = await moverParadas(banco, { origemId: candidata.id, destinoId: saidaId, pedidoIds: levar, agora: relogio(dependencias) });
    restante -= movidos;
    combinou ||= movidos > 0;
  }
  return combinou;
}

/**
 * Tenta despachar as saídas fechadas da empresa, da que espera há mais tempo para a mais recente.
 * Sem ninguém elegível, a saída simplesmente continua "aguardando entregador" — nada é cancelado e
 * ninguém fora da base é escolhido.
 */
export async function despacharPendentes(dependencias: DependenciasDespacho, empresaId: string): Promise<string[]> {
  const { banco } = dependencias;
  const despachadas: string[] = [];

  for (const pendente of await listarAguardandoEntregador(banco, empresaId)) {
    const resultado = await atribuirSaidaAoPrimeiroDaFila(banco, { empresaId, saidaId: pendente.id, agora: relogio(dependencias) });
    if (resultado.tipo === "sem-entregador") break; // Sem fila, as seguintes também não têm ninguém.
    if (resultado.tipo !== "atribuida") continue;

    despachadas.push(pendente.id);
    // Recebeu saída: sai da fila da base (está indo para a rua) — mesma regra do fluxo manual.
    const apos = await reavaliarFila(banco, resultado.entregadorId, "Recebeu saída de entrega");
    if (apos) await publicarOperacao(dependencias, apos.registro);
    await publicarSaidaPorId(dependencias, pendente.id);
  }
  return despachadas;
}

async function fecharEDespachar(dependencias: DependenciasDespacho, saidaId: string, empresaId: string, configuracao: ConfiguracaoDespacho, jaFechada: boolean): Promise<void> {
  const { banco } = dependencias;
  if (!jaFechada) {
    if (configuracao.combinarZonas) await combinarZonasCompativeis(dependencias, saidaId, empresaId, configuracao);
    if (!(await fecharFormacao(banco, saidaId, relogio(dependencias)))) return;
  }
  await aplicarSequenciaSugerida(dependencias, saidaId);
  await publicarSaidaPorId(dependencias, saidaId);
  await despacharPendentes(dependencias, empresaId);
}

/**
 * Pedido ficou PRONTO: entra na formação da zona dele. Sem zona ativa na empresa, a automação nem
 * roda (o fluxo manual segue igual); ponto fora de todas as zonas vira pendência visível, nunca é
 * encaixado em silêncio.
 */
export async function encaixarPedidoPronto(
  dependencias: DependenciasDespacho,
  empresaId: string,
  pedido: { pedidoId: string; latitude: number; longitude: number },
): Promise<{ tipo: "encaixado"; saidaId: string } | { tipo: "fora-de-zona" } | { tipo: "sem-automacao" } | { tipo: "ja-em-saida" }> {
  const { banco } = dependencias;
  const zonas = await listarZonasAtivas(banco, empresaId);
  if (zonas.length === 0) return { tipo: "sem-automacao" };

  const zonaId = classificarPonto(zonas, { latitude: pedido.latitude, longitude: pedido.longitude });
  if (!zonaId) return { tipo: "fora-de-zona" };

  const configuracao = await buscarConfiguracaoDespacho(banco, empresaId);
  const resultado = await encaixarPedidoEmFormacao(banco, {
    empresaId,
    zonaId,
    pedidoId: pedido.pedidoId,
    maxPedidos: configuracao.maxPedidosPorSaida,
    tempoFormacaoMinutos: configuracao.tempoFormacaoMinutos,
    agora: relogio(dependencias),
  });
  if ("tipo" in resultado) return { tipo: "ja-em-saida" };

  if (resultado.fechouPorQuantidade) await fecharEDespachar(dependencias, resultado.saidaId, empresaId, configuracao, true);
  else await publicarSaidaPorId(dependencias, resultado.saidaId);

  return { tipo: "encaixado", saidaId: resultado.saidaId };
}

/**
 * GATILHO da automação: o pedido acabou de ficar PRONTO. Classifica pelo ponto snapshot e encaixa na
 * formação da zona; fora das zonas (ou sem automação), nada é forçado — o gestor vê a pendência.
 */
export async function aoPedidoFicarPronto(dependencias: DependenciasDespacho, empresaId: string, pedidoId: string): Promise<void> {
  const ponto = await buscarPontoDoPedido(dependencias.banco, pedidoId);
  if (!ponto) return;
  const resultado = await encaixarPedidoPronto(dependencias, empresaId, { pedidoId, ...ponto });
  // Pendência ("fora das zonas") é informação da empresa: atualiza o painel dela na hora.
  if (resultado.tipo === "fora-de-zona") await publicarDespacho(dependencias, empresaId);
}

/**
 * GATILHO da fila: alguém acabou de ficar elegível na base. Se havia saída esperando, ela é
 * despachada na hora — sem F5 e sem ação do gestor.
 */
export async function aoEntregadorEntrarNaFila(dependencias: DependenciasDespacho, registro: { empresaId: string; filaEntrouEm: Date | null }): Promise<void> {
  if (registro.filaEntrouEm === null) return;
  await processarFormacoesVencidas(dependencias, registro.empresaId);
  await despacharPendentes(dependencias, registro.empresaId);
}

/**
 * Fecha as saídas cujo PRAZO já venceu. O vencimento está no banco, então isto funciona depois de um
 * restart, é chamado por uma rotina do servidor e também em pontos naturais (o gestor abrindo o
 * painel, um entregador entrando na fila) — nunca depende de tela aberta ou de timer no navegador.
 */
export async function processarFormacoesVencidas(dependencias: DependenciasDespacho, empresaId?: string): Promise<string[]> {
  const { banco } = dependencias;
  const vencidas = await listarFormacoesVencidas(banco, relogio(dependencias), empresaId);
  const fechadas: string[] = [];
  for (const vencida of vencidas) {
    const configuracao = await buscarConfiguracaoDespacho(banco, vencida.empresaId);
    if (configuracao.combinarZonas) await combinarZonasCompativeis(dependencias, vencida.id, vencida.empresaId, configuracao);
    if (!(await fecharFormacao(banco, vencida.id, relogio(dependencias)))) continue;
    fechadas.push(vencida.id);
    await aplicarSequenciaSugerida(dependencias, vencida.id);
    await publicarSaidaPorId(dependencias, vencida.id);
    await despacharPendentes(dependencias, vencida.empresaId);
  }
  return fechadas;
}

// Fechamento antecipado pelo gestor: a saída para de receber pedidos e entra na fila de despacho.
export async function fecharFormacaoManualmente(dependencias: DependenciasDespacho, empresaId: string, saidaId: string): Promise<boolean> {
  const { banco } = dependencias;
  const saida = await buscarSaida(banco, saidaId);
  if (!saida || saida.saida.empresaId !== empresaId || saida.saida.status !== "em_formacao") return false;
  if (!(await fecharFormacao(banco, saidaId, relogio(dependencias)))) return false;
  await aplicarSequenciaSugerida(dependencias, saidaId);
  await publicarSaidaPorId(dependencias, saidaId);
  await despacharPendentes(dependencias, empresaId);
  return true;
}

/**
 * Reconciliação da empresa: processa vencidas, encaixa pedidos prontos que ficaram de fora (ex.: uma
 * zona criada depois) e tenta despachar o que está esperando. É o ponto de retomada depois de um
 * restart da API e o que roda quando alguém entra na fila da base.
 */
export async function reconciliarDespacho(dependencias: DependenciasDespacho, empresaId: string): Promise<void> {
  const { banco } = dependencias;
  const zonas = await listarZonasAtivas(banco, empresaId);
  if (zonas.length === 0) return;

  for (const pedido of await listarPedidosProntosSemSaida(banco, empresaId)) {
    await encaixarPedidoPronto(dependencias, empresaId, pedido);
  }
  await processarFormacoesVencidas(dependencias, empresaId);
  await despacharPendentes(dependencias, empresaId);
}

/**
 * Painel de logística: configuração, zonas e os pedidos que a automação não pode tratar. A empresa vê
 * a pendência de forma explícita — o Jaa não inventa zona para pedido nenhum.
 */
export async function montarPainelDespacho(banco: Banco, empresaId: string): Promise<PainelDespacho> {
  const [configuracao, zonas] = await Promise.all([buscarConfiguracaoDespacho(banco, empresaId), listarZonasSerializadas(banco, empresaId)]);
  const ativas = zonas.filter((zona) => zona.ativa);

  const prontos = await listarPedidosProntosSemSaida(banco, empresaId);
  const foraDeZona = ativas.length === 0 ? [] : prontos.filter((pedido) => classificarPonto(ativas, pedido) === null);

  const idsForaDeZona = new Set(foraDeZona.map((pedido) => pedido.pedidoId));
  const prontosDaLista = idsForaDeZona.size === 0 ? [] : await listarPedidosDaEmpresa(banco, empresaId, { status: ["pronto"], limite: 50 });
  const pedidosForaDeZona = prontosDaLista.filter((pedido) => idsForaDeZona.has(pedido.id)).map(serializarPedidoDaEmpresa);

  return { configuracao, zonas, pedidosForaDeZona, automacaoAtiva: ativas.length > 0 };
}

// O painel de logística é da EMPRESA: nem cliente nem entregador recebem zonas ou pendências.
export async function publicarDespacho(dependencias: DependenciasDespacho, empresaId: string): Promise<void> {
  const empresa = await buscarEmpresaPublicaPorId(dependencias.banco, empresaId);
  if (!empresa) return;
  dependencias.eventosEntregas.publicar({
    tipo: "despacho-atualizado",
    destinatariosIdentidadeIds: [empresa.identidadeId],
    painel: await montarPainelDespacho(dependencias.banco, empresaId),
  });
}
