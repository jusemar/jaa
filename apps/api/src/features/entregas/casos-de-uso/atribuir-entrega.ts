import type { Banco } from "@jaa/banco";
import { entregaEstaAtiva, entregadorPodeOperar, entregadorPodeReceberAtribuicao, type EntregaAtribuida } from "@jaa/contratos";
import { buscarEmpresaPublicaPorId } from "../../catalogo/repositorios/repositorio-empresas-publicas.js";
import { autorizarEmpresa } from "../../empresas/lib/autorizacao-empresas.js";
import { buscarPedidoDaEmpresa } from "../../pedidos/repositorios/repositorio-pedidos.js";
import { serializarEmpresaPublica } from "../../catalogo/lib/serializar-catalogo.js";
import type { CanalEventosEntregas } from "../lib/eventos-entregas.js";
import {
  atribuirEntrega,
  buscarAtribuicaoAtual,
  encerrarAtribuicaoAtual,
  listarAtribuicoesAtuaisDosVinculos,
} from "../repositorios/repositorio-atribuicoes.js";
import { buscarEntregadorDaEmpresa, listarVinculosAtivosDaPessoa } from "../repositorios/repositorio-entregadores.js";

/*
 * ATRIBUIÇÃO da entrega. Quem atribui é a EMPRESA (permissão `gerenciar-entregadores`); quem executa
 * é o entregador com vínculo ATIVO. A autorização de acesso à entrega olha sempre a atribuição ATUAL:
 * perdeu o pedido numa reatribuição, perdeu o acesso — mesmo tendo estado atribuído antes.
 */

// Só faz sentido escolher entregador quando a saída está próxima ou já aconteceu.
const STATUS_ATRIBUIVEIS = new Set(["pronto", "saiu_para_entrega", "em_rota"]);

type ResultadoAtribuir =
  | { tipo: "atribuido" }
  | { tipo: "empresa-nao-encontrada" }
  | { tipo: "pedido-nao-encontrado" }
  | { tipo: "entregador-nao-encontrado" }
  | { tipo: "entregador-inativo" }
  // Vínculo ativo, mas a pessoa não está aceitando novas entregas desta empresa agora.
  | { tipo: "entregador-indisponivel" }
  | { tipo: "status-invalido" }
  | { tipo: "conflito" };

export async function atribuirEntregaAutorizada(
  { banco, eventosEntregas }: { banco: Banco; eventosEntregas: CanalEventosEntregas },
  usuarioId: string,
  empresaId: string,
  pedidoId: string,
  entrada: { entregadorId: string; entregadorAtualId?: string | null | undefined },
): Promise<ResultadoAtribuir> {
  const acesso = await autorizarEmpresa(banco, usuarioId, empresaId, "gerenciar-entregadores");
  if (!acesso) return { tipo: "empresa-nao-encontrada" };

  const pedido = await buscarPedidoDaEmpresa(banco, empresaId, pedidoId);
  if (!pedido) return { tipo: "pedido-nao-encontrado" };
  if (!STATUS_ATRIBUIVEIS.has(pedido.pedido.status)) return { tipo: "status-invalido" };

  // O entregador precisa ser DESTA empresa (o banco também barra pela FK composta).
  const entregador = await buscarEntregadorDaEmpresa(banco, empresaId, entrada.entregadorId);
  if (!entregador) return { tipo: "entregador-nao-encontrado" };
  if (!entregadorPodeOperar(entregador.status)) return { tipo: "entregador-inativo" };
  // NOVA atribuição exige ATIVO + DISPONÍVEL (a transação confere de novo, contra tela velha).
  if (!entregadorPodeReceberAtribuicao(entregador)) return { tipo: "entregador-indisponivel" };

  const anterior = await buscarAtribuicaoAtual(banco, pedidoId);
  const resultado = await atribuirEntrega(banco, {
    pedidoId,
    empresaId,
    entregadorId: entrada.entregadorId,
    atribuidoPorUsuarioId: usuarioId,
    entregadorAtualEsperadoId: entrada.entregadorAtualId,
  });
  if (resultado.tipo === "indisponivel") return { tipo: "entregador-indisponivel" };
  if (resultado.tipo !== "atribuido") return { tipo: "conflito" };

  // Quem perdeu o pedido é avisado (a entrega sai da lista dele) e o novo entregador recebe a entrega.
  if (anterior && anterior.entregadorId !== entrada.entregadorId) {
    eventosEntregas.publicar({ tipo: "entrega-atualizada", destinatariosIdentidadeIds: [anterior.pessoa.identidadeId], pedidoId, entrega: null });
  }
  await publicarEntrega({ banco, eventosEntregas }, pedidoId, entregador.pessoa.identidadeId);
  return { tipo: "atribuido" };
}

