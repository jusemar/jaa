import type { Banco } from "@jaa/banco";
import {
  LIMITE_MAXIMO_PEDIDOS_EMPRESA,
  entregadorPodeOperar,
  STATUS_POR_FILTRO_PEDIDOS,
  proximoStatusPedido,
  statusPedidoTerminal,
  type FiltroPedidosEmpresa,
  type StatusPedido,
} from "@jaa/contratos";
import { buscarEmpresaPublicaPorId, type EmpresaPublicaRegistro } from "../../catalogo/repositorios/repositorio-empresas-publicas.js";
import { autorizarEmpresa } from "../../empresas/lib/autorizacao-empresas.js";
import { encerrarEntregaDoPedido, publicarEntrega } from "../../entregas/casos-de-uso/atribuir-entrega.js";
import { aoPedidoFicarPronto } from "../../entregas/casos-de-uso/despacho-automatico.js";
import { encerrarParadaDoPedidoConcluido } from "../../entregas/casos-de-uso/gerir-saidas.js";
import { reavaliarFila } from "../../entregas/casos-de-uso/presenca-e-fila.js";
import { publicarOperacao } from "../../entregas/lib/publicar-operacao.js";
import { publicarSaidaPorId } from "../../entregas/lib/publicar-saida.js";
import { buscarSaidaAtivaDoPedido } from "../../entregas/repositorios/repositorio-saidas.js";
import type { CanalEventosEntregas } from "../../entregas/lib/eventos-entregas.js";
import { buscarAtribuicaoAtual } from "../../entregas/repositorios/repositorio-atribuicoes.js";
import { montarResumoPedido } from "../lib/resumo-pedido.js";
import type { CanalEventosPedidos } from "../lib/eventos-pedidos.js";
import {
  alterarStatusPedido,
  buscarPedidoDaEmpresa,
  listarPedidosDaEmpresa,
  type PedidoComItensRegistro,
  type PedidoDaEmpresaRegistro,
} from "../repositorios/repositorio-pedidos.js";

/*
 * Operação dos pedidos PELA EMPRESA. Toda entrada passa pela autorização central (`autorizarEmpresa`):
 * não existe autorização própria deste módulo, e empresa inexistente ou sem acesso são indistinguíveis.
 * A empresa nunca envia um status arbitrário: declara a INTENÇÃO (avançar/cancelar) e o status que
 * estava vendo; a máquina de estados decide, o banco confirma.
 */

type SemAcesso = { tipo: "empresa-nao-encontrada" };
type SemPedido = { tipo: "pedido-nao-encontrado" };

export async function listarPedidosDaEmpresaAutorizado(
  banco: Banco,
  usuarioId: string,
  empresaId: string,
  consulta: { filtro: FiltroPedidosEmpresa; limite: number; antesDe?: string | undefined },
): Promise<{ tipo: "lista"; pedidos: PedidoDaEmpresaRegistro[] } | SemAcesso> {
  const acesso = await autorizarEmpresa(banco, usuarioId, empresaId, "ver-pedidos");
  if (!acesso) return { tipo: "empresa-nao-encontrada" };

  const limite = Math.min(Math.max(Math.trunc(consulta.limite), 1), LIMITE_MAXIMO_PEDIDOS_EMPRESA);
  const pedidos = await listarPedidosDaEmpresa(banco, empresaId, {
    status: STATUS_POR_FILTRO_PEDIDOS[consulta.filtro],
    limite,
    antesDe: consulta.antesDe,
  });
  return { tipo: "lista", pedidos };
}

export async function obterPedidoDaEmpresaAutorizado(
  banco: Banco,
  usuarioId: string,
  empresaId: string,
  pedidoId: string,
): Promise<{ tipo: "pedido"; pedido: PedidoComItensRegistro; empresa: EmpresaPublicaRegistro } | SemAcesso | SemPedido> {
  const acesso = await autorizarEmpresa(banco, usuarioId, empresaId, "ver-pedidos");
  if (!acesso) return { tipo: "empresa-nao-encontrada" };

  const pedido = await buscarPedidoDaEmpresa(banco, empresaId, pedidoId);
  if (!pedido) return { tipo: "pedido-nao-encontrado" };

  const empresa = await buscarEmpresaPublicaPorId(banco, empresaId);
  if (!empresa) return { tipo: "pedido-nao-encontrado" };
  return { tipo: "pedido", pedido, empresa };
}

export type IntencaoStatus = { tipo: "avancar"; statusAtual: StatusPedido } | { tipo: "cancelar"; statusAtual: StatusPedido; motivo: string };

type ResultadoAlterar =
  | { tipo: "alterado"; pedido: PedidoComItensRegistro; empresa: EmpresaPublicaRegistro }
  | SemAcesso
  | SemPedido
  // Transição impossível pela máquina de estados (salto, regressão, terminal) ou estado já mudou.
  | { tipo: "transicao-invalida"; statusAtual: StatusPedido | null }
  // "Saiu para entrega" sem entregador atribuído e ativo.
  | { tipo: "entregador-nao-atribuido" };

