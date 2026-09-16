import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { identidadeOperavelSchema } from "../identidades/identidade-operavel.ts";
import { atualizarEmpresaEntradaSchema, criarEmpresaEntradaSchema, empresaSchema, slugEmpresaSchema } from "./empresa.ts";

const uuid = "01a0a394-6225-75f2-b809-b2690993c512";

describe("slugEmpresaSchema", () => {
  it("normaliza espaços nas pontas e maiúsculas", () => {
    assert.equal(slugEmpresaSchema.parse("  Pizzaria-BH "), "pizzaria-bh");
    assert.equal(slugEmpresaSchema.parse("loja24h"), "loja24h");
  });

  it("recusa formato inválido, tamanho e reservados", () => {
    for (const slug of ["pi", "pizzaria bh", "pizzaria--bh", "-pizzaria", "pizzaria-", "pizzária", "pizza_bh", "a".repeat(61), "loja", "ADMIN", ""]) {
      assert.equal(slugEmpresaSchema.safeParse(slug).success, false, slug);
    }
  });
});

describe("criarEmpresaEntradaSchema", () => {
  it("normaliza nome, @usuario e slug; descarta proprietário/conta enviados pelo cliente", () => {
    const entrada = criarEmpresaEntradaSchema.parse({
      nome: "  Pizzaria   BH ",
      nomeUsuario: "@PizzariaBH",
      slug: "Pizzaria-BH",
      usuarioId: "outra-conta",
      proprietarioId: "outra-conta",
      papel: "proprietario",
    });
    assert.deepEqual(entrada, { nome: "Pizzaria BH", nomeUsuario: "pizzariabh", slug: "pizzaria-bh" });
  });

  it("exige os três campos válidos; @usuario reservado é recusado", () => {
    assert.equal(criarEmpresaEntradaSchema.safeParse({ nome: "", nomeUsuario: "pizzariabh", slug: "pizzaria-bh" }).success, false);
    assert.equal(criarEmpresaEntradaSchema.safeParse({ nome: "Jaa", nomeUsuario: "suporte", slug: "jaa-oficial" }).success, false);
    assert.equal(criarEmpresaEntradaSchema.safeParse({ nome: "Pizzaria", nomeUsuario: "pizzariabh" }).success, false);
  });
});

describe("atualizarEmpresaEntradaSchema", () => {
  it("aceita nome e/ou slug, exige ao menos um e ignora campos de autorização", () => {
    assert.deepEqual(atualizarEmpresaEntradaSchema.parse({ slug: "Nova-Pizzaria", papel: "proprietario" }), { slug: "nova-pizzaria" });
    assert.equal(atualizarEmpresaEntradaSchema.safeParse({}).success, false);
  });
});

describe("empresa e identidades operáveis", () => {
  it("empresa não aceita papel desconhecido; identidade operável é discriminada por tipo", () => {
    const empresa = { id: uuid, nome: "P", slug: "pizzaria-bh", status: "ativa", identidadeId: uuid, nomeUsuario: "pizzariabh", papel: "proprietario", criadoEm: "2026-09-15T12:00:00.000Z", atualizadoEm: "2026-09-15T12:00:00.000Z" };
    assert.equal(empresaSchema.safeParse(empresa).success, true);
    assert.equal(empresaSchema.safeParse({ ...empresa, papel: "dono" }).success, false);
    assert.equal(identidadeOperavelSchema.safeParse({ tipo: "pessoal", identidadeId: uuid, nomeExibicao: "Junior", nomeUsuario: "junior" }).success, true);
    assert.equal(identidadeOperavelSchema.safeParse({ tipo: "empresarial", identidadeId: uuid, nomeExibicao: "P", nomeUsuario: "p" }).success, false, "empresarial exige empresa");
  });
});
