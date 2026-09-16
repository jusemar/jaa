import type { Banco } from "@jaa/banco";
import { atribuicoesEntrega, entregadoresEmpresa, identidades } from "@jaa/banco/schema";
import type { StatusEntregador } from "@jaa/contratos";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";

export type EntregadorRegistro = typeof entregadoresEmpresa.$inferSelect;

export interface EntregadorComPessoaRegistro {
  id: string;
  usuarioId: string;
  empresaId: string;
  status: StatusEntregador;
  // Disponibilidade operacional NESTA empresa (decisão do próprio entregador).
  disponivel: boolean;
  convidadoEm: Date;
  respondidoEm: Date | null;
  // Identidade PÚBLICA da pessoa (nome e @usuario). Nunca telefone, e-mail ou conta.
  pessoa: { identidadeId: string; tipo: "pessoal" | "empresarial"; nomeExibicao: string; nomeUsuario: string };
}

const colunasEntregadorComPessoa = {
  id: entregadoresEmpresa.id,
  usuarioId: entregadoresEmpresa.usuarioId,
  empresaId: entregadoresEmpresa.empresaId,
  status: entregadoresEmpresa.status,
  disponivel: entregadoresEmpresa.disponivel,
  convidadoEm: entregadoresEmpresa.convidadoEm,
  respondidoEm: entregadoresEmpresa.respondidoEm,
  pessoa: {
    identidadeId: identidades.id,
    tipo: identidades.tipo,
    nomeExibicao: identidades.nomeExibicao,
    nomeUsuario: identidades.nomeUsuario,
  },
};

export function listarEntregadoresDaEmpresa(banco: Banco, empresaId: string): Promise<EntregadorComPessoaRegistro[]> {
  return banco
    .select(colunasEntregadorComPessoa)
    .from(entregadoresEmpresa)
    .innerJoin(identidades, and(eq(identidades.usuarioId, entregadoresEmpresa.usuarioId), eq(identidades.tipo, "pessoal")))
    .where(eq(entregadoresEmpresa.empresaId, empresaId))
    .orderBy(asc(identidades.nomeExibicao));
}

export async function buscarEntregadorDaEmpresa(banco: Banco, empresaId: string, entregadorId: string): Promise<EntregadorComPessoaRegistro | null> {
  const [entregador] = await banco
    .select(colunasEntregadorComPessoa)
    .from(entregadoresEmpresa)
    .innerJoin(identidades, and(eq(identidades.usuarioId, entregadoresEmpresa.usuarioId), eq(identidades.tipo, "pessoal")))
    .where(and(eq(entregadoresEmpresa.id, entregadorId), eq(entregadoresEmpresa.empresaId, empresaId)))
    .limit(1);
  return entregador ?? null;
}

export async function buscarVinculoEntregador(banco: Banco, empresaId: string, usuarioId: string): Promise<EntregadorRegistro | null> {
  const [vinculo] = await banco
    .select()
    .from(entregadoresEmpresa)
    .where(and(eq(entregadoresEmpresa.empresaId, empresaId), eq(entregadoresEmpresa.usuarioId, usuarioId)))
    .limit(1);
  return vinculo ?? null;
}

/**
 * Convidar é idempotente por pessoa: reconvidar quem já foi inativado (ou recusou) reabre o MESMO
 * vínculo como "convidado", em vez de criar uma segunda linha — o histórico de atribuições dele
 * continua apontando para o mesmo registro.
 */
export async function convidarEntregador(banco: Banco, dados: { empresaId: string; usuarioId: string; convidadoPorUsuarioId: string }): Promise<EntregadorRegistro> {
  const [vinculo] = await banco
    .insert(entregadoresEmpresa)
    .values({ ...dados, status: "convidado" })
    .onConflictDoUpdate({
      target: [entregadoresEmpresa.empresaId, entregadoresEmpresa.usuarioId],
      set: { status: "convidado", disponivel: false, convidadoPorUsuarioId: dados.convidadoPorUsuarioId, convidadoEm: new Date(), respondidoEm: null },
      // Já ativo: o convite não mexe em nada (evita derrubar quem está entregando agora).
      setWhere: sql`${entregadoresEmpresa.status} <> 'ativo'`,
    })
    .returning();
  if (vinculo) return vinculo;

  const existente = await buscarVinculoEntregador(banco, dados.empresaId, dados.usuarioId);
  if (!existente) throw new Error("Convite de entregador não retornou registro.");
  return existente;
}

