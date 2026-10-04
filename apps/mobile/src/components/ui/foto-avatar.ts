/**
 * Qual foto o avatar mostra: a prop `fotoUrl`, quando informada, prevalece (inclusive `null`); senão, a
 * foto que veio NA identidade (já filtrada pela privacidade no servidor). `null` = iniciais.
 */
export function fotoDoAvatar(identidade: { fotoUrl?: string | null }, fotoUrl?: string | null): string | null {
  return fotoUrl !== undefined ? fotoUrl : (identidade.fotoUrl ?? null);
}
