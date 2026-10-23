/// <reference types="node" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { escolherGoogleServices, pacotesDoGoogleServices } from "./firebase-da-variante.ts";

const LOCAL = "/repo/google-services.json";
const EAS = "/eas/tmp/google-services.json";
const arquivos = (mapa: Record<string, string[]>) => (caminho: string) => mapa[caminho] ?? null;

describe("google-services.json por variante", () => {
  it("development usa o arquivo local do Dev; sem arquivo, segue sem push", () => {
    assert.equal(escolherGoogleServices({ variante: "development", caminhoDoEas: undefined, caminhoLocal: LOCAL, pacotesDoArquivo: arquivos({ [LOCAL]: ["com.jaa.app.dev"] }) }), LOCAL);
    assert.equal(escolherGoogleServices({ variante: "development", caminhoDoEas: undefined, caminhoLocal: LOCAL, pacotesDoArquivo: arquivos({}) }), null);
  });

  it("production NUNCA usa o arquivo local do Dev; sem variável do EAS, fica sem Firebase (build válido)", () => {
    assert.equal(escolherGoogleServices({ variante: "production", caminhoDoEas: undefined, caminhoLocal: LOCAL, pacotesDoArquivo: arquivos({ [LOCAL]: ["com.jaa.app.dev"] }) }), null);
  });

  it("arquivo de OUTRO pacote é erro de build (production com o Firebase do Dev, ou o contrário)", () => {
    assert.throws(() => escolherGoogleServices({ variante: "production", caminhoDoEas: EAS, caminhoLocal: LOCAL, pacotesDoArquivo: arquivos({ [EAS]: ["com.jaa.app.dev"] }) }), /não é do app com\.jaa\.app/);
    assert.throws(() => escolherGoogleServices({ variante: "development", caminhoDoEas: undefined, caminhoLocal: LOCAL, pacotesDoArquivo: arquivos({ [LOCAL]: ["com.jaa.app"] }) }), /com\.jaa\.app\.dev/);
  });

  it("variável do EAS: vale quando é do pacote certo; apontando para arquivo inexistente é erro", () => {
    assert.equal(escolherGoogleServices({ variante: "production", caminhoDoEas: EAS, caminhoLocal: LOCAL, pacotesDoArquivo: arquivos({ [EAS]: ["com.jaa.app", "com.jaa.app.dev"] }) }), EAS);
    assert.throws(() => escolherGoogleServices({ variante: "development", caminhoDoEas: EAS, caminhoLocal: LOCAL, pacotesDoArquivo: arquivos({}) }), /não existe/);
  });

  it("lê os pacotes do formato do Firebase e ignora o que não reconhece", () => {
    const conteudo = { client: [{ client_info: { android_client_info: { package_name: "com.jaa.app.dev" } } }, { client_info: {} }, "x"] };
    assert.deepEqual(pacotesDoGoogleServices(conteudo), ["com.jaa.app.dev"]);
    assert.deepEqual(pacotesDoGoogleServices(null), []);
  });
});
