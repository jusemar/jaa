import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PAGINA_PRODUTOS_TAMANHO_MAXIMO,
  PAGINA_PRODUTOS_TAMANHO_PADRAO,
  PRECO_PRODUTO_MAXIMO_CENTAVOS,
  alterarDisponibilidadeProdutoEntradaSchema,
  consultaProdutosSchema,
  atualizarProdutoEntradaSchema,
  criarProdutoEntradaSchema,
  precoCentavosSchema,
  produtoSchema,
} from "./produto.ts";

describe("precoCentavosSchema", () => {
  it("aceita centavos inteiros positivos até o limite (R$ 39,90 = 3990)", () => {
    for (const valor of [1, 3990, PRECO_PRODUTO_MAXIMO_CENTAVOS]) assert.equal(precoCentavosSchema.parse(valor), valor);
  });

  it("recusa zero, negativo, fração, string, acima do limite e não finitos", () => {
    for (const valor of [0, -1, -3990, 39.9, 3990.5, "3990", "39,90", PRECO_PRODUTO_MAXIMO_CENTAVOS + 1, Number.MAX_SAFE_INTEGER, Number.NaN, Number.POSITIVE_INFINITY, null]) {
      assert.equal(precoCentavosSchema.safeParse(valor).success, false, String(valor));
    }
  });
});

describe("criarProdutoEntradaSchema", () => {
  it("normaliza nome, converte descrição vazia em null, disponibilidade padrão e descarta empresaId", () => {
    const entrada = criarProdutoEntradaSchema.parse({ nome: "  Pizza   Calabresa ", descricao: "   ", precoCentavos: 3990, empresaId: "outra", id: "x" });
    assert.deepEqual(entrada, { nome: "Pizza Calabresa", descricao: null, precoCentavos: 3990, disponibilidade: "disponivel" });
    assert.equal(criarProdutoEntradaSchema.parse({ nome: "P", descricao: " Molho\nda casa ", precoCentavos: 1 }).descricao, "Molho\nda casa");
  });

  it("recusa nome vazio/longo, descrição longa e preço inválido", () => {
    for (const corpo of [
      { nome: "", precoCentavos: 100 },
      { nome: "   ", precoCentavos: 100 },
      { nome: "x".repeat(121), precoCentavos: 100 },
      { nome: "P", descricao: "x".repeat(1001), precoCentavos: 100 },
      { nome: "P", precoCentavos: -1 },
      { nome: "P" },
      { nome: "P", precoCentavos: 100, disponibilidade: "esgotado" },
    ]) {
      assert.equal(criarProdutoEntradaSchema.safeParse(corpo).success, false, JSON.stringify(corpo).slice(0, 40));
    }
  });
});

describe("edição e disponibilidade", () => {
  it("edição parcial exige algum campo e nunca inclui empresaId", () => {
    assert.deepEqual(atualizarProdutoEntradaSchema.parse({ precoCentavos: 4590, empresaId: "outra-empresa" }), { precoCentavos: 4590 });
    assert.deepEqual(atualizarProdutoEntradaSchema.parse({ descricao: "" }), { descricao: null });
    assert.equal(atualizarProdutoEntradaSchema.safeParse({}).success, false);
    assert.equal(atualizarProdutoEntradaSchema.safeParse({ empresaId: "outra-empresa" }).success, false, "só empresaId não é edição");
  });

  it("disponibilidade só aceita os dois estados; produto exige centavos inteiros", () => {
    assert.equal(alterarDisponibilidadeProdutoEntradaSchema.safeParse({ disponibilidade: "indisponivel" }).success, true);
    assert.equal(alterarDisponibilidadeProdutoEntradaSchema.safeParse({ disponibilidade: "pausado" }).success, false);
    const produto = {
      id: "01a0a394-6225-75f2-b809-b2690993c512",
      empresaId: "01a0a394-6225-75f2-b809-b2690993c512",
      nome: "P",
      descricao: null,
      precoCentavos: 3990,
      disponibilidade: "disponivel",
      categoriaId: null,
      categoriaNome: null,
      imagemUrl: null,
      criadoEm: "2026-09-15T12:00:00.000Z",
      atualizadoEm: "2026-09-15T12:00:00.000Z",
    };
    assert.equal(produtoSchema.safeParse(produto).success, true);
    assert.equal(produtoSchema.safeParse({ ...produto, precoCentavos: 39.9 }).success, false);
    // A imagem é uma URL montada pela API; chave crua ou caminho relativo não é contrato válido.
    assert.equal(produtoSchema.safeParse({ ...produto, imagemUrl: "imagem-produto/a/b.webp" }).success, false);
  });

  it("categoria entra na criação e na edição; null é 'Sem categoria' explícito", () => {
    const categoria = "01a0a394-6225-75f2-b809-b2690993c512";
    assert.equal(criarProdutoEntradaSchema.safeParse({ nome: "P", precoCentavos: 100, categoriaId: categoria }).success, true);
    assert.deepEqual(atualizarProdutoEntradaSchema.parse({ categoriaId: null }), { categoriaId: null });
    assert.equal(atualizarProdutoEntradaSchema.safeParse({ categoriaId: "nao-e-uuid" }).success, false);
  });

  it("a consulta da listagem tem limites: página e limite absurdos não passam", () => {
    assert.deepEqual(consultaProdutosSchema.parse({}), { pagina: 1, limite: PAGINA_PRODUTOS_TAMANHO_PADRAO });
    // Vem da query string: texto que representa número é aceito, número impossível não.
    assert.equal(consultaProdutosSchema.parse({ pagina: "3", limite: "10" }).pagina, 3);
    assert.equal(consultaProdutosSchema.safeParse({ pagina: 0 }).success, false);
    assert.equal(consultaProdutosSchema.safeParse({ limite: PAGINA_PRODUTOS_TAMANHO_MAXIMO + 1 }).success, false);
    assert.equal(consultaProdutosSchema.safeParse({ categoriaId: "sem-categoria" }).success, true);
    assert.equal(consultaProdutosSchema.safeParse({ categoriaId: "qualquer-coisa" }).success, false);
  });
});
