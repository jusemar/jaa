import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buscarEmpresasPublicasConsultaSchema, catalogoPublicoSchema, produtoPublicoSchema } from "./catalogo-publico.ts";

const uuid = "01a0a394-6225-75f2-b809-b2690993c512";

describe("catálogo público", () => {
  it("produto público só aceita disponível e descarta campos administrativos", () => {
    const produto = produtoPublicoSchema.parse({
      id: uuid,
      nome: "Pizza",
      descricao: null,
      precoCentavos: 3990,
      disponibilidade: "disponivel",
      categoriaId: null,
      imagemUrl: null,
      personalizavel: false,
      // Campos ADMINISTRATIVOS enviados de propósito: precisam ser descartados pelo contrato.
      empresaId: uuid,
      criadoEm: "x",
      atualizadoEm: "y",
      imagemChave: "produtos/abc.jpg",
    });
    assert.deepEqual(Object.keys(produto).sort(), ["categoriaId", "descricao", "disponibilidade", "id", "imagemUrl", "nome", "personalizavel", "precoCentavos"]);
    assert.equal(produtoPublicoSchema.safeParse({ ...produto, disponibilidade: "indisponivel" }).success, false);
    assert.equal(produtoPublicoSchema.safeParse({ ...produto, precoCentavos: 39.9 }).success, false);
    // A imagem sai como URL montada pela API; a chave gravada no banco nunca vaza para o cliente.
    assert.equal(produtoPublicoSchema.safeParse({ ...produto, imagemUrl: "produtos/abc.jpg" }).success, false);
  });

  it("empresa pública não carrega proprietário, conta, membros nem id interno", () => {
    const catalogo = catalogoPublicoSchema.parse({
      empresa: { identidadeId: uuid, nome: "Pizzaria BH", nomeUsuario: "pizzariabh", slug: "pizzaria-bh", id: uuid, papel: "proprietario", usuarioId: "u" },
      categorias: [{ id: uuid, nome: "Pizzas", posicao: 0, produtos: 7 }],
      produtos: [],
    });
    assert.deepEqual(Object.keys(catalogo.empresa).sort(), ["identidadeId", "nome", "nomeUsuario", "slug"]);
    // A contagem administrativa de produtos por categoria não é assunto do cliente.
    assert.deepEqual(Object.keys(catalogo.categorias[0] ?? {}).sort(), ["id", "nome", "posicao"]);
  });

  it("busca técnica: opcional, sem @ e limitada", () => {
    assert.deepEqual(buscarEmpresasPublicasConsultaSchema.parse({}), {});
    assert.equal(buscarEmpresasPublicasConsultaSchema.parse({ busca: " @pizza " }).busca, "pizza");
    assert.equal(buscarEmpresasPublicasConsultaSchema.safeParse({ busca: "x".repeat(51) }).success, false);
  });
});
