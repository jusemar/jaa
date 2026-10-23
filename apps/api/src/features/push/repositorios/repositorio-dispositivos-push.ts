import type { Banco } from "@jaa/banco";
import { dispositivosPush, identidades, membrosEmpresa, sessions } from "@jaa/banco/schema";
import type { RegistrarDispositivoPushEntrada } from "@jaa/contratos";
import { and, eq, exists, gt, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { papeisComPermissao } from "../../empresas/lib/autorizacao-empresas.js";

/**
 * Registra (ou atualiza) a instalação para a conta da SESSÃO. Uma linha por instalação:
 * - mesma instalação, outra conta (troca de conta no aparelho) → a linha passa para a conta nova;
 * - token novo (o sistema renovou) → atualiza;
 * - o mesmo token em outra instalação (reinstalação que reaproveitou o token) → a antiga sai.
 * Registrar de novo também "revive" um token marcado como inválido: o aparelho acabou de provar que ele vale.
 */
export async function registrarDispositivoPush(
  banco: Banco,
  { usuarioId, sessaoId, instalacaoId, token, plataforma }: RegistrarDispositivoPushEntrada & { usuarioId: string; sessaoId: string },
): Promise<void> {
  await banco.transaction(async (transacao) => {
    await transacao.delete(dispositivosPush).where(and(eq(dispositivosPush.token, token), ne(dispositivosPush.instalacaoId, instalacaoId)));
    await transacao
      .insert(dispositivosPush)
      .values({ instalacaoId, usuarioId, sessaoId, token, plataforma })
      .onConflictDoUpdate({
        target: dispositivosPush.instalacaoId,
        set: { usuarioId, sessaoId, token, plataforma, atualizadoEm: sql`now()`, invalidadoEm: null },
      });
  });
}

// Logout: tira a instalação da conta. Só apaga se for DESTA conta (outra conta não desliga o aparelho alheio).
export async function removerDispositivoPush(banco: Banco, usuarioId: string, instalacaoId: string): Promise<void> {
  await banco.delete(dispositivosPush).where(and(eq(dispositivosPush.instalacaoId, instalacaoId), eq(dispositivosPush.usuarioId, usuarioId)));
}

// O provedor disse que o token não existe mais (ex.: app desinstalado): para de enviar a ele.
export async function invalidarTokensPush(banco: Banco, tokens: readonly string[]): Promise<void> {
  if (tokens.length === 0) return;
  await banco
    .update(dispositivosPush)
    .set({ invalidadoEm: sql`now()` })
    .where(and(inArray(dispositivosPush.token, [...tokens]), isNull(dispositivosPush.invalidadoEm)));
}

export interface AlvoPush {
  dispositivoId: string;
  token: string;
  usuarioId: string;
  // Identidade destinatária pela qual o dispositivo foi alcançado.
  identidadeId: string;
}

/**
 * QUEM RECEBE: identidade destinatária → contas que podem OPERÁ-LA → dispositivos válidos dessas contas.
 * - pessoal: a conta dona;
 * - empresarial: membros com papel que permite `operar-identidade-empresarial` — a mesma regra de quem
 *   pode agir como ela;
 * - só dispositivos não invalidados e cuja sessão ainda vale (logout apaga; vencida não conta).
 * Não depende de qual identidade está selecionada no aparelho. Uma consulta só por fato.
 */
export async function buscarAlvosPush(banco: Banco, identidadeIds: readonly string[]): Promise<AlvoPush[]> {
  if (identidadeIds.length === 0) return [];
  const papeis = papeisComPermissao("operar-identidade-empresarial");
  const operaEmpresa = exists(
    banco
      .select({ um: sql`1` })
      .from(membrosEmpresa)
      .where(and(eq(membrosEmpresa.empresaId, identidades.empresaId), eq(membrosEmpresa.usuarioId, dispositivosPush.usuarioId), inArray(membrosEmpresa.papel, papeis))),
  );
  return banco
    .select({
      dispositivoId: dispositivosPush.id,
      token: dispositivosPush.token,
      usuarioId: dispositivosPush.usuarioId,
      identidadeId: identidades.id,
    })
    .from(identidades)
    .innerJoin(
      dispositivosPush,
      or(and(eq(identidades.tipo, "pessoal"), eq(dispositivosPush.usuarioId, identidades.usuarioId)), and(eq(identidades.tipo, "empresarial"), operaEmpresa)),
    )
    .innerJoin(sessions, and(eq(sessions.id, dispositivosPush.sessaoId), gt(sessions.expiresAt, sql`now()`)))
    .where(and(inArray(identidades.id, [...identidadeIds]), isNull(dispositivosPush.invalidadoEm)));
}
