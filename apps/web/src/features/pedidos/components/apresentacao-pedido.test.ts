import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Pedido, ResumoPedido } from "@jaa/contratos";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CardPedido, DetalhePedido } from "./apresentacao-pedido.tsx";

const texto = (html: string) => html.replace(/<[^>]+>/g, "").replace(/ /g, " ");

const resumo: ResumoPedido = {
  id: "dddddddd-0000-4000-8000-000000000000",
  numero: 15,
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
  numero: resumo.numero,
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
  destino: {
    enderecoId: "66666666-0000-4000-8000-000000000000",
    cep: "30123000",
    logradouro: "Rua das Flores",
    numero: "150",
    complemento: "Apto 302",
    bairro: "Centro",
    cidade: "Belo Horizonte",
    uf: "MG",
    pontoReferencia: "Portão azul",
    latitude: -19.919125,
    longitude: -43.938602,
    localizacaoConfirmadaEm: "2026-09-15T11:55:00.000Z",
  },
  motivoCancelamento: null,
  historico: [{ id: "55555555-0000-4000-8000-000000000000", status: "recebido", ocorridoEm: "2026-09-15T12:00:00.000Z", motivo: null }],
  criadoEm: "2026-09-15T12:00:00.000Z",
  atualizadoEm: "2026-09-15T12:00:00.000Z",
};

const card = (dados: ResumoPedido) => renderToStaticMarkup(createElement(CardPedido, { pedido: dados, aoAbrir: () => {} }));

describe("card e detalhe do Pedido Jaa (Web técnica)", () => {
  it("card mostra itens, total, pagamento, status e abre o pedido", () => {
    const html = card(resumo);
    const conteudo = texto(html);
    for (const esperado of ["Pedido #15", "2× Pizza Calabresa — R$ 79,80", "1× Refrigerante 2L — R$ 12,00", "Total: R$ 91,80", "Pagamento: Dinheiro na entrega", "Status: Pedido recebido", "Ver pedido"]) {
      assert.ok(conteudo.includes(esperado), esperado);
    }
    assert.ok(html.includes(`data-card-pedido="${resumo.id}"`));
    assert.ok(html.includes('data-status-pedido="recebido"'));
  });

  it("o card não herda a cor do balão: fundo claro e texto escuro também no pedido que EU enviei", () => {
    const html = card(resumo);
    /*
     * O balão próprio é jade com texto quase branco. Se o card herdasse isso, o conteúdo do pedido
     * ficaria branco sobre verde-claro — foi exatamente o problema relatado na validação manual.
     * Por isso ele declara a PRÓPRIA superfície e a PRÓPRIA cor de texto.
     */
    const abertura = html.slice(0, html.indexOf(">") + 1);
    assert.ok(abertura.includes("bg-mensagem-recebida"), "mesma superfície clara das mensagens recebidas");
    assert.ok(abertura.includes("text-conteudo"), "cor de texto própria, não a herdada do balão");
    assert.equal(abertura.includes("bg-superficie/70"), false, "nada de fundo translúcido sobre o balão");
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
    for (const esperado of ["Pedido #15 — Pizzaria BH", "Cliente: Junior Rocha", "2× Pizza Calabresa — R$ 39,90 cada = R$ 79,80", "1× Refrigerante 2L — R$ 12,00 cada = R$ 12,00", "Total: R$ 91,80", "Status: Pedido recebido"]) {
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
