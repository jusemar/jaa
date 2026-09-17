import {
  entregaAtribuidaSchema,
  entregaDoPedidoSchema,
  entregadorDaEmpresaSchema,
  listaConvitesEntregadorSchema,
  listaEntregadoresSchema,
  listaEntregasSchema,
  baseEmpresaSchema,
  filaDoPedidoSchema,
  listaSituacoesOperacionaisSchema,
  painelOperacionalSchema,
  situacaoOperacionalSchema,
  listaSaidasSchema,
  listaVinculosEntregadorSchema,
  acompanhamentoPedidoSchema,
  listaPosicoesSchema,
  listaZonasSchema,
  painelDespachoSchema,
  respostaPosicaoSaidaSchema,
  saidaEntregaSchema,
  zonaEntregaSchema,
  type EntregaAtribuida,
  type EntregaDoPedido,
  type EntregadorDaEmpresa,
  type ListaConvitesEntregador,
  type ListaEntregadores,
  type ListaEntregas,
  type BaseEmpresa,
  type Coordenadas,
  type EnviarLocalizacaoEntrada,
  type FilaDoPedido,
  type ListaSituacoesOperacionais,
  type PainelOperacional,
  type SalvarBaseEntrada,
  type SituacaoOperacional,
  type ListaSaidas,
  type ListaVinculosEntregador,
  type AcompanhamentoPedido,
  type ListaPosicoes,
  type ListaZonas,
  type PainelDespacho,
  type PosicaoEntregador,
  type SaidaEntrega,
  type SalvarConfiguracaoDespachoEntrada,
  type SalvarZonaEntrada,
  type ZonaEntrega,
} from "@jaa/contratos";
import * as z from "zod";
import { requisitarApi, type ResultadoApi } from "@/lib/api";
import { cabecalhosIdentidadeAtuante } from "@/lib/identidade-atuante";

/*
 * Dois lados bem separados: a EMPRESA administra entregadores e atribui pedidos; a PESSOA responde
 * convites e vê as entregas atribuídas a ela. Nenhuma rota daqui permite pedir um pedido arbitrário.
 */

const daEmpresa = (empresaId: string, sufixo = "") => `/empresas/${encodeURIComponent(empresaId)}${sufixo}`;

export function listarEntregadores(empresaId: string): Promise<ResultadoApi<ListaEntregadores>> {
  return requisitarApi(daEmpresa(empresaId, "/entregadores"), listaEntregadoresSchema, {});
}

export function convidarEntregador(empresaId: string, nomeUsuario: string): Promise<ResultadoApi<EntregadorDaEmpresa>> {
  return requisitarApi(daEmpresa(empresaId, "/entregadores"), entregadorDaEmpresaSchema, { method: "POST", body: JSON.stringify({ nomeUsuario }) });
}

export function alterarStatusEntregador(empresaId: string, entregadorId: string, status: "ativo" | "inativo"): Promise<ResultadoApi<EntregadorDaEmpresa>> {
  return requisitarApi(daEmpresa(empresaId, `/entregadores/${encodeURIComponent(entregadorId)}`), entregadorDaEmpresaSchema, { method: "PATCH", body: JSON.stringify({ status }) });
}

export function obterEntregaDoPedido(empresaId: string, pedidoId: string): Promise<ResultadoApi<EntregaDoPedido>> {
  return requisitarApi(daEmpresa(empresaId, `/pedidos/${encodeURIComponent(pedidoId)}/entrega`), entregaDoPedidoSchema, {});
}

// `entregadorAtualId` = quem a tela estava mostrando: protege contra atribuição concorrente.
export function atribuirEntrega(empresaId: string, pedidoId: string, entregadorId: string, entregadorAtualId: string | null): Promise<ResultadoApi<EntregaDoPedido>> {
  return requisitarApi(daEmpresa(empresaId, `/pedidos/${encodeURIComponent(pedidoId)}/entrega`), entregaDoPedidoSchema, {
    method: "POST",
    body: JSON.stringify({ entregadorId, entregadorAtualId }),
  });
}

export function listarMeusConvites(): Promise<ResultadoApi<ListaConvitesEntregador>> {
  return requisitarApi("/entregas/convites", listaConvitesEntregadorSchema, {});
}

export function responderConvite(entregadorId: string, resposta: "aceitar" | "recusar"): Promise<ResultadoApi<{ status: string }>> {
  return requisitarApi(`/entregas/convites/${encodeURIComponent(entregadorId)}`, z.object({ status: z.string() }), { method: "POST", body: JSON.stringify({ resposta }) });
}

