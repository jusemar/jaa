import type { Banco } from "@jaa/banco";
import {
  entregadorPodeReceberAtribuicao,
  type FilaDoPedido,
  type SaidaEntrega,
} from "@jaa/contratos";
import { buscarEmpresaPublicaPorId } from "../../catalogo/repositorios/repositorio-empresas-publicas.js";
import { autorizarEmpresa } from "../../empresas/lib/autorizacao-empresas.js";
import { buscarPedidoDaEmpresa } from "../../pedidos/repositorios/repositorio-pedidos.js";
import { serializarSaida } from "../lib/serializar-saida.js";
import { planejadorAproximadoLocal } from "../lib/planejador-rota.js";
import type { MotorDeRotas } from "../lib/motor-rotas.js";
import {
  planejarRotaDaSaida,
  recalcularPercursoDaSaida,
} from "./planejar-rota.js";
import {
  buscarEntregadorDaEmpresa,
  listarVinculosAtivosDaPessoa,
} from "../repositorios/repositorio-entregadores.js";
import {
  buscarSaida,
  buscarSaidaAtivaDoPedido,
  buscarSaidaDaEmpresa,
  concluirSaidaSeTerminou,
  encerrarParadaDoPedido,
  inserirSaidaComParadas,
  listarPedidosElegiveis,
  listarSaidasDaEmpresa,
  listarSaidasDosVinculos,
  marcarSaidaIniciada,
  recusarSaidaLiberada,
  reordenarParadas,
  type SaidaComParadasRegistro,
} from "../repositorios/repositorio-saidas.js";

/*
 * SAÍDA DE ENTREGA: a empresa monta (escolhendo pedidos prontos e um entregador ativo e disponível),
 * o entregador leva e pode reordenar as próprias paradas. A saída agrupa e ordena; quem continua
 * dizendo "de quem é este pedido" é a atribuição (fonte única), gravada na mesma transação.
 */

type Dependencias = { banco: Banco; motorRotas?: MotorDeRotas | undefined };

type SemAcesso = { tipo: "empresa-nao-encontrada" };
type SemSaida = { tipo: "saida-nao-encontrada" };

export type ResultadoCriarSaida =
  | { tipo: "criada"; saida: SaidaComParadasRegistro }
  | SemAcesso
  | { tipo: "entregador-nao-encontrado" }
  | { tipo: "entregador-indisponivel" }
  // Algum pedido não é desta empresa, não está pronto, não tem destino ou já está em outra saída.
  | { tipo: "pedidos-invalidos" }
  | { tipo: "conflito" };

export async function criarSaidaAutorizada(
  dependencias: Dependencias,
  usuarioId: string,
  empresaId: string,
  entrada: { entregadorId: string; pedidoIds: string[] },
): Promise<ResultadoCriarSaida> {
  const { banco } = dependencias;
  const acesso = await autorizarEmpresa(
    banco,
    usuarioId,
    empresaId,
    "gerenciar-entregadores",
  );
  if (!acesso) return { tipo: "empresa-nao-encontrada" };

  const entregador = await buscarEntregadorDaEmpresa(
    banco,
    empresaId,
    entrada.entregadorId,
  );
  if (!entregador) return { tipo: "entregador-nao-encontrado" };
  // Saída NOVA exige ativo E disponível — a mesma regra da atribuição individual.
  if (!entregadorPodeReceberAtribuicao(entregador))
    return { tipo: "entregador-indisponivel" };

  const pedidoIds = [...new Set(entrada.pedidoIds)];
  const elegiveis = await listarPedidosElegiveis(banco, empresaId, pedidoIds);
  // Tudo ou nada: se um pedido não pode entrar, a saída não é montada pela metade.
  if (elegiveis.length !== pedidoIds.length)
    return { tipo: "pedidos-invalidos" };

  /*
   * A saída nasce numa ordem local barata (sem chamar provedor nenhum); logo depois o MOTOR DE ROTAS
   * planeja de verdade, a partir da base da empresa, e regrava a sequência com o percurso.
   */
  const plano = await planejadorAproximadoLocal.sugerirSequencia(
    elegiveis.map((pedido) => ({
      pedidoId: pedido.pedidoId,
      coordenadas: { latitude: pedido.latitude, longitude: pedido.longitude },
    })),
  );

  const criada = await inserirSaidaComParadas(banco, {
    empresaId,
    entregadorId: entrada.entregadorId,
    criadaPorUsuarioId: usuarioId,
    ordem: plano.ordem,
  });
  if ("tipo" in criada) return { tipo: "conflito" };

  await planejarRotaDaSaida(dependencias, criada.saidaId);

  const saida = await buscarSaidaDaEmpresa(banco, empresaId, criada.saidaId);
  if (!saida) throw new Error("Saída criada não encontrada.");
  return { tipo: "criada", saida };
}

