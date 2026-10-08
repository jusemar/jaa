/// <reference types="node" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { IDENTIDADE_DA_VARIANTE, lerVariante, validarUrlApi, varianteDeclarada, varianteDoPacote, VARIANTES } from "./variante.ts";

describe("variante do app", () => {
  it("existem somente dois ambientes", () => {
    assert.deepEqual([...VARIANTES], ["development", "production"]);
  });

  it("development: Jaaa Dev, pacote e scheme próprios", () => {
    assert.equal(lerVariante("development"), "development");
    assert.deepEqual(IDENTIDADE_DA_VARIANTE.development, { nome: "Jaaa Dev", pacote: "com.jaa.app.dev", scheme: "jaa-dev", canal: "development" });
  });

  it("production: Jaaa, pacote e scheme definitivos", () => {
    assert.equal(lerVariante("production"), "production");
    assert.deepEqual(IDENTIDADE_DA_VARIANTE.production, { nome: "Jaaa", pacote: "com.jaa.app", scheme: "jaa", canal: "production" });
  });

  it("sem APP_VARIANT é development — produção nunca é o padrão", () => {
    assert.equal(lerVariante(undefined), "development");
    assert.equal(lerVariante(""), "development");
  });

  it("variante inválida falha com mensagem clara", () => {
    for (const valor of ["preview", "staging", "homologacao", "Production", "dev"]) {
      assert.throws(() => lerVariante(valor), /APP_VARIANT inválida/, valor);
    }
  });

  it("o pacote instalado diz o ambiente do binário", () => {
    assert.equal(varianteDoPacote("com.jaa.app.dev"), "development");
    assert.equal(varianteDoPacote("com.jaa.app"), "production");
    assert.equal(varianteDoPacote("com.anonymous.mobile"), null);
    assert.equal(varianteDoPacote(null), null);
  });

  it("a variante declarada na configuração só aceita os dois valores", () => {
    assert.equal(varianteDeclarada("production"), "production");
    assert.equal(varianteDeclarada("preview"), null);
    assert.equal(varianteDeclarada(undefined), null);
  });
});

describe("URL da API por contexto", () => {
  const LOCAIS = ["http://localhost:3333", "http://127.0.0.1:3333", "http://10.0.2.2:3333", "http://192.168.0.10:3333", "http://172.20.5.1:3333", "https://localhost:3333", "https://192.168.0.10"];
  const TUNEIS = ["https://jaa.loca.lt", "https://abc123.ngrok-free.app", "https://abc.ngrok.io", "https://algo.trycloudflare.com"];

  it("Development Client local aceita localhost e IPs da máquina", () => {
    for (const url of LOCAIS) assert.equal(validarUrlApi(url, { variante: "development", local: true }).ok, true, url);
  });

  it("development distribuído (build/update do EAS) recusa localhost, IP interno e HTTP", () => {
    for (const url of [...LOCAIS, "http://api.exemplo.com"]) assert.equal(validarUrlApi(url, { variante: "development", local: false }).ok, false, url);
  });

  it("development distribuído recusa túnel temporário", () => {
    for (const url of TUNEIS) assert.equal(validarUrlApi(url, { variante: "development", local: false }).ok, false, url);
  });

  it("production recusa localhost — inclusive pedindo modo local", () => {
    for (const url of [...LOCAIS, ...TUNEIS]) {
      assert.equal(validarUrlApi(url, { variante: "production", local: false }).ok, false, url);
      assert.equal(validarUrlApi(url, { variante: "production", local: true }).ok, false, url);
    }
  });

  it("URL ausente ou ilegível é recusada", () => {
    assert.equal(validarUrlApi(undefined, { variante: "development", local: false }).ok, false);
    assert.equal(validarUrlApi("api.exemplo.com", { variante: "development", local: false }).ok, false);
    assert.equal(validarUrlApi("*****", { variante: "production", local: false }).ok, false);
  });

  it("HTTPS público é aceito e sai sem barra final", () => {
    assert.deepEqual(validarUrlApi("https://api-dev.exemplo.com/", { variante: "development", local: false }), { ok: true, url: "https://api-dev.exemplo.com" });
    assert.deepEqual(validarUrlApi("https://api.exemplo.com", { variante: "production", local: false }), { ok: true, url: "https://api.exemplo.com" });
  });
});
