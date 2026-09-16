import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mensagemSchema } from "../mensagens/mensagem.ts";
import {
  MAXIMO_ITENS_POR_PEDIDO,
  QUANTIDADE_MAXIMA_POR_ITEM,
  criarPedidoEntradaSchema,
  pedidoSchema,
  trocoEsperadoCentavos,
} from "./pedido.ts";
import { statusPedidoSchema } from "./status-pedido.ts";

const uuid = "01a0a394-6225-75f2-b809-b2690993c512";
const base = { idCliente: uuid, empresaIdentidadeId: uuid, conversaId: uuid, itens: [{ produtoId: uuid, quantidade: 2 }] };

describe("criarPedidoEntradaSchema", () => {
  it("cliente envia só produto e quantidade: preço, subtotal, total, status e identidade do cliente são descartados", () => {
    const entrada = criarPedidoEntradaSchema.parse({
      ...base,
      pagamento: { forma: "dinheiro", trocoParaCentavos: 10000 },
      itens: [{ produtoId: uuid, quantidade: 2, precoCentavos: 1, subtotalCentavos: 1 }],
      totalCentavos: 1,
      status: "entregue",
      clienteIdentidadeId: uuid,
      empresaId: uuid,
    });
    assert.deepEqual(Object.keys(entrada).sort(), ["conversaId", "empresaIdentidadeId", "idCliente", "itens", "pagamento"]);
    assert.deepEqual(entrada.itens, [{ produtoId: uuid, quantidade: 2 }]);
  });

  it("dinheiro: com troco, sem troco (null/ausente); cartão nunca aceita troco", () => {
    for (const pagamento of [{ forma: "dinheiro", trocoParaCentavos: 10000 }, { forma: "dinheiro", trocoParaCentavos: null }, { forma: "dinheiro" }, { forma: "cartao" }]) {
      assert.equal(criarPedidoEntradaSchema.safeParse({ ...base, pagamento }).success, true, JSON.stringify(pagamento));
    }
    const cartaoComTroco = criarPedidoEntradaSchema.safeParse({ ...base, pagamento: { forma: "cartao", trocoParaCentavos: 10000 } });
    assert.equal(cartaoComTroco.success, false, "cartão com troco é recusado, não apenas ignorado");
    for (const pagamento of [{ forma: "pix" }, { forma: "dinheiro", trocoParaCentavos: 0 }, { forma: "dinheiro", trocoParaCentavos: -100 }, { forma: "dinheiro", trocoParaCentavos: 99.5 }, {}]) {
      assert.equal(criarPedidoEntradaSchema.safeParse({ ...base, pagamento }).success, false, JSON.stringify(pagamento));
    }
  });

  it("itens: pelo menos um, quantidade inteira de 1 ao limite, e teto de itens", () => {
    for (const itens of [[], [{ produtoId: uuid, quantidade: 0 }], [{ produtoId: uuid, quantidade: 1.5 }], [{ produtoId: uuid, quantidade: QUANTIDADE_MAXIMA_POR_ITEM + 1 }], [{ produtoId: "x", quantidade: 1 }], Array.from({ length: MAXIMO_ITENS_POR_PEDIDO + 1 }, () => ({ produtoId: uuid, quantidade: 1 }))]) {
      assert.equal(criarPedidoEntradaSchema.safeParse({ ...base, itens, pagamento: { forma: "cartao" } }).success, false);
    }
    assert.equal(criarPedidoEntradaSchema.safeParse({ ...base, itens: [{ produtoId: uuid, quantidade: QUANTIDADE_MAXIMA_POR_ITEM }], pagamento: { forma: "cartao" } }).success, true);
  });

  it("idempotência e conversa são obrigatórias nesta origem", () => {
    for (const campo of ["idCliente", "conversaId", "empresaIdentidadeId"] as const) {
      const { [campo]: _fora, ...incompleta } = base;
      assert.equal(criarPedidoEntradaSchema.safeParse({ ...incompleta, pagamento: { forma: "cartao" } }).success, false, campo);
    }
  });
});

describe("pedido e card na conversa", () => {
  it("o fluxo operacional inteiro, mais o cancelamento, está no contrato", () => {
    assert.deepEqual(statusPedidoSchema.options, ["recebido", "confirmado", "em_preparacao", "pronto", "saiu_para_entrega", "em_rota", "entregue", "cancelado"]);
    assert.equal(statusPedidoSchema.safeParse("a_caminho").success, false);
  });

  it("troco esperado = valor entregue − total; sem troco, nada a devolver", () => {
    assert.equal(trocoEsperadoCentavos({ totalCentavos: 900, trocoParaCentavos: 1000 }), 100);
    assert.equal(trocoEsperadoCentavos({ totalCentavos: 900, trocoParaCentavos: null }), null);
  });

  it("pedido exige itens e mensagem de card referencia o pedido (texto tem pedido null)", () => {
    const pedido = {
      id: uuid,
      origem: "conversa",
      conversaId: uuid,
      empresa: { identidadeId: uuid, nome: "Pizzaria BH", nomeUsuario: "pizzariabh", slug: "pizzaria-bh" },
      cliente: { identidadeId: uuid, tipo: "pessoal", nomeExibicao: "Bruna", nomeUsuario: "bruna" },
      status: "recebido",
      motivoCancelamento: null,
      historico: [{ id: uuid, status: "recebido", ocorridoEm: "2026-09-15T12:00:00.000Z", motivo: null }],
      formaPagamentoNaEntrega: "dinheiro",
      trocoParaCentavos: 10000,
      totalCentavos: 9180,
      itens: [{ id: uuid, produtoId: uuid, nomeProduto: "Pizza Calabresa", precoUnitarioCentavos: 3990, quantidade: 2, subtotalCentavos: 7980 }],
      criadoEm: "2026-09-15T12:00:00.000Z",
      atualizadoEm: "2026-09-15T12:00:00.000Z",
    };
    assert.equal(pedidoSchema.safeParse(pedido).success, true);
    assert.equal(pedidoSchema.safeParse({ ...pedido, itens: [] }).success, false);
    // Pedido sem histórico não existe: "recebido" é registrado na criação.
    assert.equal(pedidoSchema.safeParse({ ...pedido, historico: [] }).success, false);
    // O pedido público não expõe a empresa por id interno nem dados de cartão.
    assert.deepEqual(Object.keys(pedidoSchema.parse(pedido).empresa).sort(), ["identidadeId", "nome", "nomeUsuario", "slug"]);

    const card = { id: uuid, conversaId: uuid, remetenteIdentidadeId: uuid, tipo: "pedido", conteudo: "", criadoEm: "2026-09-15T12:00:00.000Z", estado: "enviada", mensagemRespondida: null, editadaEm: null, excluidaEm: null, pedido: { id: uuid, status: "recebido", formaPagamentoNaEntrega: "cartao", trocoParaCentavos: null, totalCentavos: 1200, itens: [{ nomeProduto: "Refrigerante", quantidade: 1, subtotalCentavos: 1200 }] } };
    assert.equal(mensagemSchema.safeParse(card).success, true);
    assert.equal(mensagemSchema.safeParse({ ...card, tipo: "audio" }).success, false);
  });
});