export async function listarSaidasAutorizado(
  banco: Banco,
  usuarioId: string,
  empresaId: string,
  apenasAtivas: boolean,
): Promise<{ tipo: "lista"; saidas: SaidaComParadasRegistro[] } | SemAcesso> {
  const acesso = await autorizarEmpresa(
    banco,
    usuarioId,
    empresaId,
    "ver-pedidos",
  );
  if (!acesso) return { tipo: "empresa-nao-encontrada" };
  return {
    tipo: "lista",
    saidas: await listarSaidasDaEmpresa(banco, empresaId, apenasAtivas),
  };
}

export async function obterSaidaDaEmpresaAutorizado(
  banco: Banco,
  usuarioId: string,
  empresaId: string,
  saidaId: string,
): Promise<
  { tipo: "saida"; saida: SaidaComParadasRegistro } | SemAcesso | SemSaida
> {
  const acesso = await autorizarEmpresa(
    banco,
    usuarioId,
    empresaId,
    "ver-pedidos",
  );
  if (!acesso) return { tipo: "empresa-nao-encontrada" };
  const saida = await buscarSaidaDaEmpresa(banco, empresaId, saidaId);
  return saida ? { tipo: "saida", saida } : { tipo: "saida-nao-encontrada" };
}

/**
 * INICIAR, pedido pelo ENTREGADOR ATUAL da saída: é ele quem sai com os pedidos, e o
 * rastreamento só começa com a saída em andamento. A autorização é a de sempre para o lado dele:
 * só quem está com a saída (vínculo ativo) a enxerga; de outra pessoa é indistinguível de inexistente.
 */
export async function iniciarMinhaSaida(
  banco: Banco,
  usuarioId: string,
  saidaId: string,
  avancarPedido: (empresaId: string, pedidoId: string) => Promise<void>,
): Promise<
  | { tipo: "iniciada"; saida: SaidaComParadasRegistro }
  | SemSaida
  | { tipo: "status-invalido" }
> {
  const atual = await saidaDoEntregador(banco, usuarioId, saidaId);
  if (!atual) return { tipo: "saida-nao-encontrada" };
  return iniciarSaida(banco, atual, (pedidoId) =>
    avancarPedido(atual.saida.empresaId, pedidoId),
  );
}

export type ResultadoRecusarSaida =
  | {
      tipo: "recusada";
      empresaId: string;
      entregadorId: string;
      entregadorIdentidadeId: string;
      pedidoIds: string[];
      saida: SaidaComParadasRegistro;
    }
  | SemSaida
  | { tipo: "status-invalido" };

