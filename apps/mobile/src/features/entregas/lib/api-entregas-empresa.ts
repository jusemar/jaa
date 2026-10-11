import {
  baseEmpresaSchema,
  entregaDoPedidoSchema,
  entregadorDaEmpresaSchema,
  listaCandidatosEntregadorSchema,
  listaEntregadoresSchema,
  listaPosicoesSchema,
  listaSaidasSchema,
  listaZonasSchema,
  painelDespachoSchema,
  painelOperacionalSchema,
  saidaEntregaSchema,
  sugestaoLocalizacaoBaseSchema,
  zonaEntregaSchema,
  type BaseEmpresa,
  type Coordenadas,
  type EntregaDoPedido,
  type EntregadorDaEmpresa,
  type ListaCandidatosEntregador,
  type ListaEntregadores,
  type ListaPosicoes,
  type ListaSaidas,
  type ListaZonas,
  type PainelDespacho,
  type PainelOperacional,
  type SaidaEntrega,
  type SalvarBaseEntrada,
  type SalvarConfiguracaoDespachoEntrada,
  type SalvarZonaEntrada,
  type SugestaoLocalizacaoBase,
  type ZonaEntrega,
} from "@jaa/contratos";
import { requisitarApi, type RespostaApi } from "@/lib/api";

/*
 * Lado da EMPRESA nas entregas — as mesmas rotas da Web (`entregas/lib/api-entregas.ts`). Quem
 * autoriza é o servidor, pelo vínculo da conta com a empresa (sem acesso = 404).
 */
const daEmpresa = (empresaId: string, sufixo = "") => `/empresas/${encodeURIComponent(empresaId)}${sufixo}`;

export function listarEntregadores(empresaId: string): Promise<RespostaApi<ListaEntregadores>> {
  return requisitarApi(daEmpresa(empresaId, "/entregadores"), listaEntregadoresSchema, {});
}

export function obterEntregaDoPedido(empresaId: string, pedidoId: string): Promise<RespostaApi<EntregaDoPedido>> {
  return requisitarApi(daEmpresa(empresaId, `/pedidos/${encodeURIComponent(pedidoId)}/entrega`), entregaDoPedidoSchema, {});
}

// `entregadorAtualId` = quem a tela estava mostrando: protege contra atribuição concorrente.
// `transferirDaSaida`: o gerente confirmou tirar o pedido da saída que ainda não saiu.
export function atribuirEntrega(empresaId: string, pedidoId: string, entregadorId: string, entregadorAtualId: string | null, transferirDaSaida = false): Promise<RespostaApi<EntregaDoPedido>> {
  return requisitarApi(daEmpresa(empresaId, `/pedidos/${encodeURIComponent(pedidoId)}/entrega`), entregaDoPedidoSchema, {
    method: "POST",
    body: JSON.stringify({ entregadorId, entregadorAtualId, ...(transferirDaSaida ? { transferirDaSaida: true } : {}) }),
  });
}

export function listarSaidasDaEmpresa(empresaId: string, apenasAtivas = true): Promise<RespostaApi<ListaSaidas>> {
  return requisitarApi(`${daEmpresa(empresaId, "/saidas")}${apenasAtivas ? "" : "?ativas=false"}`, listaSaidasSchema, {});
}

/*
 * LOGÍSTICA da empresa (Operação · Entregadores · Zonas e automação) — as mesmas rotas da área de
 * Logística da Web. Nenhuma regra mora aqui: o servidor autoriza, valida e decide.
 */

// ENTREGADORES: convite pelo @usuario público; a empresa só liga/desliga o vínculo.
export function buscarCandidatosEntregador(empresaId: string, termo: string): Promise<RespostaApi<ListaCandidatosEntregador>> {
  return requisitarApi(daEmpresa(empresaId, `/entregadores/busca?termo=${encodeURIComponent(termo)}`), listaCandidatosEntregadorSchema, {});
}

export function convidarEntregador(empresaId: string, nomeUsuario: string): Promise<RespostaApi<EntregadorDaEmpresa>> {
  return requisitarApi(daEmpresa(empresaId, "/entregadores"), entregadorDaEmpresaSchema, { method: "POST", body: JSON.stringify({ nomeUsuario }) });
}

export function alterarStatusEntregador(empresaId: string, entregadorId: string, status: "ativo" | "inativo"): Promise<RespostaApi<EntregadorDaEmpresa>> {
  return requisitarApi(daEmpresa(empresaId, `/entregadores/${encodeURIComponent(entregadorId)}`), entregadorDaEmpresaSchema, { method: "PATCH", body: JSON.stringify({ status }) });
}

