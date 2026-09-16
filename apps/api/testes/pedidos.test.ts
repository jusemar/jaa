import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { itensPedido, mensagens, pedidos } from "@jaa/banco/schema";
import {
  EVENTO_CONVERSA_NAO_LIDAS,
  EVENTO_MENSAGEM_NOVA,
  EVENTO_NOTIFICACAO_NOVA_MENSAGEM,
  type Empresa,
  type EventoMensagemNova,
  type Mensagem,
  type Pedido,
  type Produto,
} from "@jaa/contratos";
import { count, eq } from "drizzle-orm";
import { aguardarAte, coletar, como, criarAmbienteIntegracao, esperar, type Pessoa } from "./apoio/integracao.js";

/*
 * Integração REAL do PEDIDO JAA criado a partir da conversa: recálculo no servidor, snapshot dos itens,
 * pagamento na entrega, idempotência, card na conversa e autorização.
 * A = dona da Pizzaria BH (e da Farmácia); B = cliente; C = terceiro.
 */

const PREFIXO = `ped${randomUUID().slice(0, 4)}`;
const ctx = criarAmbienteIntegracao({
  telefones: ["+5531987651601", "+5531987651602", "+5531987651603"],
  prefixoIp: "198.18.11.",
});

let A: Pessoa;
let B: Pessoa;
let C: Pessoa;
let pizzaria: Empresa;
let farmacia: Empresa;
let comoPizzaria: Pessoa;
let pizza: Produto;
let refrigerante: Produto;
let esgotado: Produto;
let dipirona: Produto;
let conversaBP = "";

const criarProduto = async (empresa: Empresa, corpo: Record<string, unknown>): Promise<Produto> => {
  const resposta = await ctx.api(A, "POST", `/empresas/${empresa.id}/produtos`, corpo);
  assert.equal(resposta.statusCode, 201, resposta.body);
  return resposta.json();
};
const pedir = (pessoa: Pessoa, corpo: Record<string, unknown>) => ctx.api(pessoa, "POST", "/pedidos", corpo);
const pedidoBase = (extras: Record<string, unknown> = {}) => ({
  idCliente: randomUUID(),
  empresaIdentidadeId: pizzaria.identidadeId,
  conversaId: conversaBP,
  itens: [{ produtoId: pizza.id, quantidade: 2 }],
  pagamento: { forma: "cartao" },
  ...extras,
});

before(async () => {
  await ctx.iniciar();
  A = await ctx.criarPessoa(0, `${PREFIXO}_a`, "Junior Rocha");
  B = await ctx.criarPessoa(1, `${PREFIXO}_b`, "Bruna Cliente");
  C = await ctx.criarPessoa(2, `${PREFIXO}_c`, "Carlos Terceiro");
  pizzaria = (await ctx.api(A, "POST", "/empresas", { nome: "Pizzaria BH", nomeUsuario: `${PREFIXO}_pizza`, slug: `${PREFIXO}-pizzaria` })).json();
  farmacia = (await ctx.api(A, "POST", "/empresas", { nome: "Farmácia Central", nomeUsuario: `${PREFIXO}_farma`, slug: `${PREFIXO}-farmacia` })).json();
  comoPizzaria = como(A, pizzaria.identidadeId);
  pizza = await criarProduto(pizzaria, { nome: "Pizza Calabresa", descricao: "Molho e calabresa", precoCentavos: 3990 });
  refrigerante = await criarProduto(pizzaria, { nome: "Refrigerante 2L", precoCentavos: 1200 });
  esgotado = await criarProduto(pizzaria, { nome: "Pizza Esgotada", precoCentavos: 4500, disponibilidade: "indisponivel" });
  dipirona = await criarProduto(farmacia, { nome: "Dipirona", precoCentavos: 890 });
  conversaBP = await ctx.abrirConversa(B, `${PREFIXO}_pizza`);
});

after(() => ctx.encerrar());

