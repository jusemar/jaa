import { PRECO_PRODUTO_MAXIMO_CENTAVOS, PRECO_PRODUTO_MINIMO_CENTAVOS } from "@jaa/contratos";

/*
 * Dinheiro na interface sem ponto flutuante: o valor digitado ("39,90") é convertido por texto para
 * centavos inteiros (3990), que é o que a API recebe e devolve. A API revalida tudo.
 */

// "R$ 1.234,56" a partir de centavos inteiros, só com aritmética inteira.
export function formatarPrecoCentavos(centavos: number): string {
  const resto = centavos % 100;
  const reais = (centavos - resto) / 100;
  return `R$ ${new Intl.NumberFormat("pt-BR").format(reais)},${String(resto).padStart(2, "0")}`;
}

// Valor para edição no campo: 3990 → "39,90".
export function centavosParaCampo(centavos: number): string {
  const resto = centavos % 100;
  return `${(centavos - resto) / 100},${String(resto).padStart(2, "0")}`;
}

/**
 * Aceita "39,90", "39,9", "39", "39.90", "1.234,56" e "R$ 39,90". Devolve centavos inteiros ou null
 * (formato inválido, zero, negativo, mais de 2 casas ou acima do limite do contrato).
 */
export function interpretarPrecoDigitado(texto: string): number | null {
  const limpo = texto.replace(/R\$/gi, "").replace(/[\s ]/g, "");
  let reais: string;
  let fracao = "";

  const milharComVirgula = /^(\d{1,3}(?:\.\d{3})+)(?:,(\d{1,2}))?$/.exec(limpo);
  const virgula = /^(\d+)(?:,(\d{1,2}))?$/.exec(limpo);
  const ponto = /^(\d+)\.(\d{1,2})$/.exec(limpo);

  if (milharComVirgula) {
    reais = (milharComVirgula[1] ?? "").replace(/\./g, "");
    fracao = milharComVirgula[2] ?? "";
  } else if (virgula) {
    reais = virgula[1] ?? "";
    fracao = virgula[2] ?? "";
  } else if (ponto) {
    reais = ponto[1] ?? "";
    fracao = ponto[2] ?? "";
  } else {
    return null;
  }

  if (reais.length > 9) return null;
  const centavos = Number(reais) * 100 + Number(fracao.padEnd(2, "0"));
  if (!Number.isSafeInteger(centavos) || centavos < PRECO_PRODUTO_MINIMO_CENTAVOS || centavos > PRECO_PRODUTO_MAXIMO_CENTAVOS) return null;
  return centavos;
}
