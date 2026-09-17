import type { Banco } from "@jaa/banco";
import {
  POLITICA_RASTREAMENTO,
  posicaoEstaRecente,
  type AcompanhamentoPedido,
  type EnviarPosicaoEntrada,
  type PosicaoEntregador,
} from "@jaa/contratos";
import { autorizarEmpresa } from "../../empresas/lib/autorizacao-empresas.js";
import { buscarEmpresaPublicaPorId } from "../../catalogo/repositorios/repositorio-empresas-publicas.js";
import type { CanalEventosEntregas } from "../lib/eventos-entregas.js";
import { listarVinculosAtivosDaPessoa } from "../repositorios/repositorio-entregadores.js";
import { buscarSaida, buscarSaidaAtivaDoPedido } from "../repositorios/repositorio-saidas.js";
import {
  buscarPosicaoDaSaida,
  esquecerPosicaoDaSaida,
  listarPosicoesAtivasDaEmpresa,
  registrarPosicao,
  serializarPosicao,
} from "../repositorios/repositorio-rastreamento.js";
import { calcularFilaDoPedido } from "./gerir-saidas.js";

/*
 * RASTREAMENTO durante a saída. Três decisões que ficam TODAS no servidor:
 *
 * 1. QUANDO rastrear: só com saída EM ANDAMENTO daquele entregador. Terminou, acabou;
 * 2. O QUE aceitar: coordenada válida, leitura recente e com precisão utilizável (o aparelho informa,
 *    o servidor decide — o cliente nunca manda empresa nem "estou entregando");
 * 3. QUEM recebe: a empresa daquela saída e o próprio entregador; o cliente, SÓ quando a entrega dele
 *    é a parada atual — e mesmo assim recebe um ponto, nunca a rota ou os destinos dos outros.
 *
 * Nada aqui chama provedor de rotas: posição de GPS não recalcula percurso (isso seria custo por
 * segundo e não é o que o Jaa faz).
 */

export interface DependenciasRastreamento {
  banco: Banco;
  eventosEntregas: CanalEventosEntregas;
  agora?: (() => Date) | undefined;
}

export type ResultadoPosicao =
  | { tipo: "registrada"; posicao: PosicaoEntregador }
  // Chegou atrasada/fora de ordem: a posição atual é mais nova e permanece.
  | { tipo: "ignorada" }
  // Saída inexistente, de outra pessoa, ou que não é dela — 404 sem revelar o que existe.
  | { tipo: "saida-nao-encontrada" }
  // A saída não está em andamento (ainda não saiu, ou já terminou): fora da operação não se rastreia.
  | { tipo: "fora-de-operacao" }
  | { tipo: "leitura-invalida" };

export async function registrarPosicaoDoEntregador(
  dependencias: DependenciasRastreamento,
  usuarioId: string,
  saidaId: string,
  entrada: EnviarPosicaoEntrada & { capturadaEm: string },
): Promise<ResultadoPosicao> {
  const { banco } = dependencias;
  const agora = dependencias.agora?.() ?? new Date();

  const saida = await buscarSaida(banco, saidaId);
  if (!saida) return { tipo: "saida-nao-encontrada" };

  /*
   * A EMPRESA vem da saída, nunca do cliente: quem envia só prova que é o entregador daquela saída.
   * Vínculo ativo em outra empresa não dá acesso a esta operação.
   */
  const entregadorId = saida.saida.entregadorId;
  const vinculos = await listarVinculosAtivosDaPessoa(banco, usuarioId);
  if (entregadorId === null || !vinculos.some((vinculo) => vinculo.id === entregadorId)) return { tipo: "saida-nao-encontrada" };
  if (saida.saida.status !== "em_andamento") return { tipo: "fora-de-operacao" };

  const capturadaEm = new Date(entrada.capturadaEm);
  const idade = agora.getTime() - capturadaEm.getTime();
  const precisao = entrada.precisaoMetros ?? null;
  // Leitura velha, do futuro ou imprecisa demais não posiciona ninguém: é descartada com motivo.
  if (Number.isNaN(capturadaEm.getTime()) || idade > POLITICA_RASTREAMENTO.idadeMaximaMs || -idade > POLITICA_RASTREAMENTO.toleranciaFuturoMs) {
    return { tipo: "leitura-invalida" };
  }
  if (precisao !== null && precisao > POLITICA_RASTREAMENTO.precisaoMaximaMetros) return { tipo: "leitura-invalida" };

  const registro = await registrarPosicao(banco, {
    saidaId,
    empresaId: saida.saida.empresaId,
    entregadorId,
    latitude: entrada.latitude,
    longitude: entrada.longitude,
    precisaoMetros: precisao === null ? null : Math.round(precisao),
    velocidadeMetrosPorSegundo: entrada.velocidadeMetrosPorSegundo ?? null,
    direcaoGraus: entrada.direcaoGraus === null || entrada.direcaoGraus === undefined ? null : Math.round(entrada.direcaoGraus),
    capturadaEm,
    recebidaEm: agora,
  });
  // Nada gravado = a posição atual é mais recente (pacote atrasado, outro aparelho, fora de ordem).
  if (!registro) return { tipo: "ignorada" };

  const posicao = serializarPosicao(registro);
  await publicarPosicao(dependencias, saidaId, posicao);
  return { tipo: "registrada", posicao };
}

