import type { Banco } from "@jaa/banco";
import { mensagens } from "@jaa/banco/schema";
import { and, desc, eq, lt } from "drizzle-orm";

export type MensagemRegistro = typeof mensagens.$inferSelect;

/**
 * Insere a mensagem ou, se este remetente já enviou esta mesma tentativa (idCliente),
 * não insere nada e retorna null. Uma única instrução: atômica mesmo com retries simultâneos.
 */
export async function inserirMensagemTexto(
  banco: Banco,
  dados: { conversaId: string; remetenteIdentidadeId: string; idCliente: string; conteudo: string },
): Promise<MensagemRegistro | null> {
  const [mensagem] = await banco
    .insert(mensagens)
    .values({ ...dados, tipo: "texto" })
    .onConflictDoNothing({ target: [mensagens.remetenteIdentidadeId, mensagens.idCliente] })
    .returning();

  return mensagem ?? null;
}

export async function buscarMensagemPorIdCliente(
  banco: Banco,
  remetenteIdentidadeId: string,
  idCliente: string,
): Promise<MensagemRegistro | null> {
  const [mensagem] = await banco
    .select()
    .from(mensagens)
    .where(and(eq(mensagens.remetenteIdentidadeId, remetenteIdentidadeId), eq(mensagens.idCliente, idCliente)))
    .limit(1);

  return mensagem ?? null;
}

/**
 * Página de histórico da mais recente para a mais antiga, ordenada por id (UUIDv7).
 * Busca `limite + 1` para saber se há mais sem uma segunda consulta.
 */
export async function listarMensagensDaConversa(
  banco: Banco,
  conversaId: string,
  { antesDe, limite }: { antesDe?: string | undefined; limite: number },
): Promise<{ mensagens: MensagemRegistro[]; haMais: boolean }> {
  const linhas = await banco
    .select()
    .from(mensagens)
    .where(and(eq(mensagens.conversaId, conversaId), antesDe ? lt(mensagens.id, antesDe) : undefined))
    .orderBy(desc(mensagens.id))
    .limit(limite + 1);

  return { mensagens: linhas.slice(0, limite), haMais: linhas.length > limite };
}