/** Recusa somente a rota liberada ainda não iniciada que pertence à pessoa autenticada. */
export async function recusarMinhaSaida(
  banco: Banco,
  usuarioId: string,
  saidaId: string,
): Promise<ResultadoRecusarSaida> {
  const atual = await saidaDoEntregador(banco, usuarioId, saidaId);
  if (!atual?.entregador) return { tipo: "saida-nao-encontrada" };
  if (atual.saida.status !== "liberada_retirada")
    return { tipo: "status-invalido" };

  const pedidoIds = atual.paradas
    .filter((parada) => parada.encerradaEm === null)
    .map((parada) => parada.pedidoId);
  const recusou = await recusarSaidaLiberada(banco, {
    saidaId,
    empresaId: atual.saida.empresaId,
    entregadorId: atual.saida.entregadorId as string,
    agora: new Date(),
  });
  if (!recusou) return { tipo: "status-invalido" };

  const saida = await buscarSaida(banco, saidaId);
  if (!saida) throw new Error("Saída recusada não encontrada.");
  return {
    tipo: "recusada",
    empresaId: atual.saida.empresaId,
    entregadorId: atual.saida.entregadorId as string,
    entregadorIdentidadeId: atual.entregador.identidadeId,
    pedidoIds,
    saida,
  };
}

/**
 * Núcleo do início: só sai de LIBERADA PARA RETIRADA, a troca de
 * status é condicional no banco (dois toques simultâneos: um vence) e cada
 * pedido PRONTO avança pela máquina de estados do pedido.
 */
async function iniciarSaida(
  banco: Banco,
  atual: SaidaComParadasRegistro,
  avancarPedido: (pedidoId: string) => Promise<void>,
): Promise<
  | { tipo: "iniciada"; saida: SaidaComParadasRegistro }
  | { tipo: "status-invalido" }
> {
  if (atual.saida.status !== "liberada_retirada")
    return { tipo: "status-invalido" };

  const iniciada = await marcarSaidaIniciada(banco, atual.saida.id);
  if (!iniciada) return { tipo: "status-invalido" };

  for (const parada of atual.paradas) {
    if (parada.encerradaEm === null && parada.statusPedido === "pronto")
      await avancarPedido(parada.pedidoId);
  }

  const saida = await buscarSaidaDaEmpresa(
    banco,
    atual.saida.empresaId,
    atual.saida.id,
  );
  if (!saida) throw new Error("Saída iniciada não encontrada.");
  return { tipo: "iniciada", saida };
}

/* ENTREGADOR: as próprias saídas e a reordenação da própria sequência. */

export async function listarMinhasSaidas(
  banco: Banco,
  usuarioId: string,
  apenasAtivas: boolean,
): Promise<SaidaComParadasRegistro[]> {
  const vinculos = await listarVinculosAtivosDaPessoa(banco, usuarioId);
  return listarSaidasDosVinculos(
    banco,
    vinculos.map((vinculo) => vinculo.id),
    apenasAtivas,
  );
}

// Só o entregador ATUAL da saída (com vínculo ativo) enxerga e opera a saída pela área dele.
async function saidaDoEntregador(
  banco: Banco,
  usuarioId: string,
  saidaId: string,
): Promise<SaidaComParadasRegistro | null> {
  const saida = await buscarSaida(banco, saidaId);
  if (!saida) return null;
  const vinculos = await listarVinculosAtivosDaPessoa(banco, usuarioId);
  return vinculos.some((vinculo) => vinculo.id === saida.saida.entregadorId)
    ? saida
    : null;
}

export async function obterMinhaSaida(
  banco: Banco,
  usuarioId: string,
  saidaId: string,
): Promise<SaidaComParadasRegistro | null> {
  return saidaDoEntregador(banco, usuarioId, saidaId);
}

export type ResultadoConcluirParada =
  | { tipo: "concluida"; saida: SaidaComParadasRegistro }
  | SemSaida
  | { tipo: "saida-nao-iniciada" }
  | { tipo: "parada-nao-e-proxima" }
  | { tipo: "pedido-ja-encerrado" }
  | { tipo: "transicao-invalida" };

/**
 * O entregador confirma somente a PRÓXIMA parada da própria saída já iniciada. A autorização da
 * pessoa e a posição operacional ficam aqui; a transição do pedido continua pertencendo à máquina
 * de estados de pedidos, recebida por callback.
 */
