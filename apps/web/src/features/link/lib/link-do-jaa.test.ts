import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { caminhoDoLink, linkDoJaa, nomeUsuarioDoSegmento } from "./link-do-jaa.ts";

describe("Link do Jaaa", () => {
  it("é o @usuario no próprio site, sem id interno", () => {
    assert.equal(caminhoDoLink("pizzaria_oasis"), "/@pizzaria_oasis");
    assert.equal(linkDoJaa("https://jaa.com.br/", "pizzaria_oasis"), "https://jaa.com.br/@pizzaria_oasis");
  });

  it("lê o segmento do endereço, inclusive com o @ codificado e maiúsculas", () => {
    assert.equal(nomeUsuarioDoSegmento("@pizzaria_oasis"), "pizzaria_oasis");
    assert.equal(nomeUsuarioDoSegmento("%40pizzaria_oasis"), "pizzaria_oasis");
    assert.equal(nomeUsuarioDoSegmento("@Pizzaria_Oasis"), "pizzaria_oasis");
  });

  it("o que não é '@' + @usuario válido não vira destino (nada de endereço externo ou caminho)", () => {
    const recusados = [
      "pizzaria",
      "@",
      "@ab",
      "@https://malicioso.example",
      "%40https%3A%2F%2Fmalicioso.example",
      "@malicioso.example",
      "@//malicioso.example",
      "@a/../conta",
      "@usuario@outro",
      "@nome com espaço",
      "018f2c1e-7b2a-7c3d-9e4f-5a6b7c8d9e0f",
      "%E0%A4%A",
      "favicon.ico",
    ];
    for (const segmento of recusados) assert.equal(nomeUsuarioDoSegmento(segmento), null, segmento);
  });
});
