/*
 * Há mais conteúdo para os lados numa faixa que rola na horizontal? A pista visual só aparece do lado
 * em que existe algo escondido: nada quando tudo cabe, só à direita no começo, dos dois lados no meio,
 * só à esquerda no fim.
 */
export interface MedidasDaFaixa {
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
}

// Arredondamento de subpixel do navegador: 1px de sobra não é conteúdo escondido.
const FOLGA = 2;

export function pistasDeRolagem({ scrollLeft, scrollWidth, clientWidth }: MedidasDaFaixa): { inicio: boolean; fim: boolean } {
  const escondido = scrollWidth - clientWidth;
  if (escondido <= FOLGA) return { inicio: false, fim: false };
  // Em layout da direita para a esquerda o navegador informa valores negativos.
  const posicao = Math.abs(scrollLeft);
  return { inicio: posicao > FOLGA, fim: posicao < escondido - FOLGA };
}
