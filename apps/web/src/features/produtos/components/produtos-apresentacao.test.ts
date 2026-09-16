import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Produto } from "@jaa/contratos";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FormularioProduto } from "./formulario-produto.tsx";
import { ListaProdutos } from "./lista-produtos.tsx";

const texto = (html: string) => html.replace(/<[^>]+>/g, "").replace(/ /g, " ");
const base: Produto = {
  id: "aaaaaaaa-0000-4000-8000-000000000000",
  empresaId: "cccccccc-0000-4000-8000-000000000000",
  nome: "Pizza Calabresa",
  descricao: "Molho e calabresa",
  precoCentavos: 3990,
  disponibilidade: "disponivel",
  criadoEm: "2026-09-15T12:00:00.000Z",
  atualizadoEm: "2026-09-15T12:00:00.000Z",
};

describe("ListaProdutos", () => {
  it("mostra nome, preço formatado, disponibilidade, Editar e ação de disponibilidade", () => {
    const refri: Produto = { ...base, id: "bbbbbbbb-0000-4000-8000-000000000000", nome: "Refrigerante 2L", descricao: null, precoCentavos: 1200, disponibilidade: "indisponivel" };
    const html = renderToStaticMarkup(createElement(ListaProdutos, { produtos: [base, refri], aoEditar: () => {}, aoAlternarDisponibilidade: () => {} }));
    const conteudo = texto(html);
    for (const esperado of ["Pizza Calabresa", "R$ 39,90", "Disponível", "Refrigerante 2L", "R$ 12,00", "Indisponível", "Marcar indisponível", "Marcar disponível"]) {
      assert.ok(conteudo.includes(esperado), esperado);
    }
    assert.equal((html.match(/>Editar</g) ?? []).length, 2);
    assert.ok(html.includes('data-disponibilidade="indisponivel"'));
  });
});

describe("FormularioProduto", () => {
  it("tem Nome, Descrição, Preço, Disponibilidade e imagem desabilitada 'Em breve' sem seletor de arquivo", () => {
    const html = renderToStaticMarkup(createElement(FormularioProduto, { produto: null, enviando: false, aoSalvar: () => {}, aoCancelar: () => {} }));
    for (const campo of ['name="nomeProduto"', 'name="descricaoProduto"', 'name="precoProduto"', 'name="disponibilidadeProduto"']) assert.ok(html.includes(campo), campo);
    const imagem = html.slice(html.indexOf("<fieldset"));
    assert.ok(imagem.startsWith("<fieldset") && imagem.includes('aria-label="Imagem do produto"'));
    assert.ok(/<fieldset disabled=""/.test(imagem));
    assert.ok(/data-imagem-produto-em-breve/.test(imagem) && imagem.includes("disabled"));
    assert.ok(texto(imagem).includes("Em breve"));
    assert.ok(!/type="file"|accept=|ondrop/i.test(html));
  });

  it("em edição, preço aparece em reais a partir dos centavos", () => {
    const html = renderToStaticMarkup(createElement(FormularioProduto, { produto: base, enviando: false, aoSalvar: () => {}, aoCancelar: () => {} }));
    assert.ok(html.includes('value="39,90"'));
    assert.ok(html.includes("Salvar produto"));
  });
});
