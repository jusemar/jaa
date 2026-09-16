import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { slugEmpresaSchema } from "@jaa/contratos";
import { sugerirSlug } from "./sugerir-slug.ts";

describe("sugerirSlug", () => {
  it("remove acentos e símbolos, usa hífen simples e minúsculas", () => {
    assert.equal(sugerirSlug("Pizzaria BH"), "pizzaria-bh");
    assert.equal(sugerirSlug("  Farmácia São João & Cia.  "), "farmacia-sao-joao-cia");
    assert.equal(sugerirSlug("Açaí -- 24h!!"), "acai-24h");
  });

  it("a sugestão de nomes comuns é aceita pelo contrato; limite de tamanho não termina em hífen", () => {
    for (const nome of ["Pizzaria BH", "Farmácia Central", "Padaria do Zé 2"]) assert.equal(slugEmpresaSchema.safeParse(sugerirSlug(nome)).success, true, nome);
    const longo = sugerirSlug(`${"a".repeat(59)} b`);
    assert.ok(longo.length <= 60 && !longo.endsWith("-"));
    assert.equal(sugerirSlug("!!!"), "");
  });
});
