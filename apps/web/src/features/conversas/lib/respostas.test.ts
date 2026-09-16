import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PREVIA_MENSAGEM_RESPONDIDA_TAMANHO_MAXIMO } from "@jaa/contratos";
import { resumirConteudoParaPrevia, rotuloAutorResposta, textoDaPrevia } from "./respostas.ts";

describe("rotuloAutorResposta", () => {
  it("baseado em identidade: a própria vira Você; outra usa o nome público", () => {
    assert.equal(rotuloAutorResposta("id-eu", "Ana", "id-eu"), "Você");
    assert.equal(rotuloAutorResposta("id-mateus", "Mateus", "id-eu"), "Mateus");
  });
});

describe("resumirConteudoParaPrevia e textoDaPrevia", () => {
  it("curto fica igual; longo é cortado no limite em caracteres, sem partir emoji, com reticências só na apresentação", () => {
    assert.deepEqual(resumirConteudoParaPrevia("Oi"), { previaConteudo: "Oi", conteudoTruncado: false });
    const original = "😀".repeat(4000);
    const resumo = resumirConteudoParaPrevia(original);
    assert.equal([...resumo.previaConteudo].length, PREVIA_MENSAGEM_RESPONDIDA_TAMANHO_MAXIMO);
    assert.equal(resumo.conteudoTruncado, true);
    assert.ok(!resumo.previaConteudo.includes("�"));
    assert.equal(original.length, 8000, "a original não é alterada");
    assert.ok(textoDaPrevia(resumo).endsWith("😀…"));
    assert.equal(textoDaPrevia({ previaConteudo: "exato", conteudoTruncado: false }), "exato");
  });
});
