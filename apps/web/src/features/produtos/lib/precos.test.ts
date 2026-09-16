import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { centavosParaCampo, formatarPrecoCentavos, interpretarPrecoDigitado } from "./precos.ts";

const normalizarEspacos = (texto: string) => texto.replace(/ /g, " ");

describe("formatarPrecoCentavos", () => {
  it("apresenta reais com vírgula e milhar, só com inteiros", () => {
    assert.equal(normalizarEspacos(formatarPrecoCentavos(3990)), "R$ 39,90");
    assert.equal(normalizarEspacos(formatarPrecoCentavos(1200)), "R$ 12,00");
    assert.equal(normalizarEspacos(formatarPrecoCentavos(5)), "R$ 0,05");
    assert.equal(normalizarEspacos(formatarPrecoCentavos(123456)), "R$ 1.234,56");
    assert.equal(normalizarEspacos(formatarPrecoCentavos(99_999_999)), "R$ 999.999,99");
  });

  it("valor de edição volta ao formato digitável", () => {
    assert.equal(centavosParaCampo(3990), "39,90");
    assert.equal(interpretarPrecoDigitado(centavosParaCampo(123456)), 123456);
  });
});

describe("interpretarPrecoDigitado", () => {
  it("converte formatos comuns para centavos exatos (sem erro de ponto flutuante)", () => {
    const casos: Array<[string, number]> = [
      ["39,90", 3990],
      ["39,9", 3990],
      ["39", 3900],
      ["39.90", 3990],
      ["R$ 39,90", 3990],
      ["1.234,56", 123456],
      ["0,10", 10],
      ["0,29", 29],
      ["1,15", 115],
      ["999.999,99", 99_999_999],
    ];
    for (const [texto, esperado] of casos) assert.equal(interpretarPrecoDigitado(texto), esperado, texto);
  });

  it("recusa vazio, zero, negativo, 3 casas, letras e acima do limite", () => {
    for (const texto of ["", "0", "0,00", "-39,90", "39,901", "abc", "39,9a", "1.000.000,00", "12.3456", "1e3"]) {
      assert.equal(interpretarPrecoDigitado(texto), null, texto);
    }
  });
});
