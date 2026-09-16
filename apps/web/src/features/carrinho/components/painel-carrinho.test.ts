import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { EmpresaPublica } from "@jaa/contratos";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Carrinho } from "../lib/carrinho.ts";
import { PainelCarrinho } from "./painel-carrinho.tsx";

const texto = (html: string) => html.replace(/<[^>]+>/g, "").replace(/ /g, " ");
const empresa: EmpresaPublica = { identidadeId: "bbbbbbbb-0000-4000-8000-000000000000", nome: "Pizzaria BH", nomeUsuario: "pizzariabh", slug: "pizzaria-bh" };
const carrinho: Carrinho = {
  empresa,
  itens: [
    { produtoId: "aaaaaaaa-0000-4000-8000-000000000000", nome: "Pizza Calabresa", precoCentavos: 3990, quantidade: 2 },
    { produtoId: "cccccccc-0000-4000-8000-000000000000", nome: "Refrigerante 2L", precoCentavos: 1200, quantidade: 1 },
  ],
};

const renderizar = (atual: Carrinho = carrinho) =>
  renderToStaticMarkup(
    createElement(PainelCarrinho, {
      carrinho: atual,
      enviando: false,
      erro: null,
      aoAlterarQuantidade: () => {},
      aoRemover: () => {},
      aoConfirmar: () => {},
      aoFechar: () => {},
    }),
  );

describe("carrinho e confirmação do pedido (Web técnica)", () => {
  it("lista itens com quantidade, subtotal e total do carrinho", () => {
    const conteudo = texto(renderizar());
    for (const esperado of ["Carrinho — Pizzaria BH", "Pizza Calabresa", "2 × R$ 39,90 = R$ 79,80", "Refrigerante 2L", "1 × R$ 12,00 = R$ 12,00", "Total: R$ 91,80"]) {
      assert.ok(conteudo.includes(esperado), esperado);
    }
  });

  it("oferece somente pagamento na entrega: dinheiro ou cartão", () => {
    const html = renderizar();
    const conteudo = texto(html);
    assert.ok(conteudo.includes("Pagamento na entrega"));
    assert.ok(conteudo.includes("Dinheiro na entrega"));
    assert.ok(conteudo.includes("Cartão na entrega"));
    assert.equal((html.match(/name="formaPagamento"/g) ?? []).length, 2);
  });

  it("nunca pede credencial financeira: sem número, validade, CVV, senha ou token do cartão", () => {
    const html = renderizar().toLowerCase();
    for (const proibido of ["cvv", "validade", "número do cartão", "numero do cartao", "titular", "senha", "bandeira", "parcel", 'type="password"'] as const) {
      assert.ok(!html.includes(proibido), proibido);
    }
  });

  it("pergunta o troco somente no dinheiro e só depois de o cliente dizer que precisa", () => {
    const html = renderizar();
    // Dinheiro é o padrão: as opções de troco aparecem, mas o campo "Troco para quanto?" ainda não.
    assert.ok(html.includes("data-opcoes-troco"));
    assert.ok(texto(html).includes("Não preciso de troco"));
    assert.ok(texto(html).includes("Preciso de troco"));
    assert.ok(!html.includes('name="trocoPara"'));
    assert.ok(!texto(html).includes("Troco para quanto?"));
  });
});
