/// <reference types="node" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { criarAvisoSonoro } from "./som-mensagem.ts";

describe("som de mensagem recebida", () => {
  it("cada mensagem toca uma vez: evento repetido ou reconexão não repetem", () => {
    let toques = 0;
    const aviso = criarAvisoSonoro({ tocar: () => toques++ });
    assert.equal(aviso.avisar("m1"), true);
    assert.equal(aviso.avisar("m1"), false);
    assert.equal(aviso.avisar("m2"), true);
    assert.equal(toques, 2);
  });

  it("com o aparelho ocupado (ouvindo ou gravando áudio) não toca, e não toca depois por atraso", () => {
    let toques = 0;
    let livre = false;
    const aviso = criarAvisoSonoro({ tocar: () => toques++, podeTocar: () => livre });
    assert.equal(aviso.avisar("m1"), true);
    livre = true;
    assert.equal(aviso.avisar("m1"), false);
    assert.equal(toques, 0);
  });

  it("falha do áudio não vira erro na conversa", () => {
    const aviso = criarAvisoSonoro({
      tocar: () => {
        throw new Error("sem módulo nativo");
      },
    });
    assert.equal(aviso.avisar("m1"), true);
  });

  it("mensagem silenciada (conversa à vista) não toca agora nem numa reentrega do mesmo evento", () => {
    let toques = 0;
    const aviso = criarAvisoSonoro({ tocar: () => toques++ });
    assert.equal(aviso.silenciar("m1"), true);
    // Reconexão reentrega o evento com a pessoa já em outra tela: continua sem som.
    assert.equal(aviso.avisar("m1"), false);
    assert.equal(toques, 0);
  });

  it("a memória é limitada às mensagens mais recentes", () => {
    let toques = 0;
    const aviso = criarAvisoSonoro({ tocar: () => toques++ });
    for (let i = 0; i < 250; i++) aviso.avisar(`m${i}`);
    assert.equal(aviso.avisar("m249"), false);
    assert.equal(toques, 250);
  });
});
