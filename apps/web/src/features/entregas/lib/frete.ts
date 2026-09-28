import { FRETE_ZONA_MAXIMO_CENTAVOS } from "@jaa/contratos";
import { formatarPrecoCentavos, interpretarPrecoDigitado } from "@/features/produtos/lib/precos";

/*
 * TAXA DE ENTREGA da zona na interface: o valor digitado ("5,00") vira centavos inteiros (500) por
 * texto, sem ponto flutuante — como os preços. Diferente de preço de produto, ZERO é válido e
 * significa frete grátis. A API revalida (inteiro, ≥ 0, dentro do limite).
 */

const ZERO = /^(?:R\$)?\s*0+(?:[.,]0{1,2})?$/i;

/** "0", "0,00", "R$ 0,00" → 0; "5", "5,00", "7,5" → centavos; vazio, negativo ou inválido → null. */
export function interpretarFreteDigitado(texto: string): number | null {
  const limpo = texto.trim();
  if (limpo === "") return null;
  if (ZERO.test(limpo)) return 0;
  const centavos = interpretarPrecoDigitado(limpo);
  return centavos !== null && centavos <= FRETE_ZONA_MAXIMO_CENTAVOS ? centavos : null;
}

/** Rótulo discreto da zona: "Frete grátis" ou o valor em reais. */
export function rotuloFreteZona(freteCentavos: number): string {
  return freteCentavos === 0 ? "Frete grátis" : `Frete ${formatarPrecoCentavos(freteCentavos)}`;
}
