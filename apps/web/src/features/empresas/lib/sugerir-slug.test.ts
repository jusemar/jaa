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

describe("criar empresa: uma por conta", () => {
  it("quem já criou uma empresa vê '+ Criar empresa' DESATIVADO, com o limite dito ao lado, e não abre o formulário", async () => {
    const { readFileSync } = await import("node:fs");
    const { AVISO_LIMITE_DE_EMPRESAS } = await import("@jaa/contratos");
    assert.equal(AVISO_LIMITE_DE_EMPRESAS, "Limite: 1 empresa por usuário.");
    const tela = readFileSync(new URL("../components/area-empresas.tsx", import.meta.url), "utf8");
    assert.ok(tela.includes("disabled={!podeCriar}"));
    assert.ok(tela.includes("onClick={() => podeCriar && setCriando((atual) => !atual)}"));
    assert.ok(tela.includes("{limiteAtingido && (") && tela.includes("{AVISO_LIMITE_DE_EMPRESAS}"));
    assert.ok(tela.includes("{podeCriar && criando && ("), "o formulário só existe para quem pode criar");
    // A lista das empresas existentes continua sendo mostrada sempre.
    assert.ok(tela.includes("<ListaEmpresas empresas={empresas ?? []}"));
  });
});
