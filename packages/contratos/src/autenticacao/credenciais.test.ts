import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { definirSenhaEntradaSchema, entrarComSenhaEntradaSchema, identificadorParecePelefone, SENHA_TAMANHO_MINIMO } from "./credenciais.ts";

describe("identificador de entrada", () => {
  it("reconhece celular com e sem máscara", () => {
    for (const telefone of ["(31) 98765-4321", "31987654321", "+55 31 98765-4321"]) {
      assert.equal(identificadorParecePelefone(telefone), true, telefone);
    }
  });

  it("@usuario nunca é confundido com telefone, mesmo com números no meio", () => {
    for (const usuario of ["junior", "@junior", "loja31", "user_2026"]) assert.equal(identificadorParecePelefone(usuario), false, usuario);
  });
});

describe("contratos de senha", () => {
  it("entrar exige identificador e senha não vazios", () => {
    assert.equal(entrarComSenhaEntradaSchema.safeParse({ identificador: "  ", senha: "x" }).success, false);
    assert.equal(entrarComSenhaEntradaSchema.safeParse({ identificador: "junior", senha: "" }).success, false);
    assert.equal(entrarComSenhaEntradaSchema.parse({ identificador: "  junior  ", senha: "segredo" }).identificador, "junior");
  });

  it("senha curta é recusada já no contrato; a senha atual só entra na troca", () => {
    assert.equal(definirSenhaEntradaSchema.safeParse({ senha: "x".repeat(SENHA_TAMANHO_MINIMO - 1) }).success, false);
    assert.equal(definirSenhaEntradaSchema.safeParse({ senha: "x".repeat(SENHA_TAMANHO_MINIMO) }).success, true);
    assert.equal(definirSenhaEntradaSchema.parse({ senha: "senha-boa-1", senhaAtual: "antiga" }).senhaAtual, "antiga");
  });
});