export function listarMinhasEntregas(): Promise<ResultadoApi<ListaEntregas>> {
  return requisitarApi("/entregas", listaEntregasSchema, {});
}

export function obterMinhaEntrega(pedidoId: string): Promise<ResultadoApi<EntregaAtribuida>> {
  return requisitarApi(`/entregas/${encodeURIComponent(pedidoId)}`, entregaAtribuidaSchema, {});
}

/*
 * DISPONIBILIDADE: decisão do próprio entregador, por empresa. A empresa não tem rota para isto —
 * ela administra o vínculo (ativo/inativo); quem decide aceitar entregas agora é quem entrega.
 */

export function listarMeusVinculos(): Promise<ResultadoApi<ListaVinculosEntregador>> {
  return requisitarApi("/entregas/vinculos", listaVinculosEntregadorSchema, {});
}

export function alterarMinhaDisponibilidade(entregadorId: string, disponivel: boolean): Promise<ResultadoApi<EntregadorDaEmpresa>> {
  return requisitarApi(`/entregas/vinculos/${encodeURIComponent(entregadorId)}`, entregadorDaEmpresaSchema, { method: "PATCH", body: JSON.stringify({ disponivel }) });
}

/*
 * SAÍDA DE ENTREGA: a empresa monta e acompanha; o entregador abre a própria e reordena a sequência.
 * O cliente não tem rota aqui — para ele existe só a fila derivada do próprio pedido.
 */

export function listarSaidasDaEmpresa(empresaId: string): Promise<ResultadoApi<ListaSaidas>> {
  return requisitarApi(daEmpresa(empresaId, "/saidas"), listaSaidasSchema, {});
}

export function criarSaida(empresaId: string, entregadorId: string, pedidoIds: string[]): Promise<ResultadoApi<SaidaEntrega>> {
  return requisitarApi(daEmpresa(empresaId, "/saidas"), saidaEntregaSchema, { method: "POST", body: JSON.stringify({ entregadorId, pedidoIds }) });
}

export function iniciarSaida(empresaId: string, saidaId: string): Promise<ResultadoApi<SaidaEntrega>> {
  return requisitarApi(daEmpresa(empresaId, `/saidas/${encodeURIComponent(saidaId)}/iniciar`), saidaEntregaSchema, { method: "POST" });
}

export function listarMinhasSaidas(): Promise<ResultadoApi<ListaSaidas>> {
  return requisitarApi("/entregas/saidas", listaSaidasSchema, {});
}

// A sequência do Jaa é sugestão: quem está na rua reordena, informando a versão que viu.
export function reordenarSequencia(saidaId: string, versaoSequencia: number, pedidoIds: string[]): Promise<ResultadoApi<SaidaEntrega>> {
  return requisitarApi(`/entregas/saidas/${encodeURIComponent(saidaId)}/sequencia`, saidaEntregaSchema, {
    method: "PATCH",
    body: JSON.stringify({ versaoSequencia, pedidoIds }),
  });
}

// Posição do PRÓPRIO pedido: situação + quantas entregas antes. Nada da rota nem de outros clientes.
export function obterFilaDoPedido(pedidoId: string): Promise<ResultadoApi<FilaDoPedido>> {
  return requisitarApi(`/pedidos/${encodeURIComponent(pedidoId)}/fila`, filaDoPedidoSchema, { headers: cabecalhosIdentidadeAtuante() });
}

/*
 * BASE OPERACIONAL, PRESENÇA e FILA. A empresa configura a base e acompanha o painel; o entregador
 * manda a leitura do aparelho (nunca "estou na base") e vê a própria situação.
 */

export function obterBase(empresaId: string): Promise<ResultadoApi<BaseEmpresa>> {
  return requisitarApi(daEmpresa(empresaId, "/base"), baseEmpresaSchema, {});
}

export function salvarBase(empresaId: string, entrada: SalvarBaseEntrada): Promise<ResultadoApi<BaseEmpresa>> {
  return requisitarApi(daEmpresa(empresaId, "/base"), baseEmpresaSchema, { method: "POST", body: JSON.stringify(entrada) });
}

export function confirmarPontoBase(empresaId: string, coordenadas: Coordenadas): Promise<ResultadoApi<BaseEmpresa>> {
  return requisitarApi(daEmpresa(empresaId, "/base/localizacao"), baseEmpresaSchema, { method: "POST", body: JSON.stringify(coordenadas) });
}

export function obterPainelOperacional(empresaId: string): Promise<ResultadoApi<PainelOperacional>> {
  return requisitarApi(daEmpresa(empresaId, "/operacao"), painelOperacionalSchema, {});
}

