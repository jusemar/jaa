import type { Banco } from "@jaa/banco";
import { compatibilidadesZona, configuracoesDespacho, zonasEntrega } from "@jaa/banco/schema";
import { CONFIGURACAO_DESPACHO_PADRAO, poligonoZonaSchema, type ConfiguracaoDespacho, type PoligonoZona } from "@jaa/contratos";
import { and, asc, eq, inArray, or } from "drizzle-orm";

/*
 * ZONAS e CONFIGURAÇÃO DE DESPACHO. Tudo escopado por empresa: nenhuma consulta daqui aceita um id de
 * zona sem a empresa junto — uma empresa jamais lê, edita ou combina a zona de outra.
 */

export interface ZonaRegistro {
  id: string;
  empresaId: string;
  nome: string;
  vertices: PoligonoZona;
  ativa: boolean;
  criadoEm: Date;
  atualizadoEm: Date;
}

// O polígono chega do banco como jsonb: validamos na leitura em vez de confiar no que está gravado.
function comVertices(linha: typeof zonasEntrega.$inferSelect): ZonaRegistro {
  return { ...linha, vertices: poligonoZonaSchema.parse(linha.vertices) };
}

export async function listarZonas(banco: Banco, empresaId: string): Promise<ZonaRegistro[]> {
  const linhas = await banco.select().from(zonasEntrega).where(eq(zonasEntrega.empresaId, empresaId)).orderBy(asc(zonasEntrega.nome), asc(zonasEntrega.id));
  return linhas.map(comVertices);
}

export async function listarZonasAtivas(banco: Banco, empresaId: string): Promise<ZonaRegistro[]> {
  return (await listarZonas(banco, empresaId)).filter((zona) => zona.ativa);
}

export async function buscarZona(banco: Banco, empresaId: string, zonaId: string): Promise<ZonaRegistro | null> {
  const [zona] = await banco
    .select()
    .from(zonasEntrega)
    .where(and(eq(zonasEntrega.id, zonaId), eq(zonasEntrega.empresaId, empresaId)))
    .limit(1);
  return zona ? comVertices(zona) : null;
}

export async function inserirZona(banco: Banco, empresaId: string, dados: { nome: string; vertices: PoligonoZona; ativa: boolean }): Promise<ZonaRegistro> {
  const [zona] = await banco
    .insert(zonasEntrega)
    .values({ empresaId, nome: dados.nome, vertices: dados.vertices, ativa: dados.ativa })
    .returning();
  if (!zona) throw new Error("Inserção de zona não retornou registro.");
  return comVertices(zona);
}

export async function atualizarZona(
  banco: Banco,
  empresaId: string,
  zonaId: string,
  dados: { nome: string; vertices: PoligonoZona; ativa: boolean },
): Promise<ZonaRegistro | null> {
  const [zona] = await banco
    .update(zonasEntrega)
    .set({ nome: dados.nome, vertices: dados.vertices, ativa: dados.ativa })
    .where(and(eq(zonasEntrega.id, zonaId), eq(zonasEntrega.empresaId, empresaId)))
    .returning();
  return zona ? comVertices(zona) : null;
}

export function ehNomeDeZonaDuplicado(erro: unknown): boolean {
  for (const candidato of [erro, erro instanceof Error ? erro.cause : undefined]) {
    if (
      typeof candidato === "object" &&
      candidato !== null &&
      "code" in candidato &&
      candidato.code === "23505" &&
      "constraint" in candidato &&
      candidato.constraint === "zonas_entrega_nome_por_empresa_unico"
    ) {
      return true;
    }
  }
  return false;
}

/* COMPATIBILIDADE: par normalizado (menor id primeiro) para valer nos dois sentidos numa linha só. */

const parNormalizado = (a: string, b: string) => (a < b ? { zonaMenorId: a, zonaMaiorId: b } : { zonaMenorId: b, zonaMaiorId: a });

