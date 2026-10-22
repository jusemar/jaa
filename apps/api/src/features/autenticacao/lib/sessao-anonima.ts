/**
 * A sessão é de uma conta TEMPORÁRIA de visitante (plugin `anonymous` do Better Auth)? Leitura do
 * campo que o próprio Better Auth grava na conta; nunca de algo enviado pelo cliente.
 */
export function ehSessaoAnonima(sessao: { user: object } | null): boolean {
  return sessao !== null && "isAnonymous" in sessao.user && sessao.user.isAnonymous === true;
}