describe("criar pedido a partir da conversa", () => {
  let pedido: Pedido;

  it("cliente envia produto e quantidade; servidor calcula 2×R$39,90 + 1×R$12,00 = R$91,80 e grava snapshot", async () => {
    const [pizzaSocket] = await Promise.all([ctx.conectar(comoPizzaria)]);
    const novas = coletar<EventoMensagemNova>(pizzaSocket, EVENTO_MENSAGEM_NOVA);
    const notificacoes = coletar<unknown>(pizzaSocket, EVENTO_NOTIFICACAO_NOVA_MENSAGEM);
    const naoLidas = coletar<{ naoLidas: number }>(pizzaSocket, EVENTO_CONVERSA_NAO_LIDAS);

    const resposta = await pedir(B, {
      ...pedidoBase(),
      itens: [
        { produtoId: pizza.id, quantidade: 2, precoCentavos: 1, subtotalCentavos: 1 },
        { produtoId: refrigerante.id, quantidade: 1 },
      ],
      pagamento: { forma: "dinheiro", trocoParaCentavos: 10000 },
      totalCentavos: 1,
      status: "entregue",
      clienteIdentidadeId: C.identidadeId,
    });
    assert.equal(resposta.statusCode, 201, resposta.body);
    pedido = resposta.json();

    assert.equal(pedido.totalCentavos, 9180, "total recalculado no servidor");
    assert.equal(pedido.status, "recebido");
    assert.equal(pedido.cliente.identidadeId, B.identidadeId, "cliente vem da sessão, não do corpo");
    assert.equal(pedido.empresa.identidadeId, pizzaria.identidadeId);
    assert.equal(pedido.conversaId, conversaBP);
    assert.equal(pedido.formaPagamentoNaEntrega, "dinheiro");
    assert.equal(pedido.trocoParaCentavos, 10000);
    assert.deepEqual(
      pedido.itens.map((item) => [item.nomeProduto, item.quantidade, item.precoUnitarioCentavos, item.subtotalCentavos]),
      [["Pizza Calabresa", 2, 3990, 7980], ["Refrigerante 2L", 1, 1200, 1200]],
    );
    assert.ok(!resposta.body.includes("cartao") && !/cvv|validade|numeroCartao/i.test(resposta.body), "nenhum dado de cartão existe");

    // Card na conversa: mensagem normal que referencia o pedido (realtime, notificação e não lidas).
    await aguardarAte(() => novas.length === 1 && notificacoes.length === 1 && (naoLidas.at(-1)?.naoLidas ?? 0) >= 1);
    const card = novas[0]?.mensagem as Mensagem;
    assert.equal(card.tipo, "pedido");
    assert.equal(card.conteudo, "");
    assert.equal(card.remetenteIdentidadeId, B.identidadeId);
    assert.deepEqual(card.pedido, {
      id: pedido.id,
      status: "recebido",
      formaPagamentoNaEntrega: "dinheiro",
      trocoParaCentavos: 10000,
      totalCentavos: 9180,
      itens: [
        { nomeProduto: "Pizza Calabresa", quantidade: 2, subtotalCentavos: 7980 },
        { nomeProduto: "Refrigerante 2L", quantidade: 1, subtotalCentavos: 1200 },
      ],
    });
    assert.deepEqual((await ctx.historico(comoPizzaria, conversaBP)).mensagens.at(-1), card);
    pizzaSocket.disconnect();
  });

  it("snapshot histórico: mudar nome/preço/disponibilidade do produto depois não altera o pedido", async () => {
    assert.equal((await ctx.api(A, "PATCH", `/empresas/${pizzaria.id}/produtos/${pizza.id}`, { nome: "Pizza Calabresa GG", precoCentavos: 5990 })).statusCode, 200);
    assert.equal((await ctx.api(A, "PATCH", `/empresas/${pizzaria.id}/produtos/${pizza.id}/disponibilidade`, { disponibilidade: "indisponivel" })).statusCode, 200);

    const guardado: Pedido = (await ctx.api(B, "GET", `/pedidos/${pedido.id}`)).json();
    assert.deepEqual(guardado.itens.find((item) => item.produtoId === pizza.id), pedido.itens.find((item) => item.produtoId === pizza.id));
    assert.equal(guardado.totalCentavos, 9180);

    // Volta ao normal, com preço NOVO: o próximo pedido usa o preço atual do banco.
    assert.equal((await ctx.api(A, "PATCH", `/empresas/${pizzaria.id}/produtos/${pizza.id}/disponibilidade`, { disponibilidade: "disponivel" })).statusCode, 200);
    const novoPedido: Pedido = (await pedir(B, pedidoBase({ itens: [{ produtoId: pizza.id, quantidade: 1 }] }))).json();
    assert.equal(novoPedido.itens[0]?.precoUnitarioCentavos, 5990, "preço alterado antes da confirmação é o usado");
    assert.equal(novoPedido.itens[0]?.nomeProduto, "Pizza Calabresa GG");
    assert.equal(novoPedido.totalCentavos, 5990);
    assert.equal((await ctx.api(A, "PATCH", `/empresas/${pizzaria.id}/produtos/${pizza.id}`, { nome: "Pizza Calabresa", precoCentavos: 3990 })).statusCode, 200);
  });

  it("itens inválidos não criam nada: indisponível, de outra empresa, inexistente ou repetido", async () => {
    const pizzaSocket = await ctx.conectar(comoPizzaria);
    const novas = coletar<EventoMensagemNova>(pizzaSocket, EVENTO_MENSAGEM_NOVA);
    const pedidosAntes = (await ctx.banco.select({ total: count() }).from(pedidos))[0]?.total ?? 0;

    for (const itens of [
      [{ produtoId: esgotado.id, quantidade: 1 }],
      [{ produtoId: dipirona.id, quantidade: 1 }],
      [{ produtoId: pizza.id, quantidade: 1 }, { produtoId: dipirona.id, quantidade: 1 }],
      [{ produtoId: randomUUID(), quantidade: 1 }],
      [{ produtoId: pizza.id, quantidade: 1 }, { produtoId: pizza.id, quantidade: 1 }],
    ]) {
      const resposta = await pedir(B, pedidoBase({ itens }));
      assert.equal(resposta.statusCode, 409, JSON.stringify(itens));
      assert.equal(resposta.json().codigo, "ITENS_INVALIDOS");
    }
    assert.equal((await ctx.banco.select({ total: count() }).from(pedidos))[0]?.total ?? 0, pedidosAntes, "nada criado");
    await esperar(200);
    assert.equal(novas.length, 0, "nenhum card na conversa");
    pizzaSocket.disconnect();
  });

  it("pagamento na entrega: dinheiro sem troco, com troco, troco igual ao total normalizado, troco menor recusado; cartão nunca tem troco", async () => {
    const semTroco: Pedido = (await pedir(B, pedidoBase({ pagamento: { forma: "dinheiro" } }))).json();
    assert.equal(semTroco.trocoParaCentavos, null);
    const nulo: Pedido = (await pedir(B, pedidoBase({ pagamento: { forma: "dinheiro", trocoParaCentavos: null } }))).json();
    assert.equal(nulo.trocoParaCentavos, null);
    const comTroco: Pedido = (await pedir(B, pedidoBase({ pagamento: { forma: "dinheiro", trocoParaCentavos: 10000 } }))).json();
    assert.equal(comTroco.trocoParaCentavos, 10000);
    assert.equal(comTroco.totalCentavos, 7980);

    const igualAoTotal: Pedido = (await pedir(B, pedidoBase({ pagamento: { forma: "dinheiro", trocoParaCentavos: 7980 } }))).json();
    assert.equal(igualAoTotal.trocoParaCentavos, null, "pagar exato não é troco");

    const menor = await pedir(B, pedidoBase({ pagamento: { forma: "dinheiro", trocoParaCentavos: 5000 } }));
    assert.equal(menor.statusCode, 400);
    assert.equal(menor.json().codigo, "PAGAMENTO_INVALIDO");

    const cartao: Pedido = (await pedir(B, pedidoBase({ pagamento: { forma: "cartao" } }))).json();
    assert.equal(cartao.formaPagamentoNaEntrega, "cartao");
    assert.equal(cartao.trocoParaCentavos, null);
    const cartaoComTroco = await pedir(B, pedidoBase({ pagamento: { forma: "cartao", trocoParaCentavos: 10000 } }));
    assert.equal(cartaoComTroco.statusCode, 400, "cartão com troco é recusado no servidor");
    for (const pagamento of [{ forma: "pix" }, { forma: "dinheiro", trocoParaCentavos: -1 }, {}]) {
      assert.equal((await pedir(B, pedidoBase({ pagamento }))).statusCode, 400);
    }
    const [linhas] = await ctx.banco.select({ total: count() }).from(pedidos).where(eq(pedidos.trocoParaCentavos, 5000));
    assert.equal(linhas?.total, 0);
  });

  it("idempotência: mesma tentativa devolve o mesmo pedido (um card, um evento); conteúdo diferente é conflito", async () => {
    const pizzaSocket = await ctx.conectar(comoPizzaria);
    const novas = coletar<EventoMensagemNova>(pizzaSocket, EVENTO_MENSAGEM_NOVA);
    const corpo = pedidoBase({ itens: [{ produtoId: refrigerante.id, quantidade: 3 }], pagamento: { forma: "dinheiro", trocoParaCentavos: 5000 } });

    const primeira = await pedir(B, corpo);
    assert.equal(primeira.statusCode, 201);
    const repetidas = await Promise.all(Array.from({ length: 4 }, () => pedir(B, corpo)));
    for (const repetida of repetidas) {
      assert.equal(repetida.statusCode, 200);
      assert.equal(repetida.json().id, primeira.json().id);
    }
    const [total] = await ctx.banco.select({ total: count() }).from(pedidos).where(eq(pedidos.idCliente, corpo.idCliente));
    assert.equal(total?.total, 1);
    const [cards] = await ctx.banco.select({ total: count() }).from(mensagens).where(eq(mensagens.pedidoId, primeira.json().id));
    assert.equal(cards?.total, 1);
    await aguardarAte(() => novas.length === 1);
    await esperar(300);
    assert.equal(novas.length, 1, "retry não reemite card");

    // Mesmo idCliente com itens diferentes (pagamento ainda válido): conflito, não um segundo pedido.
    const conflito = await pedir(B, { ...corpo, itens: [{ produtoId: refrigerante.id, quantidade: 2 }] });
    assert.equal(conflito.statusCode, 409);
    assert.equal(conflito.json().codigo, "ID_CLIENTE_REUTILIZADO");
    pizzaSocket.disconnect();
  });
});

