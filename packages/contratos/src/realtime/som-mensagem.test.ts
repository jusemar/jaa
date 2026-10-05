import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deveTocarSomDeMensagem } from "./som-mensagem.ts";

const base = { remetenteIdentidadeId: "outra", conversaId: "A", identidadeAtivaId: "eu", conversaVisivelId: null as string | null };

describe("som de mensagem recebida (regra comum à Web e ao app)", () => {
  it("conversa A aberta e visível + mensagem de A: silêncio", () => {
    assert.equal(deveTocarSomDeMensagem({ ...base, conversaVisivelId: "A" }), false);
  });

  it("conversa A aberta e visível + mensagem de B: toca", () => {
    assert.equal(deveTocarSomDeMensagem({ ...base, conversaId: "B", conversaVisivelId: "A" }), true);
  });

  it("nenhuma conversa efetivamente visível (outra área, aba escondida, app em segundo plano): toca", () => {
    assert.equal(deveTocarSomDeMensagem({ ...base, conversaVisivelId: null }), true);
  });

  it("mensagem da própria identidade nunca toca, com ou sem conversa visível", () => {
    assert.equal(deveTocarSomDeMensagem({ ...base, remetenteIdentidadeId: "eu" }), false);
    assert.equal(deveTocarSomDeMensagem({ ...base, remetenteIdentidadeId: "eu", conversaId: "B", conversaVisivelId: "A" }), false);
  });
});