export async function concluirProximaParadaMinhaSaida(
  banco: Banco,
  usuarioId: string,
  saidaId: string,
  pedidoId: string,
  concluirPedido: (
    empresaId: string,
    pedidoId: string,
    statusAtual: "saiu_para_entrega" | "em_rota",
  ) => Promise<boolean>,
): Promise<ResultadoConcluirParada> {
  const atual = await saidaDoEntregador(banco, usuarioId, saidaId);
  if (!atual) return { tipo: "saida-nao-encontrada" };
  if (atual.saida.status !== "em_andamento")
    return { tipo: "saida-nao-iniciada" };

  const paradasAtivas = atual.paradas
    .filter((parada) => parada.encerradaEm === null)
    .sort((a, b) => a.posicao - b.posicao);
  const parada = atual.paradas.find((item) => item.pedidoId === pedidoId);
  if (!parada || parada.encerradaEm !== null)
    return { tipo: "pedido-ja-encerrado" };
  if (paradasAtivas[0]?.pedidoId !== pedidoId)
    return { tipo: "parada-nao-e-proxima" };
  if (
    parada.statusPedido !== "saiu_para_entrega" &&
    parada.statusPedido !== "em_rota"
  )
    return { tipo: "transicao-invalida" };

  const concluiu = await concluirPedido(
    atual.saida.empresaId,
    pedidoId,
    parada.statusPedido,
  );
  if (!concluiu) return { tipo: "transicao-invalida" };

  const saida = await buscarSaida(banco, saidaId);
  if (!saida) throw new Error("Saída após conclusão não encontrada.");
  return { tipo: "concluida", saida };
}

export type ResultadoReordenar =
  | { tipo: "reordenada"; saida: SaidaComParadasRegistro }
  | SemSaida
  // A ordem enviada não é exatamente o conjunto de paradas ativas da saída.
  | { tipo: "sequencia-invalida" }
  // Alguém alterou a sequência antes: a tela precisa recarregar (nada é sobrescrito).
  | { tipo: "versao-desatualizada"; saida: SaidaComParadasRegistro };

/**
 * A sequência do Jaa é SUGESTÃO: quem conhece a região é o entregador, e ele pode reordenar.
 * A nova ordem precisa ter exatamente as paradas ativas (uma vez cada) — assim nenhum pedido some,
 * duplica ou entra de fora. O histórico das paradas encerradas não é tocado.
 */
export async function reordenarMinhaSaida(
  dependencias: Dependencias,
  usuarioId: string,
  saidaId: string,
  entrada: { versaoSequencia: number; pedidoIds: string[] },
): Promise<ResultadoReordenar> {
  const { banco } = dependencias;
  const saida = await saidaDoEntregador(banco, usuarioId, saidaId);
  if (!saida) return { tipo: "saida-nao-encontrada" };

  const ativas = saida.paradas
    .filter((parada) => parada.encerradaEm === null)
    .map((parada) => parada.pedidoId);
  const enviados = [...entrada.pedidoIds];
  const mesmasParadas =
    ativas.length === enviados.length &&
    new Set(enviados).size === enviados.length &&
    ativas.every((pedidoId) => enviados.includes(pedidoId));
  if (!mesmasParadas) return { tipo: "sequencia-invalida" };

  const resultado = await reordenarParadas(banco, {
    saidaId,
    versaoEsperada: entrada.versaoSequencia,
    ordem: enviados,
  });
  /*
   * A ordem do entregador PREVALECE: o motor recalcula só o percurso real dela, sem reotimizar.
   * Este é o segundo (e último) momento em que o provedor é chamado.
   */
  if (resultado === "reordenada")
    await recalcularPercursoDaSaida(dependencias, saidaId);

  const atualizada = await buscarSaida(banco, saidaId);
  if (!atualizada) throw new Error("Saída reordenada não encontrada.");
  return resultado === "reordenada"
    ? { tipo: "reordenada", saida: atualizada }
    : { tipo: "versao-desatualizada", saida: atualizada };
}

