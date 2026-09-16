import type { Banco } from "@jaa/banco";
import {
  alteracaoInvalidaLocalizacao,
  baseTemPontoConfirmado,
  estadoOperacional,
  type BaseEmpresa,
  type EntregadorOperacional,
  type PainelOperacional,
  type SituacaoOperacional,
  type Uf,
} from "@jaa/contratos";
import { autorizarEmpresa } from "../../empresas/lib/autorizacao-empresas.js";
import { buscarEmpresaPublicaPorId } from "../../catalogo/repositorios/repositorio-empresas-publicas.js";
import { aplicarLeitura, avaliarLeitura, type LeituraLocalizacao } from "../lib/geofence.js";
import {
  aplicarMudancaOperacional,
  buscarBase,
  buscarOperacional,
  confirmarPontoBase,
  listarFila,
  listarOperacionaisDaEmpresa,
  listarOperacionaisDaPessoa,
  salvarBase,
  sincronizarFila,
  type BaseRegistro,
  type DadosBase,
  type EntregadorOperacionalRegistro,
} from "../repositorios/repositorio-fila.js";

/*
 * PRESENÇA NA BASE e FILA AUTOMÁTICA.
 *
 * O entregador manda o que o aparelho mediu; o SERVIDOR decide se ele está na base (ponto confirmado
 * da empresa + raio + estabilização) e, se estiver aceitando entregas e apto, coloca-o na fila
 * automaticamente — sem gestor confirmando chegada. A localização é usada e descartada: fica só o
 * estado derivado ("na base" / "fora da base").
 */

type SemAcesso = { tipo: "empresa-nao-encontrada" };

export function serializarBase(base: BaseRegistro): BaseEmpresa {
  return {
    cep: base.cep,
    logradouro: base.logradouro,
    numero: base.numero,
    complemento: base.complemento,
    bairro: base.bairro,
    cidade: base.cidade,
    uf: base.uf as Uf,
    pontoReferencia: base.pontoReferencia,
    raioMetros: base.raioMetros,
    latitude: base.latitude,
    longitude: base.longitude,
    localizacaoConfirmadaEm: base.localizacaoConfirmadaEm?.toISOString() ?? null,
    atualizadoEm: base.atualizadoEm.toISOString(),
  };
}

export async function obterBaseAutorizada(banco: Banco, usuarioId: string, empresaId: string): Promise<{ tipo: "base"; base: BaseRegistro | null } | SemAcesso> {
  const acesso = await autorizarEmpresa(banco, usuarioId, empresaId, "ver-empresa");
  if (!acesso) return { tipo: "empresa-nao-encontrada" };
  return { tipo: "base", base: await buscarBase(banco, empresaId) };
}

/**
 * Salvar o endereço da base. Como no endereço do cliente, mudar campo ESTRUTURAL invalida o ponto
 * confirmado (pode ser outro lugar) — e o mapa nunca corrige o texto que a empresa digitou.
 */
export async function salvarBaseAutorizada(banco: Banco, usuarioId: string, empresaId: string, dados: DadosBase): Promise<{ tipo: "base"; base: BaseRegistro } | SemAcesso> {
  const acesso = await autorizarEmpresa(banco, usuarioId, empresaId, "editar-empresa");
  if (!acesso) return { tipo: "empresa-nao-encontrada" };

  const atual = await buscarBase(banco, empresaId);
  const manterLocalizacao = atual !== null && !alteracaoInvalidaLocalizacao(atual, dados);
  return { tipo: "base", base: await salvarBase(banco, empresaId, dados, manterLocalizacao) };
}

export async function confirmarPontoBaseAutorizado(
  banco: Banco,
  usuarioId: string,
  empresaId: string,
  coordenadas: { latitude: number; longitude: number },
): Promise<{ tipo: "base"; base: BaseRegistro } | SemAcesso | { tipo: "base-nao-configurada" }> {
  const acesso = await autorizarEmpresa(banco, usuarioId, empresaId, "editar-empresa");
  if (!acesso) return { tipo: "empresa-nao-encontrada" };

  const base = await confirmarPontoBase(banco, empresaId, coordenadas);
  return base ? { tipo: "base", base } : { tipo: "base-nao-configurada" };
}

function serializarOperacional(registro: EntregadorOperacionalRegistro, posicaoFila: number | null): EntregadorOperacional {
  return {
    id: registro.id,
    pessoa: registro.pessoa,
    status: registro.status,
    disponivel: registro.disponivel,
    naBase: registro.naBase,
    aptoParaSaida: registro.aptoParaSaida,
    estado: estadoOperacional(registro),
    posicaoFila,
    filaEntrouEm: registro.filaEntrouEm?.toISOString() ?? null,
  };
}

/**
 * Painel da empresa: fila da base (em ordem de chegada), quem está disponível fora da base e quem
 * não está aceitando. Só estados DERIVADOS — a empresa nunca recebe posição, mapa ou trajeto.
 */
