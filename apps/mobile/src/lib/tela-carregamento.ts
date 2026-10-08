/*
 * TELA DE CARREGAMENTO — como a arte aprovada (`assets/images/jaaa-tela-carregamento.png`, vertical,
 * 941 × 1672) ocupa telas de proporções diferentes SEM deformar e SEM cortar o logo.
 *
 * O logo vai de ~12% a ~95% da LARGURA da arte e fica entre 33% e 44% da altura. Então:
 * - tela mais ESTREITA/alta que a arte (quase todo celular Android, 9:19 a 9:21): "cobrir" cortaria as
 *   laterais — e o "J" fica a 12% da borda. A arte entra INTEIRA ("conter"), e as faixas que sobram em
 *   cima e embaixo são preenchidas pela própria arte desfocada (nunca por outra cor ou outra imagem);
 * - tela mais LARGA que a arte (tablet, paisagem): "cobrir" corta só em cima e embaixo, longe do logo,
 *   e evita faixas laterais.
 */
export const ARTE_DE_CARREGAMENTO = { largura: 941, altura: 1672 } as const;

// Cor de base da arte (o centro dela): fundo do carregamento e do splash nativo, para não piscar outra cor.
export const COR_DE_FUNDO_DO_CARREGAMENTO = "#FDFEFD";

// Onde o logo fica na arte (frações da altura): "cobrir" só é permitido se esta faixa continuar à vista.
const LOGO_NA_ALTURA = { inicio: 0.3, fim: 0.48 } as const;

export type AjusteDaArte = "conter" | "cobrir";

export function ajusteDaArte(larguraDaTela: number, alturaDaTela: number): AjusteDaArte {
  if (larguraDaTela <= 0 || alturaDaTela <= 0) return "conter";
  const proporcaoDaTela = larguraDaTela / alturaDaTela;
  const proporcaoDaArte = ARTE_DE_CARREGAMENTO.largura / ARTE_DE_CARREGAMENTO.altura;
  if (proporcaoDaTela <= proporcaoDaArte) return "conter";
  // Cobrindo, a arte ganha a largura da tela e sobra altura: a parte visível é uma faixa central.
  const visivel = proporcaoDaArte / proporcaoDaTela;
  const topo = (1 - visivel) / 2;
  return topo <= LOGO_NA_ALTURA.inicio && topo + visivel >= LOGO_NA_ALTURA.fim ? "cobrir" : "conter";
}