describe("autorização do pedido", () => {
  let pedidoDeB: Pedido;

  before(async () => {
    pedidoDeB = (await pedir(B, pedidoBase({ pagamento: { forma: "dinheiro", trocoParaCentavos: 10000 } }))).json();
  });

  it("cliente e empresa do pedido veem; terceiro, dono pessoal e outra empresa não", async () => {
    assert.equal((await ctx.api(B, "GET", `/pedidos/${pedidoDeB.id}`)).statusCode, 200);
    const pelaEmpresa = await ctx.api(comoPizzaria, "GET", `/pedidos/${pedidoDeB.id}`);
    assert.equal(pelaEmpresa.statusCode, 200);
    assert.equal(pelaEmpresa.json().cliente.nomeExibicao, "Bruna Cliente");
    assert.equal(pelaEmpresa.json().trocoParaCentavos, 10000);

    for (const pessoa of [C, A, como(A, farmacia.identidadeId)]) {
      const resposta = await ctx.api(pessoa, "GET", `/pedidos/${pedidoDeB.id}`);
      assert.equal(resposta.statusCode, 404, JSON.stringify(pessoa.identidadeAtuanteId ?? pessoa.identidadeId));
      assert.equal(resposta.json().codigo, "PEDIDO_NAO_ENCONTRADO");
      assert.ok(!resposta.body.includes("Calabresa"));
    }
    assert.equal((await ctx.api(null, "GET", `/pedidos/${pedidoDeB.id}`)).statusCode, 401);
    assert.equal((await ctx.api(B, "GET", `/pedidos/${randomUUID()}`)).statusCode, 404);
  });

  it("pedido exige identidade pessoal e conversa válida entre cliente e a empresa do pedido", async () => {
    const comoEmpresa = await pedir(comoPizzaria, pedidoBase());
    assert.equal(comoEmpresa.statusCode, 403);
    assert.equal(comoEmpresa.json().codigo, "IDENTIDADE_NAO_AUTORIZADA");

    // Conversa de terceiros e conversa que não é com esta empresa.
    const conversaCP = await ctx.abrirConversa(C, `${PREFIXO}_pizza`);
    const conversaBA = await ctx.abrirConversa(B, `${PREFIXO}_a`);
    for (const conversaId of [conversaCP, conversaBA, randomUUID()]) {
      const resposta = await pedir(B, pedidoBase({ conversaId }));
      assert.equal(resposta.statusCode, 404, conversaId);
      assert.equal(resposta.json().codigo, "CONVERSA_NAO_ENCONTRADA");
    }
    // Empresa inexistente ou identidade pessoal no lugar da empresa.
    for (const empresaIdentidadeId of [C.identidadeId, randomUUID(), farmacia.identidadeId]) {
      const resposta = await pedir(B, pedidoBase({ empresaIdentidadeId }));
      assert.equal(resposta.statusCode, 404, empresaIdentidadeId);
    }
    assert.equal((await ctx.api(null, "POST", "/pedidos", pedidoBase())).statusCode, 401);
  });

  it("os itens gravados batem com o pedido e pertencem à empresa dele", async () => {
    const itens = await ctx.banco.select().from(itensPedido).where(eq(itensPedido.pedidoId, pedidoDeB.id));
    assert.equal(itens.length, pedidoDeB.itens.length);
    for (const item of itens) {
      assert.equal(item.empresaId, (await ctx.banco.select().from(pedidos).where(eq(pedidos.id, pedidoDeB.id)))[0]?.empresaId);
      assert.equal(item.subtotalCentavos, item.precoUnitarioCentavos * item.quantidade);
    }
  });
});
