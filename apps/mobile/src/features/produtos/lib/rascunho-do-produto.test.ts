/// <reference types="node" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { descricaoDoRascunho, produtoAlterado, type RascunhoDoProduto } from "./rascunho-do-produto.ts";

const salvo = { nome: "Pizza", descricao: "Massa fina", precoCentavos: 3990, disponibilidade: "disponivel" as const, categoriaId: null };
const rascunho = (extra: Partial<RascunhoDoProduto> = {}): RascunhoDoProduto => ({ nome: "Pizza", descricao: "Massa fina", preco: "39,90", disponibilidade: "disponivel", categoriaId: "", ...extra });

describe("rascunho do produto", () => {
  it("produto novo sempre tem o que salvar", () => {
    assert.equal(produtoAlterado(null, rascunho()), true);
  });

  it("igual ao que está salvo não tem alteração pendente", () => {
    assert.equal(produtoAlterado(salvo, rascunho()), false);
    // O mesmo valor escrito de outro jeito e espaços nas pontas não são alteração.
    assert.equal(produtoAlterado(salvo, rascunho({ preco: "39.9", nome: " Pizza ", descricao: "Massa fina " })), false);
    assert.equal(produtoAlterado({ ...salvo, descricao: null }, rascunho({ descricao: "   " })), false);
  });

  it("qualquer dado alterado deixa o produto pendente", () => {
    assert.equal(produtoAlterado(salvo, rascunho({ nome: "Pizza grande" })), true);
    assert.equal(produtoAlterado(salvo, rascunho({ descricao: "" })), true);
    assert.equal(produtoAlterado(salvo, rascunho({ preco: "40" })), true);
    assert.equal(produtoAlterado(salvo, rascunho({ disponibilidade: "indisponivel" })), true);
    assert.equal(produtoAlterado(salvo, rascunho({ categoriaId: "c1" })), true);
    // Preço inválido não é "igual ao salvo": continua pendente até ser corrigido.
    assert.equal(produtoAlterado(salvo, rascunho({ preco: "abc" })), true);
  });

  it("salvar com sucesso zera a pendência; falhar a mantém", () => {
    const editado = rascunho({ nome: "Pizza grande", preco: "45" });
    // Falhou: o produto salvo continua o anterior.
    assert.equal(produtoAlterado(salvo, editado), true);
    // Deu certo: o servidor devolveu o produto com os dados novos.
    assert.equal(produtoAlterado({ ...salvo, nome: "Pizza grande", precoCentavos: 4500 }, editado), false);
  });

  it("descrição vazia vai como null", () => {
    assert.equal(descricaoDoRascunho("  "), null);
    assert.equal(descricaoDoRascunho(" oi "), "oi");
  });
});
