import type { IdentidadeVisivel, ParticipanteConversa, PerfilPublico } from "@jaa/contratos";

/*
 * IDENTIDADE DO OUTRO LADO na conversa aberta (cabeçalho, menu).
 *
 * A rota só carrega identificação (id, tipo, nome, @usuario) e, quando quem abriu já tinha, uma PRÉVIA
 * da foto para a primeira pintura não piscar as iniciais. A fonte de verdade é a API: assim que o perfil
 * público dela chega (já filtrado pela privacidade no servidor), ele substitui tudo — inclusive uma
 * prévia antiga, e inclusive para `null` (foto removida ou escondida).
 */
export function identidadeDoCabecalho(base: ParticipanteConversa, previaFotoUrl: string | null, carregada: PerfilPublico | null): IdentidadeVisivel {
  if (carregada && carregada.identidadeId === base.identidadeId) {
    return { identidadeId: carregada.identidadeId, tipo: carregada.tipo, nomeExibicao: carregada.nomeExibicao, nomeUsuario: carregada.nomeUsuario, fotoUrl: carregada.fotoUrl };
  }
  return { ...base, fotoUrl: previaFotoUrl };
}

/** Parâmetro de rota → prévia da foto (texto vazio ou ausente = sem prévia). */
export function previaDaRota(valor: string | string[] | undefined): string | null {
  const texto = Array.isArray(valor) ? valor[0] : valor;
  return texto ? texto : null;
}
