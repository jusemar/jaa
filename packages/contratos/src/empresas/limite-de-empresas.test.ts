import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAXIMO_EMPRESAS_CRIADAS_POR_CONTA, MENSAGEM_LIMITE_DE_EMPRESAS, podeCriarEmpresa } from "./empresa.ts";

describe("limite de empresas criadas por conta", () => {
  it("por enquanto é UMA, com mensagem clara", () => {
    assert.equal(MAXIMO_EMPRESAS_CRIADAS_POR_CONTA, 1);
    assert.equal(MENSAGEM_LIMITE_DE_EMPRESAS, "Você já possui uma empresa criada.");
  });

  it("sem empresa pode criar; já proprietária de uma, não", () => {
    assert.equal(podeCriarEmpresa([]), true);
    assert.equal(podeCriarEmpresa([{ papel: "proprietario" }]), false);
    assert.equal(podeCriarEmpresa([{ papel: "proprietario" }, { papel: "proprietario" }]), false);
  });
});
