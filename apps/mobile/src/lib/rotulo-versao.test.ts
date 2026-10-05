/// <reference types="node" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rotuloVersao, type VersaoInstalada } from "./rotulo-versao.ts";

const base: VersaoInstalada = { versao: "0.6.0", build: "6", variante: "development", atualizadoEm: null };
const data = () => "04/10 21:30";

describe("rótulo da versão instalada", () => {
  it("development mostra o ambiente", () => {
    assert.deepEqual(rotuloVersao(base, data), { principal: "Jaa 0.6.0 · Build 6", detalhe: "Development" });
  });

  it("development com update OTA em execução diz quando ele foi publicado", () => {
    assert.equal(rotuloVersao({ ...base, atualizadoEm: new Date() }, data).detalhe, "Development · atualizado em 04/10 21:30");
  });

  it("produção não mostra ambiente nem detalhe técnico", () => {
    assert.deepEqual(rotuloVersao({ ...base, variante: "production", atualizadoEm: new Date() }, data), { principal: "Jaa 0.6.0 · Build 6", detalhe: null });
  });

  it("binário antigo sem os módulos nativos de versão não quebra", () => {
    assert.deepEqual(rotuloVersao({ ...base, versao: null, build: null }, data), { principal: "Jaa —", detalhe: "Development" });
  });
});
