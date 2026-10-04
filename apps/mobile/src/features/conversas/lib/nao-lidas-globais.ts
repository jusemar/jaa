import { LIMITE_CONTAGEM_NAO_LIDAS, type ResumoNaoLidas } from "@jaa/contratos";

/*
 * NÃO LIDAS DA IDENTIDADE ATUANTE, para o indicador de Conversas em QUALQUER área do Jaa.
 *
 * Não é uma segunda fonte de verdade: o servidor deriva a contagem do marcador de leitura persistido.
 * Aqui só se guarda a última contagem conhecida por conversa, vinda de dois lugares do servidor:
 * - o RESUMO (GET /conversas/nao-lidas), a cada (re)conexão e troca de identidade;
 * - o evento `conversa:nao-lidas`, que traz o valor ABSOLUTO — repetido ou fora de ordem, ele
 *   SUBSTITUI, nunca soma. Por isso reconexão e evento duplicado não inflam o contador.
 */

export type NaoLidasPorConversa = ReadonlyMap<string, number>;

export function aplicarNaoLidas(atual: NaoLidasPorConversa, evento: { conversaId: string; naoLidas: number }): NaoLidasPorConversa {
  if ((atual.get(evento.conversaId) ?? 0) === evento.naoLidas) return atual;
  const proximo = new Map(atual);
  if (evento.naoLidas > 0) proximo.set(evento.conversaId, evento.naoLidas);
  else proximo.delete(evento.conversaId);
  return proximo;
}

/**
 * O resumo substitui tudo, EXCETO as conversas que receberam evento enquanto ele estava a caminho:
 * esses eventos são mais novos que a leitura do resumo e não podem ser desfeitos por ela.
 */
export function combinarResumo(atual: NaoLidasPorConversa, resumo: ResumoNaoLidas, atualizadasDuranteBusca: ReadonlySet<string>): NaoLidasPorConversa {
  const proximo = new Map<string, number>();
  for (const { conversaId, naoLidas } of resumo.conversas) if (naoLidas > 0 && !atualizadasDuranteBusca.has(conversaId)) proximo.set(conversaId, naoLidas);
  for (const conversaId of atualizadasDuranteBusca) {
    const valor = atual.get(conversaId);
    if (valor) proximo.set(conversaId, valor);
  }
  return proximo;
}

export function totalNaoLidas(porConversa: NaoLidasPorConversa): number {
  let total = 0;
  for (const naoLidas of porConversa.values()) total += naoLidas;
  return total;
}

// Mesma convenção da lista: a partir de 100 (limite da contagem) ou acima de 99, "99+".
export function rotuloTotalNaoLidas(total: number): string {
  return total >= LIMITE_CONTAGEM_NAO_LIDAS || total > 99 ? "99+" : String(total);
}
