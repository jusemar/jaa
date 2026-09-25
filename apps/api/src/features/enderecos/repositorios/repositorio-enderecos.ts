import type { Banco } from "@jaa/banco";
import { enderecosCliente } from "@jaa/banco/schema";
import type { Coordenadas } from "@jaa/contratos";
import { and, asc, count, desc, eq, isNull } from "drizzle-orm";

export type EnderecoRegistro = typeof enderecosCliente.$inferSelect;

export interface DadosEndereco {
  apelido: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string | null;
  bairro: string;
  cidade: string;
  uf: string;
  pontoReferencia: string | null;
}

/*
 * Toda consulta é ESCOPADA pela identidade dona: endereço de outra pessoa simplesmente não existe
 * para quem pergunta (o chamador responde 404, sem revelar a diferença). Arquivados somem da agenda,
 * mas continuam no banco porque pedidos antigos os referenciam.
 */

export function listarEnderecos(
  banco: Banco,
  identidadeId: string,
): Promise<EnderecoRegistro[]> {
  return banco
    .select()
    .from(enderecosCliente)
    .where(
      and(
        eq(enderecosCliente.identidadeId, identidadeId),
        isNull(enderecosCliente.arquivadoEm),
      ),
    )
    .orderBy(desc(enderecosCliente.id));
}

export async function buscarEndereco(
  banco: Banco,
  identidadeId: string,
  enderecoId: string,
): Promise<EnderecoRegistro | null> {
  const [endereco] = await banco
    .select()
    .from(enderecosCliente)
    .where(
      and(
        eq(enderecosCliente.id, enderecoId),
        eq(enderecosCliente.identidadeId, identidadeId),
        isNull(enderecosCliente.arquivadoEm),
      ),
    )
    .limit(1);
  return endereco ?? null;
}

export async function contarEnderecos(
  banco: Banco,
  identidadeId: string,
): Promise<number> {
  const [linha] = await banco
    .select({ total: count() })
    .from(enderecosCliente)
    .where(
      and(
        eq(enderecosCliente.identidadeId, identidadeId),
        isNull(enderecosCliente.arquivadoEm),
      ),
    );
  return linha?.total ?? 0;
}

export async function inserirEndereco(
  banco: Banco,
  identidadeId: string,
  dados: DadosEndereco,
): Promise<EnderecoRegistro> {
  // Endereço novo nasce SEM ponto confirmado: a coordenada só existe depois do mapa.
  const [endereco] = await banco
    .insert(enderecosCliente)
    .values({ ...dados, identidadeId })
    .returning();
  if (!endereco) throw new Error("Inserção de endereço não retornou registro.");
  return endereco;
}

export async function inserirEnderecoComLocalizacao(
  banco: Banco,
  identidadeId: string,
  dados: DadosEndereco,
  coordenadas: Coordenadas,
): Promise<EnderecoRegistro> {
  const [endereco] = await banco
    .insert(enderecosCliente)
    .values({
      ...dados,
      ...coordenadas,
      identidadeId,
      localizacaoConfirmadaEm: new Date(),
    })
    .returning();
  if (!endereco) throw new Error("Inserção de endereço não retornou registro.");
  return endereco;
}

/**
 * Atualiza o texto do endereço. `manterLocalizacao` vem da regra central de invalidação: se algum
 * campo estrutural mudou, as coordenadas antigas deixam de valer (e o cliente confirma de novo).
 */
export async function atualizarEndereco(
  banco: Banco,
  identidadeId: string,
  enderecoId: string,
  dados: DadosEndereco,
  manterLocalizacao: boolean,
): Promise<EnderecoRegistro | null> {
  const [endereco] = await banco
    .update(enderecosCliente)
    .set({
      ...dados,
      ...(manterLocalizacao
        ? {}
        : { latitude: null, longitude: null, localizacaoConfirmadaEm: null }),
    })
    .where(
      and(
        eq(enderecosCliente.id, enderecoId),
        eq(enderecosCliente.identidadeId, identidadeId),
        isNull(enderecosCliente.arquivadoEm),
      ),
    )
    .returning();
  return endereco ?? null;
}

export async function atualizarEnderecoComLocalizacao(
  banco: Banco,
  identidadeId: string,
  enderecoId: string,
  dados: DadosEndereco,
  coordenadas: Coordenadas,
): Promise<EnderecoRegistro | null> {
  const [endereco] = await banco
    .update(enderecosCliente)
    .set({ ...dados, ...coordenadas, localizacaoConfirmadaEm: new Date() })
    .where(
      and(
        eq(enderecosCliente.id, enderecoId),
        eq(enderecosCliente.identidadeId, identidadeId),
        isNull(enderecosCliente.arquivadoEm),
      ),
    )
    .returning();
  return endereco ?? null;
}

// Confirmação/ajuste do ponto: sempre ação explícita do cliente; substitui as coordenadas anteriores.
export async function confirmarLocalizacao(
  banco: Banco,
  identidadeId: string,
  enderecoId: string,
  coordenadas: Coordenadas,
): Promise<EnderecoRegistro | null> {
  const [endereco] = await banco
    .update(enderecosCliente)
    .set({ ...coordenadas, localizacaoConfirmadaEm: new Date() })
    .where(
      and(
        eq(enderecosCliente.id, enderecoId),
        eq(enderecosCliente.identidadeId, identidadeId),
        isNull(enderecosCliente.arquivadoEm),
      ),
    )
    .returning();
  return endereco ?? null;
}

export async function arquivarEndereco(
  banco: Banco,
  identidadeId: string,
  enderecoId: string,
): Promise<boolean> {
  const arquivados = await banco
    .update(enderecosCliente)
    .set({ arquivadoEm: new Date() })
    .where(
      and(
        eq(enderecosCliente.id, enderecoId),
        eq(enderecosCliente.identidadeId, identidadeId),
        isNull(enderecosCliente.arquivadoEm),
      ),
    )
    .returning({ id: enderecosCliente.id });
  return arquivados.length > 0;
}

export const ordemDeterministica = asc(enderecosCliente.id);