export async function listarCompatibilidades(banco: Banco, empresaId: string): Promise<Array<{ zonaMenorId: string; zonaMaiorId: string }>> {
  return banco
    .select({ zonaMenorId: compatibilidadesZona.zonaMenorId, zonaMaiorId: compatibilidadesZona.zonaMaiorId })
    .from(compatibilidadesZona)
    .where(eq(compatibilidadesZona.empresaId, empresaId));
}

// "Com quais zonas esta pode ser combinada?" — a resposta é simétrica por construção.
export async function listarCompativeisDaZona(banco: Banco, empresaId: string, zonaId: string): Promise<string[]> {
  const pares = await banco
    .select({ zonaMenorId: compatibilidadesZona.zonaMenorId, zonaMaiorId: compatibilidadesZona.zonaMaiorId })
    .from(compatibilidadesZona)
    .where(and(eq(compatibilidadesZona.empresaId, empresaId), or(eq(compatibilidadesZona.zonaMenorId, zonaId), eq(compatibilidadesZona.zonaMaiorId, zonaId))));
  return pares.map((par) => (par.zonaMenorId === zonaId ? par.zonaMaiorId : par.zonaMenorId));
}

/**
 * Substitui a lista de compatíveis de UMA zona numa transação: o gestor marca as caixas e o servidor
 * normaliza os pares. Compatibilidade com outra empresa é impossível (FK composta com a empresa).
 */
export async function definirCompatibilidades(banco: Banco, empresaId: string, zonaId: string, zonaIds: string[]): Promise<void> {
  const destinos = [...new Set(zonaIds)].filter((id) => id !== zonaId);
  await banco.transaction(async (transacao) => {
    await transacao
      .delete(compatibilidadesZona)
      .where(and(eq(compatibilidadesZona.empresaId, empresaId), or(eq(compatibilidadesZona.zonaMenorId, zonaId), eq(compatibilidadesZona.zonaMaiorId, zonaId))));
    if (destinos.length === 0) return;
    await transacao.insert(compatibilidadesZona).values(destinos.map((destino) => ({ empresaId, ...parNormalizado(zonaId, destino) })));
  });
}

// Quantas das zonas informadas são realmente DESTA empresa (nada de combinar com zona de outra).
export async function contarZonasDaEmpresa(banco: Banco, empresaId: string, zonaIds: string[]): Promise<number> {
  if (zonaIds.length === 0) return 0;
  const linhas = await banco
    .select({ id: zonasEntrega.id })
    .from(zonasEntrega)
    .where(and(eq(zonasEntrega.empresaId, empresaId), inArray(zonasEntrega.id, [...new Set(zonaIds)])));
  return linhas.length;
}

/* CONFIGURAÇÃO DE DESPACHO: sem linha gravada, valem os padrões do contrato. */

export async function buscarConfiguracaoDespacho(banco: Banco, empresaId: string): Promise<ConfiguracaoDespacho> {
  const [linha] = await banco.select().from(configuracoesDespacho).where(eq(configuracoesDespacho.empresaId, empresaId)).limit(1);
  if (!linha) return CONFIGURACAO_DESPACHO_PADRAO;
  return {
    maxPedidosPorSaida: linha.maxPedidosPorSaida,
    tempoFormacaoMinutos: linha.tempoFormacaoMinutos,
    combinarZonas: linha.combinarZonas,
    liberacaoAutomatica: linha.liberacaoAutomatica,
  };
}

export async function salvarConfiguracaoDespacho(banco: Banco, empresaId: string, configuracao: ConfiguracaoDespacho): Promise<ConfiguracaoDespacho> {
  const [linha] = await banco
    .insert(configuracoesDespacho)
    .values({ empresaId, ...configuracao })
    .onConflictDoUpdate({ target: configuracoesDespacho.empresaId, set: configuracao })
    .returning();
  if (!linha) throw new Error("Gravação da configuração de despacho não retornou registro.");
  return {
    maxPedidosPorSaida: linha.maxPedidosPorSaida,
    tempoFormacaoMinutos: linha.tempoFormacaoMinutos,
    combinarZonas: linha.combinarZonas,
    liberacaoAutomatica: linha.liberacaoAutomatica,
  };
}