// SAÍDAS: montar à mão e liberar para retirada (a liberação antecipada também fecha a formação).
export function criarSaida(empresaId: string, entregadorId: string, pedidoIds: string[]): Promise<RespostaApi<SaidaEntrega>> {
  return requisitarApi(daEmpresa(empresaId, "/saidas"), saidaEntregaSchema, { method: "POST", body: JSON.stringify({ entregadorId, pedidoIds }) });
}

export function liberarSaida(empresaId: string, saidaId: string): Promise<RespostaApi<SaidaEntrega>> {
  return requisitarApi(daEmpresa(empresaId, `/saidas/${encodeURIComponent(saidaId)}/liberar`), saidaEntregaSchema, { method: "POST" });
}

// Posições das saídas EM ANDAMENTO (leitura, para reconexão): quem envia posição é o app do entregador.
export function listarPosicoesDaEmpresa(empresaId: string): Promise<RespostaApi<ListaPosicoes>> {
  return requisitarApi(daEmpresa(empresaId, "/posicoes"), listaPosicoesSchema, {});
}

// BASE e FILA: endereço + ponto confirmado no mapa + raio; o painel traz só estados derivados.
export function obterBase(empresaId: string): Promise<RespostaApi<BaseEmpresa>> {
  return requisitarApi(daEmpresa(empresaId, "/base"), baseEmpresaSchema, {});
}

export function salvarBase(empresaId: string, entrada: SalvarBaseEntrada): Promise<RespostaApi<BaseEmpresa>> {
  return requisitarApi(daEmpresa(empresaId, "/base"), baseEmpresaSchema, { method: "POST", body: JSON.stringify(entrada) });
}

export function confirmarPontoBase(empresaId: string, coordenadas: Coordenadas): Promise<RespostaApi<BaseEmpresa>> {
  return requisitarApi(daEmpresa(empresaId, "/base/localizacao"), baseEmpresaSchema, { method: "POST", body: JSON.stringify(coordenadas) });
}

export function obterSugestaoLocalizacaoBase(empresaId: string): Promise<RespostaApi<SugestaoLocalizacaoBase>> {
  return requisitarApi(daEmpresa(empresaId, "/base/sugestao-localizacao"), sugestaoLocalizacaoBaseSchema, {});
}

export function obterPainelOperacional(empresaId: string): Promise<RespostaApi<PainelOperacional>> {
  return requisitarApi(daEmpresa(empresaId, "/operacao"), painelOperacionalSchema, {});
}

// ZONAS e AUTOMAÇÃO DO DESPACHO.
export function listarZonas(empresaId: string): Promise<RespostaApi<ListaZonas>> {
  return requisitarApi(daEmpresa(empresaId, "/zonas"), listaZonasSchema, {});
}

export function criarZona(empresaId: string, entrada: SalvarZonaEntrada): Promise<RespostaApi<ZonaEntrega>> {
  return requisitarApi(daEmpresa(empresaId, "/zonas"), zonaEntregaSchema, { method: "POST", body: JSON.stringify(entrada) });
}

export function atualizarZona(empresaId: string, zonaId: string, entrada: SalvarZonaEntrada): Promise<RespostaApi<ZonaEntrega>> {
  return requisitarApi(daEmpresa(empresaId, `/zonas/${encodeURIComponent(zonaId)}`), zonaEntregaSchema, { method: "PATCH", body: JSON.stringify(entrada) });
}

// Marcar em A vale para B: o servidor normaliza o par.
export function definirCompatibilidades(empresaId: string, zonaId: string, zonaIds: string[]): Promise<RespostaApi<ListaZonas>> {
  return requisitarApi(daEmpresa(empresaId, `/zonas/${encodeURIComponent(zonaId)}/compatibilidades`), listaZonasSchema, { method: "POST", body: JSON.stringify({ zonaIds }) });
}

export function obterPainelDespacho(empresaId: string): Promise<RespostaApi<PainelDespacho>> {
  return requisitarApi(daEmpresa(empresaId, "/despacho"), painelDespachoSchema, {});
}

export function salvarConfiguracaoDespacho(empresaId: string, entrada: SalvarConfiguracaoDespachoEntrada): Promise<RespostaApi<PainelDespacho>> {
  return requisitarApi(daEmpresa(empresaId, "/despacho"), painelDespachoSchema, { method: "POST", body: JSON.stringify(entrada) });
}
