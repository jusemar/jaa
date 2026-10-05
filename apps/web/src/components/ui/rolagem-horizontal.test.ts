import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pistasDeRolagem } from "./rolagem-horizontal.ts";

describe("pista de rolagem horizontal", () => {
  it("tudo cabe: nenhuma pista (não sugere rolagem que não existe)", () => {
    assert.deepEqual(pistasDeRolagem({ scrollLeft: 0, scrollWidth: 320, clientWidth: 320 }), { inicio: false, fim: false });
    assert.deepEqual(pistasDeRolagem({ scrollLeft: 0, scrollWidth: 321, clientWidth: 320 }), { inicio: false, fim: false });
  });

  it("no começo: só há mais à direita", () => {
    assert.deepEqual(pistasDeRolagem({ scrollLeft: 0, scrollWidth: 800, clientWidth: 320 }), { inicio: false, fim: true });
  });

  it("no meio: há mais dos dois lados", () => {
    assert.deepEqual(pistasDeRolagem({ scrollLeft: 200, scrollWidth: 800, clientWidth: 320 }), { inicio: true, fim: true });
  });

  it("no fim: a pista da direita some", () => {
    assert.deepEqual(pistasDeRolagem({ scrollLeft: 480, scrollWidth: 800, clientWidth: 320 }), { inicio: true, fim: false });
    assert.deepEqual(pistasDeRolagem({ scrollLeft: 479.4, scrollWidth: 800, clientWidth: 320 }), { inicio: true, fim: false });
  });

  it("a faixa passou a caber (janela alargou): a pista some", () => {
    assert.deepEqual(pistasDeRolagem({ scrollLeft: 0, scrollWidth: 800, clientWidth: 900 }), { inicio: false, fim: false });
  });
});
