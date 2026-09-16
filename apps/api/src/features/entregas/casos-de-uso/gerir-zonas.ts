import type { Banco } from "@jaa/banco";
import {
  classificarPonto,
  zonaTemGeometriaValida,
  zonasSobrepoem,
  type ConfiguracaoDespacho,
  type PoligonoZona,
  type ZonaEntrega,
} from "@jaa/contratos";
import { autorizarEmpresa } from "../../empresas/lib/autorizacao-empresas.js";
import {
  atualizarZona,
  buscarConfiguracaoDespacho,
  buscarZona,
  contarZonasDaEmpresa,
  definirCompatibilidades,
  ehNomeDeZonaDuplicado,
  inserirZona,
  listarCompatibilidades,
  listarZonas,
  listarZonasAtivas,
  salvarConfiguracaoDespacho,
  type ZonaRegistro,
} from "../repositorios/repositorio-zonas.js";

/*
 * ZONAS DE ENTREGA: polígonos desenhados pela empresa. O servidor é a autoridade — valida geometria,
 * recusa sobreposição entre zonas ATIVAS (um ponto pertence a uma zona só) e nunca aceita zona de
 * outra empresa. O cliente não participa disso em momento algum.
 */

type SemAcesso = { tipo: "empresa-nao-encontrada" };

export type ResultadoSalvarZona =
  | { tipo: "salva"; zona: ZonaRegistro }
  | SemAcesso
  | { tipo: "zona-nao-encontrada" }
  | { tipo: "geometria-invalida" }
  | { tipo: "nome-duplicado" }
  | { tipo: "sobreposta"; zonaConflitante: { id: string; nome: string } };

export async function serializarZona(banco: Banco, zona: ZonaRegistro, compatibilidades: Array<{ zonaMenorId: string; zonaMaiorId: string }>): Promise<ZonaEntrega> {
  return {
    id: zona.id,
    nome: zona.nome,
    vertices: zona.vertices,
    ativa: zona.ativa,
    compativeisCom: compatibilidades
      .filter((par) => par.zonaMenorId === zona.id || par.zonaMaiorId === zona.id)
      .map((par) => (par.zonaMenorId === zona.id ? par.zonaMaiorId : par.zonaMenorId)),
    criadoEm: zona.criadoEm.toISOString(),
    atualizadoEm: zona.atualizadoEm.toISOString(),
  };
}

export async function listarZonasSerializadas(banco: Banco, empresaId: string): Promise<ZonaEntrega[]> {
  const [zonas, compatibilidades] = await Promise.all([listarZonas(banco, empresaId), listarCompatibilidades(banco, empresaId)]);
  return Promise.all(zonas.map((zona) => serializarZona(banco, zona, compatibilidades)));
}

export async function listarZonasAutorizado(banco: Banco, usuarioId: string, empresaId: string): Promise<{ tipo: "lista"; zonas: ZonaEntrega[] } | SemAcesso> {
  const acesso = await autorizarEmpresa(banco, usuarioId, empresaId, "ver-logistica");
  if (!acesso) return { tipo: "empresa-nao-encontrada" };
  return { tipo: "lista", zonas: await listarZonasSerializadas(banco, empresaId) };
}

/**
 * Criar/editar zona. A sobreposição entre zonas ATIVAS é bloqueada porque tornaria a classificação do
 * pedido ambígua ("de quem é este ponto?"); zonas que só dividem a divisa continuam permitidas.
 */
async function validarEGravar(
  banco: Banco,
  empresaId: string,
  dados: { nome: string; vertices: PoligonoZona; ativa: boolean },
  zonaId: string | null,
): Promise<ResultadoSalvarZona> {
  if (!zonaTemGeometriaValida(dados.vertices)) return { tipo: "geometria-invalida" };

  if (dados.ativa) {
    const outras = (await listarZonasAtivas(banco, empresaId)).filter((zona) => zona.id !== zonaId);
    const conflito = outras.find((zona) => zonasSobrepoem(zona.vertices, dados.vertices));
    if (conflito) return { tipo: "sobreposta", zonaConflitante: { id: conflito.id, nome: conflito.nome } };
  }

  try {
    const zona = zonaId ? await atualizarZona(banco, empresaId, zonaId, dados) : await inserirZona(banco, empresaId, dados);
    return zona ? { tipo: "salva", zona } : { tipo: "zona-nao-encontrada" };
  } catch (erro) {
    if (ehNomeDeZonaDuplicado(erro)) return { tipo: "nome-duplicado" };
    throw erro;
  }
}

