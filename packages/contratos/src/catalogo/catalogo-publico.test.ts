import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buscarEmpresasPublicasConsultaSchema, catalogoPublicoSchema, produtoPublicoSchema } from "./catalogo-publico.ts";

const uuid = "01a0a394-6225-75f2-b809-b2690993c512";

describe("catálogo público", () => {
  it("produto público só aceita disponível e descarta campos administrativos", () => {
    const produto = produtoPublicoSchema.parse({ id: uuid, nome: "Pizza", descricao: null, precoCentavos: 3990, disponibilidade: "disponivel", empresaId: uuid, criadoEm: "x", atualizadoEm: "y" });
    assert.deepEqual(Object.keys(produto).sort(), ["descricao", "disponibilidade", "id", "nome", "precoCentavos"]);
    assert.equal(produtoPublicoSchema.safeParse({ ...produto, disponibilidade: "indisponivel" }).success, false);
    assert.equal(produtoPublicoSchema.safeParse({ ...produto, precoCentavos: 39.9 }).success, false);
  });

  it("empresa pública não carrega proprietário, conta, membros nem id interno", () => {
    const catalogo = catalogoPublicoSchema.parse({
      empresa: { identidadeId: uuid, nome: "Pizzaria BH", nomeUsuario: "pizzariabh", slug: "pizzaria-bh", id: uuid, papel: "proprietario", usuarioId: "u" },
      produtos: [],
    });
    assert.deepEqual(Object.keys(catalogo.empresa).sort(), ["identidadeId", "nome", "nomeUsuario", "slug"]);
  });

  it("busca técnica: opcional, sem @ e limitada", () => {
    assert.deepEqual(buscarEmpresasPublicasConsultaSchema.parse({}), {});
    assert.equal(buscarEmpresasPublicasConsultaSchema.parse({ busca: " @pizza " }).busca, "pizza");
    assert.equal(buscarEmpresasPublicasConsultaSchema.safeParse({ busca: "x".repeat(51) }).success, false);
  });
});