/**
 * Avisa o entregador atual sobre o estado da entrega (atribuição nova, mudança de status do pedido).
 * Entrega que deixou de ser ativa sai da lista dele (`entrega: null`), sem apagar histórico nenhum.
 */
export async function publicarEntrega(
  { banco, eventosEntregas }: { banco: Banco; eventosEntregas: CanalEventosEntregas },
  pedidoId: string,
  identidadeDestino?: string,
): Promise<void> {
  const atual = await buscarAtribuicaoAtual(banco, pedidoId);
  const destino = identidadeDestino ?? atual?.pessoa.identidadeId;
  if (!destino) return;

  const entrega = atual ? await montarEntrega(banco, pedidoId) : null;
  eventosEntregas.publicar({ tipo: "entrega-atualizada", destinatariosIdentidadeIds: [destino], pedidoId, entrega });
}

/**
 * Pedido que não está mais em operação (entregue ou cancelado): encerra a atribuição atual e tira a
 * entrega da lista do entregador. O histórico da atribuição permanece para auditoria.
 */
export async function encerrarEntregaDoPedido(
  { banco, eventosEntregas }: { banco: Banco; eventosEntregas: CanalEventosEntregas },
  pedidoId: string,
  motivo: string,
): Promise<void> {
  const atual = await buscarAtribuicaoAtual(banco, pedidoId);
  if (!atual) return;
  await encerrarAtribuicaoAtual(banco, pedidoId, motivo);
  eventosEntregas.publicar({ tipo: "entrega-atualizada", destinatariosIdentidadeIds: [atual.pessoa.identidadeId], pedidoId, entrega: null });
}

/**
 * ENTREGA como o entregador a vê: empresa, destino (snapshot com o ponto que o CLIENTE confirmou —
 * nunca geocodificado de novo), nome público do cliente, itens e como receber na entrega.
 * Fora disso, nada: sem telefone, sem outros endereços, sem outros pedidos, sem histórico do cliente.
 */
export async function montarEntrega(banco: Banco, pedidoId: string): Promise<EntregaAtribuida | null> {
  const atual = await buscarAtribuicaoAtual(banco, pedidoId);
  if (!atual) return null;

  const pedido = await buscarPedidoDaEmpresa(banco, atual.empresaId, pedidoId);
  if (!pedido?.destino) return null;

  const empresa = await buscarEmpresaPublicaPorId(banco, atual.empresaId);
  if (!empresa) return null;

  return {
    pedidoId,
    empresa: serializarEmpresaPublica(empresa),
    status: pedido.pedido.status,
    destino: pedido.destino,
    cliente: pedido.cliente,
    itens: pedido.itens.map((item) => ({ nomeProduto: item.nomeProduto, quantidade: item.quantidade })),
    totalCentavos: pedido.pedido.totalCentavos,
    formaPagamentoNaEntrega: pedido.pedido.formaPagamentoNaEntrega,
    trocoParaCentavos: pedido.pedido.trocoParaCentavos,
    atribuidoEm: atual.atribuidoEm.toISOString(),
  };
}

/** "Minhas entregas": só o que está atribuído AGORA a esta conta, em empresas onde o vínculo está ativo. */
export async function listarMinhasEntregas(banco: Banco, usuarioId: string): Promise<EntregaAtribuida[]> {
  const vinculos = await listarVinculosAtivosDaPessoa(banco, usuarioId);
  const atribuicoes = await listarAtribuicoesAtuaisDosVinculos(banco, vinculos.map((vinculo) => vinculo.id));

  const entregas: EntregaAtribuida[] = [];
  for (const atribuicao of atribuicoes) {
    const entrega = await montarEntrega(banco, atribuicao.pedidoId);
    // Entregue e cancelado saem da lista ativa (o histórico continua no banco).
    if (entrega && entregaEstaAtiva(entrega.status)) entregas.push(entrega);
  }
  return entregas;
}

/**
 * Detalhe de UMA entrega: só se o pedido estiver atribuído AGORA a esta conta e o vínculo estiver
 * ativo. Qualquer outro caso é "não encontrada" — inclusive pedido de outra empresa ou de outro
 * entregador, e inclusive para quem já esteve atribuído antes.
 */
export async function obterMinhaEntrega(banco: Banco, usuarioId: string, pedidoId: string): Promise<EntregaAtribuida | null> {
  const atual = await buscarAtribuicaoAtual(banco, pedidoId);
  if (!atual || atual.usuarioId !== usuarioId || !entregadorPodeOperar(atual.status)) return null;
  return montarEntrega(banco, pedidoId);
}