export async function montarPainelOperacional(banco: Banco, empresaId: string): Promise<PainelOperacional> {
  const [registros, base] = await Promise.all([listarOperacionaisDaEmpresa(banco, empresaId), buscarBase(banco, empresaId)]);

  const fila: EntregadorOperacional[] = [];
  const foraDaBase: EntregadorOperacional[] = [];
  const indisponiveis: EntregadorOperacional[] = [];

  for (const registro of registros) {
    if (registro.filaEntrouEm !== null) {
      fila.push(serializarOperacional(registro, fila.length + 1));
      continue;
    }
    const estado = estadoOperacional(registro);
    // Convidados ainda não operam: ficam fora do painel operacional.
    if (registro.status === "convidado") continue;
    if (estado === "disponivel_fora_base" || estado === "inapto") foraDaBase.push(serializarOperacional(registro, null));
    else indisponiveis.push(serializarOperacional(registro, null));
  }

  return { fila, foraDaBase, indisponiveis, baseConfigurada: baseTemPontoConfirmado(base && serializarBase(base)) };
}

export async function obterPainelAutorizado(banco: Banco, usuarioId: string, empresaId: string): Promise<{ tipo: "painel"; painel: PainelOperacional } | SemAcesso> {
  const acesso = await autorizarEmpresa(banco, usuarioId, empresaId, "gerenciar-entregadores");
  if (!acesso) return { tipo: "empresa-nao-encontrada" };
  return { tipo: "painel", painel: await montarPainelOperacional(banco, empresaId) };
}

// Situação do PRÓPRIO entregador numa empresa: a posição dele e o tamanho da fila, nada dos outros.
export async function montarSituacao(banco: Banco, registro: EntregadorOperacionalRegistro): Promise<SituacaoOperacional> {
  const [fila, base, empresa] = await Promise.all([
    listarFila(banco, registro.empresaId),
    buscarBase(banco, registro.empresaId),
    buscarEmpresaPublicaPorId(banco, registro.empresaId),
  ]);
  const posicao = fila.findIndex((item) => item.id === registro.id);

  return {
    entregadorId: registro.id,
    empresa: { identidadeId: empresa?.identidadeId ?? "", nome: empresa?.nome ?? "" },
    status: registro.status,
    disponivel: registro.disponivel,
    naBase: registro.naBase,
    aptoParaSaida: registro.aptoParaSaida,
    estado: estadoOperacional(registro),
    posicaoFila: posicao >= 0 ? posicao + 1 : null,
    totalNaFila: fila.length,
    baseConfigurada: baseTemPontoConfirmado(base && serializarBase(base)),
  };
}

export async function listarMinhasSituacoes(banco: Banco, usuarioId: string): Promise<SituacaoOperacional[]> {
  const registros = await listarOperacionaisDaPessoa(banco, usuarioId);
  return Promise.all(registros.filter((registro) => registro.status !== "convidado").map((registro) => montarSituacao(banco, registro)));
}

export type ResultadoLocalizacao =
  | { tipo: "processada"; registro: EntregadorOperacionalRegistro; presencaMudou: boolean; filaMudou: boolean }
  | { tipo: "vinculo-nao-encontrado" }
  | { tipo: "base-nao-configurada" }
  | { tipo: "leitura-imprecisa" };

/**
 * Recebe a leitura do aparelho do PRÓPRIO entregador (o `usuarioId` no filtro garante que ninguém
 * envia localização por outra pessoa) e recalcula presença → fila.
 * Sem ponto confirmado da empresa não há geofence possível; leitura velha ou imprecisa é descartada.
 */
export async function processarLocalizacao(
  banco: Banco,
  usuarioId: string,
  entregadorId: string,
  leitura: LeituraLocalizacao,
): Promise<ResultadoLocalizacao> {
  const registro = await buscarOperacional(banco, entregadorId);
  if (!registro || registro.usuarioId !== usuarioId || registro.status !== "ativo") return { tipo: "vinculo-nao-encontrado" };

  const base = await buscarBase(banco, registro.empresaId);
  if (!base || base.latitude === null || base.longitude === null || base.localizacaoConfirmadaEm === null) return { tipo: "base-nao-configurada" };

  const avaliacao = avaliarLeitura(leitura, { latitude: base.latitude, longitude: base.longitude, raioMetros: base.raioMetros });
  if (avaliacao.tipo === "imprecisa") return { tipo: "leitura-imprecisa" };

  const estado = aplicarLeitura({ naBase: registro.naBase, leiturasConsecutivas: registro.leiturasConsecutivas }, avaliacao, base.raioMetros);
  const presencaMudou = estado.naBase !== registro.naBase;
  // Presença e fila mudam JUNTAS: entrar/sair da fila é automático, sem ninguém confirmar chegada.
  const mudancaFila = await aplicarMudancaOperacional(
    banco,
    entregadorId,
    { naBase: estado.naBase, leiturasConsecutivas: estado.leiturasConsecutivas, presencaMudou },
    "Saiu da base",
  );
  const atualizado = await buscarOperacional(banco, entregadorId);
  if (!atualizado) return { tipo: "vinculo-nao-encontrado" };
  return { tipo: "processada", registro: atualizado, presencaMudou, filaMudou: mudancaFila !== "sem-mudanca" };
}

/**
 * Reavalia a fila depois de qualquer mudança que afete elegibilidade (disponibilidade, vínculo,
 * aptidão, início de saída). Devolve o vínculo atualizado para quem precisa publicar os eventos.
 */
export async function reavaliarFila(banco: Banco, entregadorId: string, motivo: string): Promise<{ registro: EntregadorOperacionalRegistro; mudou: boolean } | null> {
  const mudanca = await sincronizarFila(banco, entregadorId, motivo);
  const registro = await buscarOperacional(banco, entregadorId);
  return registro ? { registro, mudou: mudanca !== "sem-mudanca" } : null;
}