/**
 * Pedido terminou (entregue ou cancelado): a parada sai da sequência ativa e, se foi a última, a
 * saída se conclui sozinha. O histórico das paradas e das atribuições permanece intacto.
 */
export async function encerrarParadaDoPedidoConcluido(
  banco: Banco,
  pedidoId: string,
  motivo: string,
): Promise<{ saidaId: string; entregadorId: string | null } | null> {
  const parada = await encerrarParadaDoPedido(banco, pedidoId, motivo);
  if (!parada) return null;
  const concluiu = await concluirSaidaSeTerminou(banco, parada.saidaId);
  // Saída concluída: concluir NÃO obriga retorno nem desliga "aceitando". Se ele continuar na base e
  // aceitando, volta para o FINAL da fila; se foi embora, fica "disponível fora da base".
  const saida = concluiu ? await buscarSaida(banco, parada.saidaId) : null;
  return {
    saidaId: parada.saidaId,
    entregadorId: saida?.saida.entregadorId ?? null,
  };
}

/**
 * FILA DO CLIENTE: informação DERIVADA da sequência para o dono do pedido — a situação e quantas
 * entregas ativas estão antes da dele. Nunca quem são, onde moram, nem a rota.
 * "Indo até você" só quando a saída está EM ANDAMENTO e o pedido é a primeira parada ativa.
 */
export async function calcularFilaDoPedido(
  banco: Banco,
  pedidoId: string,
): Promise<FilaDoPedido> {
  const parada = await buscarSaidaAtivaDoPedido(banco, pedidoId);
  if (!parada) return { pedidoId, situacao: "sem_saida", entregasAntes: null };

  const saida = await buscarSaida(banco, parada.saidaId);
  if (!saida) return { pedidoId, situacao: "sem_saida", entregasAntes: null };

  const ativas = saida.paradas
    .filter((item) => item.encerradaEm === null)
    .sort((a, b) => a.posicao - b.posicao);
  const posicao = ativas.findIndex((item) => item.pedidoId === pedidoId);
  if (posicao < 0)
    return { pedidoId, situacao: "encerrado", entregasAntes: null };

  // Antes do início real, para o cliente é tudo "separado para a entrega".
  if (saida.saida.status !== "em_andamento")
    return { pedidoId, situacao: "aguardando_saida", entregasAntes: posicao };
  return posicao === 0
    ? { pedidoId, situacao: "indo_ate_voce", entregasAntes: 0 }
    : { pedidoId, situacao: "na_fila", entregasAntes: posicao };
}

// Clientes que precisam saber da mudança: donos dos pedidos ainda ativos na saída.
export async function identidadesClientesDaSaida(
  banco: Banco,
  saidaId: string,
  empresaId: string,
): Promise<Array<{ pedidoId: string; identidadeId: string }>> {
  const saida = await buscarSaida(banco, saidaId);
  if (!saida) return [];
  const clientes: Array<{ pedidoId: string; identidadeId: string }> = [];
  for (const parada of saida.paradas) {
    const pedido = await buscarPedidoDaEmpresa(
      banco,
      empresaId,
      parada.pedidoId,
    );
    if (pedido)
      clientes.push({
        pedidoId: parada.pedidoId,
        identidadeId: pedido.pedido.clienteIdentidadeId,
      });
  }
  return clientes;
}

export async function serializarSaidaComEmpresa(
  banco: Banco,
  registro: SaidaComParadasRegistro,
): Promise<SaidaEntrega> {
  const empresa = await buscarEmpresaPublicaPorId(
    banco,
    registro.saida.empresaId,
  );
  if (!empresa) throw new Error("Empresa da saída não encontrada.");
  return serializarSaida(registro, empresa);
}
