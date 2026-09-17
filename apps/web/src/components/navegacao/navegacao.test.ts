import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { IdentidadeOperavel } from "@jaa/contratos";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AREAS_EMPRESARIAIS, AREAS_PESSOAIS, areaValida, areasDaIdentidade } from "./areas.ts";
import { NavegacaoApp } from "./navegacao-app.tsx";

const texto = (html: string) => html.replace(/<[^>]+>/g, "").replace(/ /g, " ");

const pessoal: IdentidadeOperavel = { tipo: "pessoal", identidadeId: "aaaaaaaa-0000-4000-8000-000000000000", nomeExibicao: "Junior Rocha", nomeUsuario: "junior" };
const empresarial: IdentidadeOperavel = {
  tipo: "empresarial",
  identidadeId: "bbbbbbbb-0000-4000-8000-000000000000",
  nomeExibicao: "Pizzaria BH",
  nomeUsuario: "pizzariabh",
  empresa: { id: "cccccccc-0000-4000-8000-000000000000", slug: "pizzaria-bh", papel: "proprietario" },
};
void empresarial;

describe("áreas do aplicativo", () => {
  it("o menu depende de quem a pessoa está sendo agora", () => {
    assert.deepEqual(areasDaIdentidade(pessoal), AREAS_PESSOAIS);
    assert.deepEqual(areasDaIdentidade(empresarial), AREAS_EMPRESARIAIS);
    // Sem identidade resolvida ainda, o menu pessoal é o padrão seguro.
    assert.deepEqual(areasDaIdentidade(null), AREAS_PESSOAIS);
  });

  it("agindo como pessoa não existem telas de operação da empresa", () => {
    const ids = AREAS_PESSOAIS.map((area) => area.id);
    for (const empresarialSo of ["pedidos", "produtos", "logistica"]) assert.equal(ids.includes(empresarialSo), false, empresarialSo);
  });

  it("conversas é a primeira área nos dois casos: o Jaa é um mensageiro", () => {
    assert.equal(AREAS_PESSOAIS[0]?.id, "conversas");
    assert.equal(AREAS_EMPRESARIAIS[0]?.id, "conversas");
  });

  it("endereço com área inexistente cai em conversas, em vez de tela em branco", () => {
    assert.equal(areaValida(AREAS_PESSOAIS, "contatos"), "contatos");
    assert.equal(areaValida(AREAS_PESSOAIS, "inventada"), "conversas");
    assert.equal(areaValida(AREAS_PESSOAIS, null), "conversas");
    // Área de empresa pedida enquanto se age como pessoa não abre: a API recusaria de qualquer forma.
    assert.equal(areaValida(AREAS_PESSOAIS, "pedidos"), "conversas");
  });
});

describe("NavegacaoApp", () => {
  it("marca a área aberta para leitor de tela, não só pela cor", () => {
    const html = renderToStaticMarkup(createElement(NavegacaoApp, { areas: AREAS_PESSOAIS, areaAtiva: "contatos", aoAbrir: () => {} }));
    const marcados = html.match(/aria-current="page"/g) ?? [];
    // Uma marcação na barra do celular e outra na coluna do desktop — a mesma área nas duas.
    assert.equal(marcados.length, 2);
    assert.ok(html.includes('data-area="contatos"'));
  });

  it("existe nas duas formas ao mesmo tempo: coluna no desktop, barra no celular", () => {
    const html = renderToStaticMarkup(createElement(NavegacaoApp, { areas: AREAS_EMPRESARIAIS, areaAtiva: "pedidos", aoAbrir: () => {}, rodape: createElement("span", null, "Pizzaria BH") }));
    assert.ok(html.includes("md:flex"), "coluna aparece só do desktop para cima");
    assert.ok(html.includes("md:hidden"), "barra inferior some no desktop");
    // Barra inferior respeita a área segura do aparelho (barra de gestos do iPhone).
    assert.ok(html.includes("safe-area-inset-bottom"));
    assert.ok(texto(html).includes("Pizzaria BH"));
  });

  it("com a conversa aberta no celular, a barra inferior sai do caminho", () => {
    const comConversa = renderToStaticMarkup(createElement(NavegacaoApp, { areas: AREAS_PESSOAIS, areaAtiva: "conversas", aoAbrir: () => {}, ocultarNoCelular: true }));
    const barra = comConversa.slice(comConversa.lastIndexOf("<nav"));
    assert.ok(barra.includes("hidden") && !barra.includes("flex fixed"), "a barra do celular fica escondida");
    // No desktop nada muda: a coluna continua lá.
    assert.ok(comConversa.includes("md:flex"));
  });
});