export async function criarZonaAutorizada(
  banco: Banco,
  usuarioId: string,
  empresaId: string,
  dados: { nome: string; vertices: PoligonoZona; ativa: boolean },
): Promise<ResultadoSalvarZona> {
  const acesso = await autorizarEmpresa(banco, usuarioId, empresaId, "gerenciar-logistica");
  if (!acesso) return { tipo: "empresa-nao-encontrada" };
  return validarEGravar(banco, empresaId, dados, null);
}

export async function atualizarZonaAutorizada(
  banco: Banco,
  usuarioId: string,
  empresaId: string,
  zonaId: string,
  dados: { nome: string; vertices: PoligonoZona; ativa: boolean },
): Promise<ResultadoSalvarZona> {
  const acesso = await autorizarEmpresa(banco, usuarioId, empresaId, "gerenciar-logistica");
  if (!acesso) return { tipo: "empresa-nao-encontrada" };
  if (!(await buscarZona(banco, empresaId, zonaId))) return { tipo: "zona-nao-encontrada" };
  return validarEGravar(banco, empresaId, dados, zonaId);
}

/**
 * Compatibilidade entre zonas: decisão EXPLÍCITA do gestor ("pode juntar pedidos destas duas quando
 * houver pouco volume"), normalizada pelo servidor para valer nos dois sentidos. Não é inferência de
 * rota: sem motor rodoviário, o Jaa não afirma que duas zonas ficam no caminho uma da outra.
 */
export async function definirCompatibilidadesAutorizado(
  banco: Banco,
  usuarioId: string,
  empresaId: string,
  zonaId: string,
  zonaIds: string[],
): Promise<{ tipo: "definida"; zonas: ZonaEntrega[] } | SemAcesso | { tipo: "zona-nao-encontrada" }> {
  const acesso = await autorizarEmpresa(banco, usuarioId, empresaId, "gerenciar-logistica");
  if (!acesso) return { tipo: "empresa-nao-encontrada" };
  if (!(await buscarZona(banco, empresaId, zonaId))) return { tipo: "zona-nao-encontrada" };
  // Zona de outra empresa (ou inexistente) nunca entra no par.
  const informadas = [...new Set(zonaIds)].filter((id) => id !== zonaId);
  if ((await contarZonasDaEmpresa(banco, empresaId, informadas)) !== informadas.length) return { tipo: "zona-nao-encontrada" };

  await definirCompatibilidades(banco, empresaId, zonaId, informadas);
  return { tipo: "definida", zonas: await listarZonasSerializadas(banco, empresaId) };
}

export async function obterConfiguracaoAutorizada(banco: Banco, usuarioId: string, empresaId: string): Promise<{ tipo: "configuracao"; configuracao: ConfiguracaoDespacho } | SemAcesso> {
  const acesso = await autorizarEmpresa(banco, usuarioId, empresaId, "ver-logistica");
  if (!acesso) return { tipo: "empresa-nao-encontrada" };
  return { tipo: "configuracao", configuracao: await buscarConfiguracaoDespacho(banco, empresaId) };
}

export async function salvarConfiguracaoAutorizada(
  banco: Banco,
  usuarioId: string,
  empresaId: string,
  entrada: Partial<ConfiguracaoDespacho>,
): Promise<{ tipo: "configuracao"; configuracao: ConfiguracaoDespacho } | SemAcesso> {
  const acesso = await autorizarEmpresa(banco, usuarioId, empresaId, "gerenciar-logistica");
  if (!acesso) return { tipo: "empresa-nao-encontrada" };
  const atual = await buscarConfiguracaoDespacho(banco, empresaId);
  return { tipo: "configuracao", configuracao: await salvarConfiguracaoDespacho(banco, empresaId, { ...atual, ...entrada }) };
}

/**
 * Zona de um PONTO. Sempre do snapshot do pedido (o que o cliente confirmou naquele pedido): mudar o
 * endereço salvo depois não reclassifica pedido nenhum. `null` = fora das zonas configuradas.
 */
export async function zonaDoPonto(banco: Banco, empresaId: string, ponto: { latitude: number; longitude: number }): Promise<string | null> {
  return classificarPonto(await listarZonasAtivas(banco, empresaId), ponto);
}
