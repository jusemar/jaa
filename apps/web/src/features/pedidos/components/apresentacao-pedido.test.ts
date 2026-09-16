import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Pedido, ResumoPedido } from "@jaa/contratos";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CardPedido, DetalhePedido } from "./apresentacao-pedido.tsx";

const texto = (html: string) => html.replace(/<[^>]+>/g, "").replace(/ /g, " ");

const resumo: ResumoPedido = {
  id: "dddddddd-0000-4000-8000-000000000000",
  status: "recebido",
  formaPagamentoNaEntrega: "dinheiro",
  trocoParaCentavos: null,
  totalCentavos: 9180,
  itens: [
    { nomeProduto: "Pizza Calabresa", quantidade: 2, subtotalCentavos: 7980 },
    { nomeProduto: "Refrigerante 2L", quantidade: 1, subtotalCentavos: 1200 },
  ],
};

const pedido: Pedido = {
  id: resumo.id,
  status: "recebido",
  origem: "conversa",
  conversaId: "eeeeeeee-0000-4000-8000-000000000000",
  empresa: { identidadeId: "bbbbbbbb-0000-4000-8000-000000000000", nome: "Pizzaria BH", nomeUsuario: "pizzariabh", slug: "pizzaria-bh" },
  cliente: { identidadeId: "aaaaaaaa-0000-4000-8000-000000000000", nomeExibicao: "Junior Rocha", nomeUsuario: "junior", tipo: "pessoal" },
  itens: [
    { id: "11111111-0000-4000-8000-000000000000", produtoId: "22222222-0000-4000-8000-000000000000", nomeProduto: "Pizza Calabresa", precoUnitarioCentavos: 3990, quantidade: 2, subtotalCentavos: 7980 },
    { id: "33333333-0000-4000-8000-000000000000", produtoId: "44444444-0000-4000-8000-000000000000", nomeProduto: "Refrigerante 2L", precoUnitarioCentavos: 1200, quantidade: 1, subtotalCentavos: 1200 },
  ],
  formaPagamentoNaEntrega: "dinheiro",
  trocoParaCentavos: null,
  totalCentavos: 9180,
  criadoEm: "2026-09-15T12:00:00.000Z",
  atualizadoEm: "2026-09-15T12:00:00.000Z",
};

const card = (dados: ResumoPedido) => renderToStaticMarkup(createElement(CardPedido, { pedido: dados, aoAbrir: () => {} }));

describe("card e detalhe do Pedido Jaa (Web técnica)", () => {
  it("card mostra itens, total, pagamento, status e abre o pedido", () => {
    const html = card(resumo);
    const conteudo = texto(html);
    for (const esperado of ["Pedido", "2× Pizza Calabresa — R$ 79,80", "1× Refrigerante 2L — R$ 12,00", "Total: R$ 91,80", "Pagamento: Dinheiro na entrega", "Status: Pedido recebido", "Ver pedido"]) {
      assert.ok(conteudo.includes(esperado), esperado);
    }
    assert.ok(html.includes(`data-card-pedido="${resumo.id}"`));
    assert.ok(html.includes('data-status-pedido="recebido"'));
  });

  it("troco aparece só quando o cliente pediu troco em dinheiro", () => {
    assert.ok(!card(resumo).includes("data-troco"));

    const comTroco = texto(card({ ...resumo, trocoParaCentavos: 10000 }));
    assert.ok(comTroco.includes("Troco para: R$ 100,00"));
    assert.ok(comTroco.includes("levar R$ 8,20 de troco"));
  });

  it("cartão na entrega nunca exibe troco", () => {
    const html = card({ ...resumo, formaPagamentoNaEntrega: "cartao" });
    assert.ok(texto(html).includes("Pagamento: Cartão na entrega"));
    assert.ok(!html.includes("data-troco"));
    assert.ok(!texto(html).toLowerCase().includes("troco"));
  });

  it("detalhe mostra cliente, preço unitário de cada item, total e status", () => {
    const conteudo = texto(renderToStaticMarkup(createElement(DetalhePedido, { pedido, aoFechar: () => {} })));
    for (const esperado of ["Pedido — Pizzaria BH", "Cliente: Junior Rocha", "2× Pizza Calabresa — R$ 39,90 cada = R$ 79,80", "1× Refrigerante 2L — R$ 12,00 cada = R$ 12,00", "Total: R$ 91,80", "Status: Pedido recebido"]) {
      assert.ok(conteudo.includes(esperado), esperado);
    }
  });

  it("nem card nem detalhe pedem ou exibem dados de cartão", () => {
    const html = (card(resumo) + renderToStaticMarkup(createElement(DetalhePedido, { pedido, aoFechar: () => {} }))).toLowerCase();
    for (const proibido of ["cvv", "validade", "número do cartão", "numero do cartao", "titular", "<input", "<form"]) {
      assert.ok(!html.includes(proibido), proibido);
    }
  });
});