/**
 * Publica para quem tem direito a CADA pedaço: empresa e entregador recebem a posição; o cliente da
 * parada ATUAL recebe o acompanhamento dele (fila + ponto), e os demais clientes, só a fila.
 */
async function publicarPosicao(dependencias: DependenciasRastreamento, saidaId: string, posicao: PosicaoEntregador): Promise<void> {
  const { banco, eventosEntregas } = dependencias;
  const saida = await buscarSaida(banco, saidaId);
  if (!saida) return;

  const destinatarios: string[] = [];
  const empresa = await buscarEmpresaPublicaPorId(banco, saida.saida.empresaId);
  if (empresa) destinatarios.push(empresa.identidadeId);
  if (saida.entregador) destinatarios.push(saida.entregador.identidadeId);
  if (destinatarios.length > 0) eventosEntregas.publicar({ tipo: "posicao-atualizada", destinatariosIdentidadeIds: destinatarios, posicao });

  // Só a PRIMEIRA parada ativa é "indo até você": é o único cliente que pode ver o entregador.
  const atual = saida.paradas.filter((parada) => parada.encerradaEm === null).sort((a, b) => a.posicao - b.posicao)[0];
  if (!atual) return;
  const acompanhamento = await montarAcompanhamento(dependencias, atual.pedidoId);
  if (!acompanhamento.posicaoEntregador) return;
  eventosEntregas.publicar({
    tipo: "acompanhamento-atualizado",
    destinatariosIdentidadeIds: [atual.cliente.identidadeId],
    pedidoId: atual.pedidoId,
    acompanhamento,
  });
}

/**
 * ACOMPANHAMENTO do cliente: a fila derivada de sempre e a posição SOMENTE quando a entrega dele é a
 * parada atual de uma saída em andamento — e a posição precisa ser recente, senão o cliente veria um
 * ponto velho como se fosse "agora". Nunca vaza destino, id ou nome de outra parada.
 */
export async function montarAcompanhamento(dependencias: DependenciasRastreamento, pedidoId: string): Promise<AcompanhamentoPedido> {
  const { banco } = dependencias;
  const agora = dependencias.agora?.() ?? new Date();
  const fila = await calcularFilaDoPedido(banco, pedidoId);
  if (fila.situacao !== "indo_ate_voce") return { fila, posicaoEntregador: null };

  const parada = await buscarSaidaAtivaDoPedido(banco, pedidoId);
  if (!parada) return { fila, posicaoEntregador: null };
  const registro = await buscarPosicaoDaSaida(banco, parada.saidaId);
  if (!registro) return { fila, posicaoEntregador: null };

  const posicao = serializarPosicao(registro);
  if (!posicaoEstaRecente(posicao, agora)) return { fila, posicaoEntregador: null };
  // Só o ponto e quando foi capturado: nem saída, nem entregador, nem paradas.
  return { fila, posicaoEntregador: { latitude: posicao.latitude, longitude: posicao.longitude, capturadaEm: posicao.capturadaEm } };
}

/** Reconexão do ENTREGADOR ou da EMPRESA: a última posição permitida, sem depender do último evento. */
export async function obterPosicaoAutorizada(
  banco: Banco,
  usuarioId: string,
  saidaId: string,
  empresaId?: string,
): Promise<{ tipo: "posicao"; posicao: PosicaoEntregador | null } | { tipo: "sem-acesso" }> {
  const saida = await buscarSaida(banco, saidaId);
  if (!saida) return { tipo: "sem-acesso" };
  if (empresaId && saida.saida.empresaId !== empresaId) return { tipo: "sem-acesso" };

  const acesso = empresaId
    ? (await autorizarEmpresa(banco, usuarioId, empresaId, "ver-pedidos")) !== null
    : (await listarVinculosAtivosDaPessoa(banco, usuarioId)).some((vinculo) => vinculo.id === saida.saida.entregadorId);
  if (!acesso) return { tipo: "sem-acesso" };

  const registro = await buscarPosicaoDaSaida(banco, saidaId);
  return { tipo: "posicao", posicao: registro ? serializarPosicao(registro) : null };
}

/** Painel da empresa: posições das saídas EM ANDAMENTO dela — nunca de quem não está em operação. */
export async function listarPosicoesAutorizadas(
  banco: Banco,
  usuarioId: string,
  empresaId: string,
): Promise<{ tipo: "lista"; posicoes: PosicaoEntregador[] } | { tipo: "sem-acesso" }> {
  const acesso = await autorizarEmpresa(banco, usuarioId, empresaId, "ver-pedidos");
  if (!acesso) return { tipo: "sem-acesso" };
  return { tipo: "lista", posicoes: (await listarPosicoesAtivasDaEmpresa(banco, empresaId)).map(serializarPosicao) };
}

/** Saída terminou: a posição é apagada e ninguém mais recebe evento daquela operação. */
export async function encerrarRastreamentoDaSaida(banco: Banco, saidaId: string): Promise<void> {
  await esquecerPosicaoDaSaida(banco, saidaId);
}