export async function alterarStatusEntregador(
  banco: Banco,
  { empresaId, entregadorId, status }: { empresaId: string; entregadorId: string; status: StatusEntregador },
): Promise<EntregadorRegistro | null> {
  const [vinculo] = await banco
    .update(entregadoresEmpresa)
    .set({ status, disponivel: status === "ativo" ? undefined : false, respondidoEm: status === "convidado" ? null : new Date() })
    .where(and(eq(entregadoresEmpresa.id, entregadorId), eq(entregadoresEmpresa.empresaId, empresaId)))
    .returning();
  return vinculo ?? null;
}

// Resposta da PESSOA ao convite: só ela pode aceitar/recusar (o vínculo é dela com a empresa).
export async function responderConvite(banco: Banco, { entregadorId, usuarioId, aceitar }: { entregadorId: string; usuarioId: string; aceitar: boolean }): Promise<EntregadorRegistro | null> {
  const [vinculo] = await banco
    .update(entregadoresEmpresa)
    .set({ status: aceitar ? "ativo" : "inativo", disponivel: false, respondidoEm: new Date() })
    .where(and(eq(entregadoresEmpresa.id, entregadorId), eq(entregadoresEmpresa.usuarioId, usuarioId), eq(entregadoresEmpresa.status, "convidado")))
    .returning();
  return vinculo ?? null;
}

// Convites pendentes da pessoa (a decisão de virar entregador é dela).
export function listarConvitesDaPessoa(banco: Banco, usuarioId: string) {
  return banco
    .select({ id: entregadoresEmpresa.id, empresaId: entregadoresEmpresa.empresaId, status: entregadoresEmpresa.status, convidadoEm: entregadoresEmpresa.convidadoEm })
    .from(entregadoresEmpresa)
    .where(and(eq(entregadoresEmpresa.usuarioId, usuarioId), eq(entregadoresEmpresa.status, "convidado")))
    .orderBy(desc(entregadoresEmpresa.id));
}

/**
 * DISPONIBILIDADE: só o PRÓPRIO entregador muda a sua, e só com vínculo ATIVO (o `usuarioId` no
 * WHERE garante que ninguém altera a de outra pessoa; a empresa não tem rota para isto).
 */
export async function alterarDisponibilidade(
  banco: Banco,
  { entregadorId, usuarioId, disponivel }: { entregadorId: string; usuarioId: string; disponivel: boolean },
): Promise<EntregadorRegistro | null> {
  const [vinculo] = await banco
    .update(entregadoresEmpresa)
    .set({ disponivel, disponibilidadeAtualizadaEm: new Date() })
    .where(and(eq(entregadoresEmpresa.id, entregadorId), eq(entregadoresEmpresa.usuarioId, usuarioId), eq(entregadoresEmpresa.status, "ativo")))
    .returning();
  return vinculo ?? null;
}

// "Empresas em que trabalho": todos os vínculos da pessoa (inclusive convites e inativos).
export function listarVinculosDaPessoa(banco: Banco, usuarioId: string) {
  return banco
    .select({
      id: entregadoresEmpresa.id,
      empresaId: entregadoresEmpresa.empresaId,
      status: entregadoresEmpresa.status,
      disponivel: entregadoresEmpresa.disponivel,
      disponibilidadeAtualizadaEm: entregadoresEmpresa.disponibilidadeAtualizadaEm,
    })
    .from(entregadoresEmpresa)
    .where(eq(entregadoresEmpresa.usuarioId, usuarioId))
    .orderBy(desc(entregadoresEmpresa.id));
}

// Vínculos ATIVOS da conta: base da área "Minhas entregas" (uma pessoa entrega para várias empresas).
export function listarVinculosAtivosDaPessoa(banco: Banco, usuarioId: string) {
  return banco
    .select({ id: entregadoresEmpresa.id, empresaId: entregadoresEmpresa.empresaId })
    .from(entregadoresEmpresa)
    .where(and(eq(entregadoresEmpresa.usuarioId, usuarioId), eq(entregadoresEmpresa.status, "ativo")));
}

// Atribuições atuais que serão encerradas quando um vínculo deixa de valer (revogação imediata).
export function listarPedidosAtribuidosAoEntregador(banco: Banco, entregadorId: string) {
  return banco
    .select({ pedidoId: atribuicoesEntrega.pedidoId })
    .from(atribuicoesEntrega)
    .where(and(eq(atribuicoesEntrega.entregadorId, entregadorId), isNull(atribuicoesEntrega.encerradoEm)));
}
