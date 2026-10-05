import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { perfilFoiAlterado } from "./perfil.ts";

const salvo = { nomeExibicao: "Mauro", fraseStatus: null, cidade: "Belo Horizonte", sobre: null };
const campos = { nome: "Mauro", frase: "", cidade: "Belo Horizonte", sobre: "" };

describe("botão Salvar do perfil", () => {
  it("logo depois de carregar ou salvar, nada mudou: o botão fica desabilitado", () => {
    assert.equal(perfilFoiAlterado(salvo, campos), false);
  });

  it("qualquer campo diferente do último estado salvo habilita o botão", () => {
    assert.equal(perfilFoiAlterado(salvo, { ...campos, nome: "Mauro Silva" }), true);
    assert.equal(perfilFoiAlterado(salvo, { ...campos, frase: "Respondo à noite" }), true);
    assert.equal(perfilFoiAlterado(salvo, { ...campos, cidade: "" }), true);
    assert.equal(perfilFoiAlterado(salvo, { ...campos, sobre: "Oi" }), true);
  });

  it("desfazer a edição volta a desabilitar", () => {
    assert.equal(perfilFoiAlterado(salvo, { ...campos, nome: "usuario5" }), true);
    assert.equal(perfilFoiAlterado(salvo, { ...campos, nome: "Mauro" }), false);
  });

  it("espaço nas pontas não é alteração (a API guarda o texto aparado)", () => {
    assert.equal(perfilFoiAlterado(salvo, { ...campos, nome: " Mauro ", cidade: "Belo Horizonte  " }), false);
  });
});
