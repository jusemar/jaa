import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Empresa, IdentidadeOperavel } from "@jaa/contratos";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SeletorIdentidade } from "../../identidades/components/seletor-identidade.tsx";
import { ListaEmpresas } from "./lista-empresas.tsx";

const texto = (html: string) => html.replace(/<[^>]+>/g, "");

const pizzaria: Empresa = {
  id: "cccccccc-0000-4000-8000-000000000000",
  nome: "Pizzaria BH",
  slug: "pizzaria-bh",
  status: "ativa",
  identidadeId: "bbbbbbbb-0000-4000-8000-000000000000",
  nomeUsuario: "pizzariabh",
  papel: "proprietario",
  criadoEm: "2026-09-15T12:00:00.000Z",
  atualizadoEm: "2026-09-15T12:00:00.000Z",
};
const pessoal: IdentidadeOperavel = { tipo: "pessoal", identidadeId: "aaaaaaaa-0000-4000-8000-000000000000", nomeExibicao: "Junior Rocha", nomeUsuario: "junior" };
const empresarial: IdentidadeOperavel = { tipo: "empresarial", identidadeId: pizzaria.identidadeId, nomeExibicao: "Pizzaria BH", nomeUsuario: "pizzariabh", empresa: { id: pizzaria.id, slug: pizzaria.slug, papel: "proprietario" } };

describe("ListaEmpresas", () => {
  it("mostra nome, @usuario, endereço futuro da loja, papel e Abrir", () => {
    const html = renderToStaticMarkup(createElement(ListaEmpresas, { empresas: [pizzaria], aoAbrir: () => {} }));
    for (const esperado of ["Pizzaria BH", "@pizzariabh", "/loja/pizzaria-bh", "Proprietário", "Abrir"]) assert.ok(texto(html).includes(esperado), esperado);
  });

  it("estado vazio", () => {
    assert.ok(texto(renderToStaticMarkup(createElement(ListaEmpresas, { empresas: [], aoAbrir: () => {} }))).includes("ainda não tem empresas"));
  });
});

describe("SeletorIdentidade", () => {
  it("separa Pessoa e Empresas e marca o tipo da identidade ativa", () => {
    const html = renderToStaticMarkup(createElement(SeletorIdentidade, { operaveis: [pessoal, empresarial], ativa: pessoal, erro: null, aoSelecionar: () => {} }));
    assert.ok(html.includes('<optgroup label="Pessoa">') && html.includes('<optgroup label="Empresas">'));
    assert.ok(html.indexOf("Junior Rocha") < html.indexOf('label="Empresas"') && html.indexOf("Pizzaria BH") > html.indexOf('label="Empresas"'));
    assert.ok(html.includes('data-tipo-identidade-ativa="pessoal"'));
    assert.ok(!html.includes('role="note"'));
  });

  it("com empresa ativa avisa que o mensageiro opera como a empresa, sem conversas pessoais", () => {
    const html = renderToStaticMarkup(createElement(SeletorIdentidade, { operaveis: [pessoal, empresarial], ativa: empresarial, erro: null, aoSelecionar: () => {} }));
    assert.ok(html.includes('data-tipo-identidade-ativa="empresarial"'));
    assert.ok(texto(html).includes("conversas e respostas saem como Pizzaria BH"));
    assert.ok(texto(html).includes("Suas conversas pessoais não aparecem aqui"));
  });
});
