import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { EmpresaPublica, ProdutoPublico } from "@jaa/contratos";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DetalheProdutoCatalogo, ListaCatalogo } from "./catalogo-apresentacao.tsx";
import { ListaEmpresasEncontradas } from "./descoberta-empresas-tecnica.tsx";

const texto = (html: string) => html.replace(/<[^>]+>/g, "").replace(/ /g, " ");
const empresa: EmpresaPublica = { identidadeId: "bbbbbbbb-0000-4000-8000-000000000000", nome: "Pizzaria BH", nomeUsuario: "pizzariabh", slug: "pizzaria-bh" };
const calabresa: ProdutoPublico = { id: "aaaaaaaa-0000-4000-8000-000000000000", nome: "Pizza Calabresa", descricao: "Molho e calabresa", precoCentavos: 3990, disponibilidade: "disponivel" };

describe("catálogo do cliente (Web técnica)", () => {
  it("lista 'Produtos — empresa' com preço formatado e Ver, sem ações de administração ou carrinho", () => {
    const html = renderToStaticMarkup(createElement(ListaCatalogo, { empresa, produtos: [calabresa, { ...calabresa, id: "cccccccc-0000-4000-8000-000000000000", nome: "Refrigerante 2L", precoCentavos: 1200 }], aoVer: () => {} }));
    const conteudo = texto(html);
    for (const esperado of ["Produtos — Pizzaria BH", "Pizza Calabresa", "R$ 39,90", "Refrigerante 2L", "R$ 12,00"]) assert.ok(conteudo.includes(esperado), esperado);
    assert.equal((html.match(/>Ver</g) ?? []).length, 2);
    for (const proibido of ["Editar", "Marcar", "Adicionar", "Carrinho", "Preço (R$)", "<input", "<form"]) assert.ok(!html.includes(proibido), proibido);
  });

  it("detalhe mostra nome, descrição, preço, empresa, disponível e imagem futura desabilitada", () => {
    const html = renderToStaticMarkup(createElement(DetalheProdutoCatalogo, { empresa, produto: calabresa, aoVoltar: () => {} }));
    const conteudo = texto(html);
    for (const esperado of ["Pizza Calabresa", "Molho e calabresa", "R$ 39,90", "Pizzaria BH", "Disponível", "Imagem em breve"]) assert.ok(conteudo.includes(esperado), esperado);
    assert.ok(/<button[^>]*disabled=""[^>]*data-imagem-produto-futura/.test(html));
    assert.ok(!/type="file"|<input/.test(html));
  });

  it("descoberta técnica lista empresas com Conversar", () => {
    const html = renderToStaticMarkup(createElement(ListaEmpresasEncontradas, { empresas: [empresa], aoConversar: () => {} }));
    assert.ok(texto(html).includes("Pizzaria BH@pizzariabhConversar"));
  });
});
