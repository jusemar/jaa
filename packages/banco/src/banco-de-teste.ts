/*
 * Regra ÚNICA de "este é um banco de teste descartável?", usada pelo executor
 * (scripts/com-banco-teste.ts) e pelos guardas dos testes de banco da API e deste pacote.
 *
 * Banco de teste = PostgreSQL LOCAL + nome `jaa_teste_*` + JAA_BANCO_TESTE=1 (definido pelo executor).
 * Qualquer outro alvo — o banco normal de desenvolvimento (`jaa`), produção, host remoto (Neon) — é
 * recusado ANTES de o teste conectar.
 */

export const PREFIXO_BANCO_TESTE = "jaa_teste_";

const HOSTS_LOCAIS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export function ehHostLocal(urlBanco: string): boolean {
  try {
    return HOSTS_LOCAIS.has(new URL(urlBanco).hostname);
  } catch {
    return false;
  }
}

export function ehBancoDeTeste(urlBanco: string | undefined): boolean {
  if (!urlBanco || !ehHostLocal(urlBanco)) return false;
  return new URL(urlBanco).pathname.startsWith(`/${PREFIXO_BANCO_TESTE}`);
}

/** Devolve a URL do banco de teste, ou lança antes de qualquer conexão. */
export function exigirBancoDeTeste(): string {
  const urlBanco = process.env.DATABASE_URL;
  if (process.env.JAA_BANCO_TESTE !== "1" || !urlBanco || !ehBancoDeTeste(urlBanco)) {
    throw new Error(
      "Recusado: testes que usam banco só rodam no banco de teste descartável (`npm test` da API ou de @jaa/banco), " +
        "nunca no banco de desenvolvimento, em produção ou em host remoto.",
    );
  }
  return urlBanco;
}