// O aparelho informa o que mediu; quem decide presença é o servidor.
export function enviarLocalizacao(entregadorId: string, leitura: EnviarLocalizacaoEntrada): Promise<ResultadoApi<SituacaoOperacional>> {
  return requisitarApi(`/entregas/vinculos/${encodeURIComponent(entregadorId)}/localizacao`, situacaoOperacionalSchema, {
    method: "POST",
    body: JSON.stringify(leitura),
  });
}

/*
 * ZONAS e AUTOMAÇÃO DO DESPACHO: administração da EMPRESA. O cliente não tem rota aqui (ele nunca
 * escolhe zona) e o entregador também não (para ele existe a saída atribuída a ele).
 */

export function listarZonas(empresaId: string): Promise<ResultadoApi<ListaZonas>> {
  return requisitarApi(daEmpresa(empresaId, "/zonas"), listaZonasSchema, {});
}

export function criarZona(empresaId: string, entrada: SalvarZonaEntrada): Promise<ResultadoApi<ZonaEntrega>> {
  return requisitarApi(daEmpresa(empresaId, "/zonas"), zonaEntregaSchema, { method: "POST", body: JSON.stringify(entrada) });
}

export function atualizarZona(empresaId: string, zonaId: string, entrada: SalvarZonaEntrada): Promise<ResultadoApi<ZonaEntrega>> {
  return requisitarApi(daEmpresa(empresaId, `/zonas/${encodeURIComponent(zonaId)}`), zonaEntregaSchema, { method: "PATCH", body: JSON.stringify(entrada) });
}

// Marcar em A vale para B: o servidor normaliza o par.
export function definirCompatibilidades(empresaId: string, zonaId: string, zonaIds: string[]): Promise<ResultadoApi<ListaZonas>> {
  return requisitarApi(daEmpresa(empresaId, `/zonas/${encodeURIComponent(zonaId)}/compatibilidades`), listaZonasSchema, {
    method: "POST",
    body: JSON.stringify({ zonaIds }),
  });
}

export function obterPainelDespacho(empresaId: string): Promise<ResultadoApi<PainelDespacho>> {
  return requisitarApi(daEmpresa(empresaId, "/despacho"), painelDespachoSchema, {});
}

export function salvarConfiguracaoDespacho(empresaId: string, entrada: SalvarConfiguracaoDespachoEntrada): Promise<ResultadoApi<PainelDespacho>> {
  return requisitarApi(daEmpresa(empresaId, "/despacho"), painelDespachoSchema, { method: "POST", body: JSON.stringify(entrada) });
}

// Intervenção do gestor: fechar antes da hora uma saída que ainda está juntando pedidos.
export function fecharSaida(empresaId: string, saidaId: string): Promise<ResultadoApi<SaidaEntrega>> {
  return requisitarApi(daEmpresa(empresaId, `/saidas/${encodeURIComponent(saidaId)}/fechar`), saidaEntregaSchema, { method: "POST" });
}

/*
 * RASTREAMENTO (leitura). O Web nunca envia posição: quem envia é o aplicativo do entregador.
 * Estas rotas existem para RECONEXÃO — recuperar o estado atual sem depender do último evento.
 */

// Posições das saídas EM ANDAMENTO da empresa (fora da operação não há rastreamento).
export function listarPosicoesDaEmpresa(empresaId: string): Promise<ResultadoApi<ListaPosicoes>> {
  return requisitarApi(daEmpresa(empresaId, "/posicoes"), listaPosicoesSchema, {});
}

export function obterPosicaoDaSaida(empresaId: string, saidaId: string): Promise<ResultadoApi<{ posicao: PosicaoEntregador | null }>> {
  return requisitarApi(daEmpresa(empresaId, `/saidas/${encodeURIComponent(saidaId)}/posicao`), respostaPosicaoSaidaSchema, {});
}

/**
 * ACOMPANHAMENTO do PRÓPRIO pedido: a fila de sempre e, só quando é a vez dele, a posição do
 * entregador. Quem decide o que entra aqui é o servidor — o Web só apresenta.
 */
export function obterAcompanhamentoDoPedido(pedidoId: string): Promise<ResultadoApi<AcompanhamentoPedido>> {
  return requisitarApi(`/pedidos/${encodeURIComponent(pedidoId)}/acompanhamento`, acompanhamentoPedidoSchema, { headers: cabecalhosIdentidadeAtuante() });
}

export function listarMinhasSituacoes(): Promise<ResultadoApi<ListaSituacoesOperacionais>> {
  return requisitarApi("/entregas/situacao", listaSituacoesOperacionaisSchema, {});
}
