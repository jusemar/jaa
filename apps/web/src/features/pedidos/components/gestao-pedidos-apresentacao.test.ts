import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Pedido, PedidoDaEmpresa, StatusPedido } from "@jaa/contratos";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AcoesPedidoEmpresa } from "./acoes-pedido-empresa.tsx";
import { DetalhePedido, TimelinePedido } from "./apresentacao-pedido.tsx";
import { ListaPedidosEmpresa } from "./lista-pedidos-empresa.tsx";

const texto = (html: string) => html.replace(/<[^>]+>/g, "").replace(/ /g, " ");
const uuid = (n: number) => `${String(n).repeat(8)}-0000-4000-8000-000000000000`;

const evento = (status: StatusPedido, minuto: string, motivo: string | null = null) => ({
  id: uuid(status.length),
  status,
  ocorridoEm: `2026-09-15T12:${minuto}:00.000Z`,
  motivo,
});

const pedido = (status: StatusPedido, historico: Pedido["historico"], motivoCancelamento: string | null = null): Pedido => ({
  id: uuid(4),
  status,
  motivoCancelamento,
  historico,
  origem: "conversa",
  conversaId: uuid(5),
  empresa: { identidadeId: uuid(6), nome: "Pizzaria BH", nomeUsuario: "pizzariabh", slug: "pizzaria-bh" },
  cliente: { identidadeId: uuid(7), nomeExibicao: "Bruna Cliente", nomeUsuario: "bruna", tipo: "pessoal" },
  itens: [{ id: uuid(8), produtoId: uuid(9), nomeProduto: "Pizza Calabresa", precoUnitarioCentavos: 3990, quantidade: 2, subtotalCentavos: 7980 }],
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
  formaPagamentoNaEntrega: "dinheiro",
  trocoParaCentavos: 10000,
  totalCentavos: 7980,
  criadoEm: "2026-09-15T12:00:00.000Z",
  atualizadoEm: "2026-09-15T12:09:00.000Z",
});

const emPreparacao = pedido("em_preparacao", [evento("recebido", "00"), evento("confirmado", "05"), evento("em_preparacao", "09")]);

describe("timeline do acompanhamento", () => {
  it("distingue concluídas, atual e futuras — e só as reais têm horário", () => {
    const html = renderToStaticMarkup(createElement(TimelinePedido, { pedido: emPreparacao }));
    assert.ok(html.includes('data-etapa="confirmado" data-situacao="concluida"'));
    assert.ok(html.includes('data-etapa="em_preparacao" data-situacao="atual"'));
    assert.ok(html.includes('data-etapa="entregue" data-situacao="futura"'));
    const conteudo = texto(html);
    for (const esperado of ["Pedido recebido", "Confirmado", "Em preparação", "Pronto", "Saiu para entrega", "Em rota", "Entregue"]) {
      assert.ok(conteudo.includes(esperado), esperado);
    }
    // Etapas futuras aparecem sem horário inventado.
    assert.equal((html.match(/data-situacao="futura"[^>]*>[^<]*—/g) ?? []).length, 0);
  });

  it("pedido cancelado encerra a timeline e mostra o motivo, sem etapas futuras", () => {
    const cancelado = pedido("cancelado", [evento("recebido", "00"), evento("confirmado", "05"), evento("cancelado", "20", "Produto indisponível")], "Produto indisponível");
    const html = renderToStaticMarkup(createElement(DetalhePedido, { pedido: cancelado, aoFechar: () => {} }));

    assert.ok(html.includes('data-status-pedido="cancelado"'));
    assert.ok(texto(html).includes("Motivo do cancelamento: Produto indisponível"));
    assert.ok(html.includes('data-etapa="cancelado" data-situacao="atual"'));
    assert.equal(html.includes('data-situacao="futura"'), false);
  });
});

describe("ações operacionais da empresa", () => {
  const acoes = (dados: Pedido) => renderToStaticMarkup(createElement(AcoesPedidoEmpresa, { pedido: dados, ocupado: false, aoAvancar: () => {}, aoCancelar: () => {} }));

  it("mostra só a próxima ação válida, nunca sete botões de status", () => {
    const proximas: Array<[StatusPedido, string]> = [
      ["recebido", "Confirmar pedido"],
      ["confirmado", "Iniciar preparação"],
      ["em_preparacao", "Marcar como pronto"],
      ["pronto", "Saiu para entrega"],
      ["saiu_para_entrega", "Marcar em rota"],
      ["em_rota", "Marcar como entregue"],
    ];
    for (const [status, rotulo] of proximas) {
      const html = acoes(pedido(status, [evento("recebido", "00")]));
      const conteudo = texto(html);
      assert.ok(conteudo.includes(rotulo), rotulo);
      assert.equal((html.match(/data-avancar-pedido/g) ?? []).length, 1, status);
      for (const outro of proximas.filter(([, texto]) => texto !== rotulo)) assert.equal(conteudo.includes(outro[1]), false, `${status} não mostra ${outro[1]}`);
      assert.ok(conteudo.includes("Cancelar pedido"), status);
    }
  });

  it("estados terminais não oferecem avanço nem cancelamento", () => {
    for (const status of ["entregue", "cancelado"] as const) {
      const html = acoes(pedido(status, [evento("recebido", "00")], status === "cancelado" ? "Produto indisponível" : null));
      assert.ok(html.includes("data-sem-acoes"), status);
      assert.equal(html.includes("data-avancar-pedido"), false, status);
      assert.equal(html.includes("data-cancelar-pedido"), false, status);
    }
  });

  it("cancelar não acontece por um clique: primeiro motivo e confirmação", () => {
    const html = acoes(emPreparacao);
    assert.ok(html.includes("data-cancelar-pedido"));
    // A confirmação e o motivo só aparecem depois de pedir para cancelar.
    assert.equal(html.includes("data-confirmar-cancelamento"), false);
    assert.equal(html.includes('name="motivoCancelamento"'), false);
  });
});

describe("lista operacional da empresa", () => {
  const linha: PedidoDaEmpresa = {
    id: uuid(4),
    status: "recebido",
    cliente: { identidadeId: uuid(7), nomeExibicao: "Bruna Cliente", nomeUsuario: "bruna", tipo: "pessoal" },
    conversaId: uuid(5),
    quantidadeItens: 3,
    totalCentavos: 9180,
    formaPagamentoNaEntrega: "dinheiro",
    trocoParaCentavos: 10000,
    criadoEm: "2026-09-15T19:42:00.000Z",
  };

  it("cada linha mostra cliente, itens, total, pagamento e status", () => {
    const conteudo = texto(renderToStaticMarkup(createElement(ListaPedidosEmpresa, { pedidos: [linha], aoAbrir: () => {} })));
    for (const esperado of ["Bruna Cliente", "3 itens", "R$ 91,80", "Dinheiro na entrega", "Pedido recebido", "Abrir"]) {
      assert.ok(conteudo.includes(esperado), esperado);
    }
  });

  it("lista vazia explica que não há pedidos", () => {
    assert.ok(texto(renderToStaticMarkup(createElement(ListaPedidosEmpresa, { pedidos: [], aoAbrir: () => {} }))).includes("Nenhum pedido aqui."));
  });
});
