import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mensagemSchema } from "../mensagens/mensagem.ts";
import {
  MAXIMO_ITENS_POR_PEDIDO,
  QUANTIDADE_MAXIMA_POR_ITEM,
  criarPedidoEntradaSchema,
  OBSERVACAO_ITEM_TAMANHO_MAXIMO,
  itemPedidoEntradaSchema,
  itemPedidoSchema,
  pedidoSchema,
  trocoEsperadoCentavos,
} from "./pedido.ts";
import { statusPedidoSchema } from "./status-pedido.ts";

const uuid = "01a0a394-6225-75f2-b809-b2690993c512";
const base = { idCliente: uuid, empresaIdentidadeId: uuid, conversaId: uuid, enderecoId: uuid, itens: [{ produtoId: uuid, quantidade: 2 }] };

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
    assert.deepEqual(Object.keys(entrada).sort(), ["conversaId", "empresaIdentidadeId", "enderecoId", "idCliente", "itens", "pagamento"]);
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
    for (const campo of ["idCliente", "conversaId", "empresaIdentidadeId", "enderecoId"] as const) {
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
      numero: 3,
      origem: "conversa",
      conversaId: uuid,
      empresa: { identidadeId: uuid, nome: "Pizzaria BH", nomeUsuario: "pizzariabh", slug: "pizzaria-bh" },
      cliente: { identidadeId: uuid, tipo: "pessoal", nomeExibicao: "Bruna", nomeUsuario: "bruna" },
      status: "recebido",
      motivoCancelamento: null,
      historico: [{ id: uuid, status: "recebido", ocorridoEm: "2026-09-15T12:00:00.000Z", motivo: null }],
      destino: {
        enderecoId: uuid,
        cep: "30123000",
        logradouro: "Rua das Flores",
        numero: "150",
        complemento: "Apto 302",
        bairro: "Centro",
        cidade: "Belo Horizonte",
        uf: "MG",
        pontoReferencia: "Portão azul",
        latitude: -19.9191249,
        longitude: -43.9386015,
        localizacaoConfirmadaEm: "2026-09-15T11:55:00.000Z",
      },
      formaPagamentoNaEntrega: "dinheiro",
      trocoParaCentavos: 10000,
      totalCentavos: 9180,
      itens: [{ id: uuid, produtoId: uuid, nomeProduto: "Pizza Calabresa", precoUnitarioCentavos: 3990, quantidade: 2, subtotalCentavos: 7980, escolhas: [], observacao: null }],
      criadoEm: "2026-09-15T12:00:00.000Z",
      atualizadoEm: "2026-09-15T12:00:00.000Z",
    };
    assert.equal(pedidoSchema.safeParse(pedido).success, true);
    assert.equal(pedidoSchema.safeParse({ ...pedido, itens: [] }).success, false);
    // Pedido sem histórico não existe: "recebido" é registrado na criação.
    assert.equal(pedidoSchema.safeParse({ ...pedido, historico: [] }).success, false);
    // Pedidos legados (anteriores ao ponto de entrega) continuam válidos, sem destino.
    assert.equal(pedidoSchema.safeParse({ ...pedido, destino: null }).success, true);
    // Destino sem coordenada confirmada não é destino.
    assert.equal(pedidoSchema.safeParse({ ...pedido, destino: { ...pedido.destino, latitude: null } }).success, false);
    // O pedido público não expõe a empresa por id interno nem dados de cartão.
    assert.deepEqual(Object.keys(pedidoSchema.parse(pedido).empresa).sort(), ["identidadeId", "nome", "nomeUsuario", "slug"]);

    const card = { id: uuid, conversaId: uuid, remetenteIdentidadeId: uuid, tipo: "pedido", conteudo: "", criadoEm: "2026-09-15T12:00:00.000Z", estado: "enviada", mensagemRespondida: null, editadaEm: null, excluidaEm: null, pedido: { id: uuid, numero: 3, status: "recebido", formaPagamentoNaEntrega: "cartao", trocoParaCentavos: null, totalCentavos: 1200, itens: [{ nomeProduto: "Refrigerante", quantidade: 1, subtotalCentavos: 1200, escolhas: [], observacao: null }] } };
    assert.equal(mensagemSchema.safeParse(card).success, true);
    assert.equal(mensagemSchema.safeParse({ ...card, tipo: "audio" }).success, false);
  });

  it("item MONTADO guarda o snapshot das escolhas; `escolhas` é obrigatório (vazio no produto comum)", () => {
    const item = { id: uuid, produtoId: uuid, nomeProduto: "Monte seu prato", precoUnitarioCentavos: 2990, quantidade: 1, subtotalCentavos: 2990, observacao: null };
    const montado = {
      ...item,
      escolhas: [
        { grupoNome: "Tamanho", opcaoNome: "Grande", precoAdicionalCentavos: 500 },
        { grupoNome: "Acompanhamentos", opcaoNome: "Arroz", precoAdicionalCentavos: 0 },
      ],
    };
    assert.equal(itemPedidoSchema.safeParse(montado).success, true);
    // Sem `escolhas` o item não é válido: a ausência esconderia se houve montagem ou não.
    assert.equal(itemPedidoSchema.safeParse(item).success, false);
    assert.equal(itemPedidoSchema.safeParse({ ...item, escolhas: [] }).success, true);
  });

  it("o cliente envia só produto, quantidade e as OPÇÕES escolhidas — nunca preço nem subtotal", () => {
    const entrada = itemPedidoEntradaSchema.parse({
      produtoId: uuid,
      quantidade: 2,
      opcaoIds: [uuid],
      // Enviados de propósito: o contrato descarta tudo o que é dinheiro.
      precoUnitarioCentavos: 1,
      subtotalCentavos: 1,
    });
    assert.deepEqual(Object.keys(entrada).sort(), ["opcaoIds", "produtoId", "quantidade"]);
    // Sem montagem, `opcaoIds` simplesmente não vem.
    assert.deepEqual(Object.keys(itemPedidoEntradaSchema.parse({ produtoId: uuid, quantidade: 1 })).sort(), ["produtoId", "quantidade"]);
    assert.equal(itemPedidoEntradaSchema.safeParse({ produtoId: uuid, quantidade: 1, opcaoIds: ["nao-e-uuid"] }).success, false);
  });

  it("observação é da LINHA, opcional e normalizada (vazia vira null)", () => {
    const comObservacao = itemPedidoEntradaSchema.parse({ produtoId: uuid, quantidade: 1, observacao: "  sem   cebola  " });
    assert.equal(comObservacao.observacao, "sem cebola", "espaços sobrando são normalizados");

    // Vazia ou só espaços não é observação: vira null (o banco não guarda string vazia).
    assert.equal(itemPedidoEntradaSchema.parse({ produtoId: uuid, quantidade: 1, observacao: "   " }).observacao, null);
    // Ausente continua ausente: produto comum não precisa mandar o campo.
    assert.deepEqual(Object.keys(itemPedidoEntradaSchema.parse({ produtoId: uuid, quantidade: 1 })).sort(), ["produtoId", "quantidade"]);
    // Acima do limite é recusado no contrato, antes de chegar ao banco.
    assert.equal(itemPedidoEntradaSchema.safeParse({ produtoId: uuid, quantidade: 1, observacao: "x".repeat(OBSERVACAO_ITEM_TAMANHO_MAXIMO + 1) }).success, false);
  });

  it("o item gravado exige `observacao` (null quando não há), como exige `escolhas`", () => {
    const item = { id: uuid, produtoId: uuid, nomeProduto: "Monte seu prato", precoUnitarioCentavos: 2990, quantidade: 1, subtotalCentavos: 2990, escolhas: [] };
    assert.equal(itemPedidoSchema.safeParse(item).success, false, "ausência esconderia se houve observação");
    assert.equal(itemPedidoSchema.safeParse({ ...item, observacao: null }).success, true);
    assert.equal(itemPedidoSchema.safeParse({ ...item, observacao: "sem cebola" }).success, true);
  });
});