/**
 * Avança um passo ou cancela, sempre em UMA transação (status atual + histórico). O `statusAtual`
 * informado pela empresa é conferido no próprio UPDATE: se outro operador já mudou o pedido, nada é
 * gravado e a operação é recusada, em vez de produzir um histórico impossível.
 */
export async function alterarStatusPedidoAutorizado(
  { banco, eventosPedidos, eventosEntregas }: { banco: Banco; eventosPedidos: CanalEventosPedidos; eventosEntregas: CanalEventosEntregas },
  usuarioId: string,
  empresaId: string,
  pedidoId: string,
  intencao: IntencaoStatus,
): Promise<ResultadoAlterar> {
  const acesso = await autorizarEmpresa(banco, usuarioId, empresaId, "gerenciar-pedidos");
  if (!acesso) return { tipo: "empresa-nao-encontrada" };

  const atual = await buscarPedidoDaEmpresa(banco, empresaId, pedidoId);
  if (!atual) return { tipo: "pedido-nao-encontrado" };

  const novoStatus = intencao.tipo === "cancelar" ? ("cancelado" as const) : proximoStatusPedido(intencao.statusAtual);
  // Terminal não avança nem cancela; e a intenção precisa partir do estado realmente atual.
  if (!novoStatus || statusPedidoTerminal(intencao.statusAtual) || intencao.statusAtual !== atual.pedido.status) {
    return { tipo: "transicao-invalida", statusAtual: atual.pedido.status };
  }

  /*
   * Sair para entrega exige ALGUÉM levando: entregador atribuído e com vínculo ativo. A regra vive no
   * servidor (a interface só ajuda); sem isso não existe entrega em rua sem responsável.
   */
  if (novoStatus === "saiu_para_entrega") {
    const atribuicao = await buscarAtribuicaoAtual(banco, pedidoId);
    if (!atribuicao || !entregadorPodeOperar(atribuicao.status)) return { tipo: "entregador-nao-atribuido" };
  }

  const alteracao = await alterarStatusPedido(banco, {
    pedidoId,
    empresaId,
    statusEsperado: intencao.statusAtual,
    novoStatus,
    motivo: intencao.tipo === "cancelar" ? intencao.motivo : null,
    operadorUsuarioId: usuarioId,
  });
  if (alteracao.tipo !== "alterado") return { tipo: "transicao-invalida", statusAtual: alteracao.statusAtual };

  const pedido = await buscarPedidoDaEmpresa(banco, empresaId, pedidoId);
  if (!pedido) throw new Error("Pedido alterado não encontrado.");
  const empresa = await buscarEmpresaPublicaPorId(banco, empresaId);
  if (!empresa) throw new Error("Empresa do pedido não encontrada.");

  /*
   * Depois do commit, o entregador atual acompanha a entrega: mudança de status atualiza a lista dele
   * e pedido encerrado (entregue/cancelado) sai da lista, com a atribuição encerrada e histórico intacto.
   */
  const saidaDoPedido = await buscarSaidaAtivaDoPedido(banco, pedidoId);
  if (novoStatus === "entregue" || novoStatus === "cancelado") {
    const motivo = novoStatus === "entregue" ? "Pedido entregue" : "Pedido cancelado";
    await encerrarEntregaDoPedido({ banco, eventosEntregas }, pedidoId, motivo);
    // A parada sai da sequência ativa (e a saída se conclui quando foi a última); histórico intacto.
    const parada = await encerrarParadaDoPedidoConcluido(banco, pedidoId, motivo);
    // Saída concluída com o entregador ainda na base e aceitando: ele volta ao final da fila.
    if (parada?.entregadorId) {
      const apos = await reavaliarFila(banco, parada.entregadorId, "Saída concluída");
      if (apos) await publicarOperacao({ banco, eventosEntregas }, apos.registro);
    }
  } else {
    await publicarEntrega({ banco, eventosEntregas }, pedidoId);
  }

  /*
   * PRONTO é o gatilho da automação: o pedido entra na formação da zona dele (quando a empresa tem
   * zonas). Fora das zonas ou sem automação, nada muda — continua valendo a montagem manual.
   */
  if (novoStatus === "pronto") await aoPedidoFicarPronto({ banco, eventosEntregas }, empresaId, pedidoId);
  // Empresa e entregador recebem a saída atualizada; cada cliente, só a própria posição na fila.
  if (saidaDoPedido) await publicarSaidaPorId({ banco, eventosEntregas }, saidaDoPedido.saidaId);

  // Depois do commit: só o cliente dono e a identidade da empresa recebem a atualização.
  eventosPedidos.publicar({
    tipo: "pedido-status-atualizado",
    destinatariosIdentidadeIds: [pedido.pedido.clienteIdentidadeId, empresa.identidadeId],
    conversaId: pedido.pedido.conversaId,
    pedido: montarResumoPedido(pedido),
    motivoCancelamento: pedido.pedido.motivoCancelamento,
    ocorridoEm: pedido.pedido.atualizadoEm,
  });

  return { tipo: "alterado", pedido, empresa };
}
