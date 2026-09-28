import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { pedidos, zonasEntrega } from "@jaa/banco/schema";
import { trocoEsperadoCentavos, type ListaPedidosEmpresa, type Pedido, type ZonaEntrega } from "@jaa/contratos";
import { count, eq } from "drizzle-orm";
import { como, criarAmbienteIntegracao, type Pessoa } from "./apoio/integracao.js";

/*
 * Integração REAL do FRETE POR ZONA: o ponto confirmado do endereço cai numa zona da empresa e o
 * valor FIXO dela entra no pedido (subtotal + frete = total), gravado em snapshot.
 * A = dona do Restaurante (com zonas) e do Mercado (sem zonas); B = cliente.
 */

const PREFIXO = `fre${randomUUID().slice(0, 4)}`;
const ctx = criarAmbienteIntegracao({
  telefones: ["+5531987667001", "+5531987667002"],
  prefixoIp: "198.18.72.",
});

// Três quadrados vizinhos (dividem só a divisa): grátis, R$ 5,00 e R$ 7,00.
const quadrado = (longitudeOeste: number) => [
  { latitude: -19.93, longitude: longitudeOeste },
  { latitude: -19.93, longitude: longitudeOeste + 0.02 },
  { latitude: -19.91, longitude: longitudeOeste + 0.02 },
  { latitude: -19.91, longitude: longitudeOeste },
];
const PONTO_GRATIS = { latitude: -19.92, longitude: -43.96 };
const PONTO_CINCO = { latitude: -19.92, longitude: -43.94 };
const PONTO_SETE = { latitude: -19.92, longitude: -43.92 };
const PONTO_FORA = { latitude: -19.85, longitude: -43.8 };

let A: Pessoa;
let B: Pessoa;
let restaurante = { id: "", identidadeId: "" };
let mercado = { id: "", identidadeId: "" };
let prato = "";
let pratoMontado = "";
let grande = "";
let arroz = "";
let cesta = "";
let conversaRestaurante = "";
let conversaMercado = "";
const zonas: Record<"gratis" | "cinco" | "sete", ZonaEntrega> = {} as never;
const enderecos = { gratis: "", cinco: "", sete: "", fora: "" };

const criarEmpresa = async (nome: string, sufixo: string) =>
  (await ctx.api(A, "POST", "/empresas", { nome, nomeUsuario: `${PREFIXO}_${sufixo}`, slug: `${PREFIXO}-${sufixo}` })).json() as { id: string; identidadeId: string };
const criarProduto = async (empresaId: string, nome: string, precoCentavos: number): Promise<string> => {
  const resposta = await ctx.api(A, "POST", `/empresas/${empresaId}/produtos`, { nome, precoCentavos });
  assert.equal(resposta.statusCode, 201, resposta.body);
  return resposta.json().id;
};
const criarZona = async (nome: string, vertices: ReturnType<typeof quadrado>, freteCentavos: number): Promise<ZonaEntrega> => {
  const resposta = await ctx.api(A, "POST", `/empresas/${restaurante.id}/zonas`, { nome, vertices, freteCentavos });
  assert.equal(resposta.statusCode, 201, resposta.body);
  return resposta.json();
};
const mudarFrete = async (zona: ZonaEntrega, freteCentavos: number) => {
  const resposta = await ctx.api(A, "PATCH", `/empresas/${restaurante.id}/zonas/${zona.id}`, { nome: zona.nome, vertices: zona.vertices, freteCentavos });
  assert.equal(resposta.statusCode, 200, resposta.body);
};

const corpoPedido = (enderecoId: string, extras: Record<string, unknown> = {}) => ({
  idCliente: randomUUID(),
  empresaIdentidadeId: restaurante.identidadeId,
  conversaId: conversaRestaurante,
  enderecoId,
  itens: [{ produtoId: prato, quantidade: 1 }],
  pagamento: { forma: "cartao" },
  ...extras,
});
const pedir = (corpo: Record<string, unknown>) => ctx.api(B, "POST", "/pedidos", corpo);
const pedirOk = async (corpo: Record<string, unknown>): Promise<Pedido> => {
  const resposta = await pedir(corpo);
  assert.equal(resposta.statusCode, 201, resposta.body);
  return resposta.json();
};
const reler = async (pedidoId: string): Promise<Pedido> => (await ctx.api(B, "GET", `/pedidos/${pedidoId}`)).json();
const valores = (pedido: Pedido) => ({
  subtotal: pedido.subtotalCentavos,
  freteOriginal: pedido.freteOriginalCentavos,
  desconto: pedido.descontoFreteCentavos,
  freteFinal: pedido.freteFinalCentavos,
  total: pedido.totalCentavos,
  zonaId: pedido.zonaEntregaId,
  zonaNome: pedido.zonaEntregaNome,
});

before(async () => {
  await ctx.iniciar();
  A = await ctx.criarPessoa(0, `${PREFIXO}_a`, "Dona Frete");
  B = await ctx.criarPessoa(1, `${PREFIXO}_b`, "Cliente Frete");
  restaurante = await criarEmpresa("Restaurante Frete", "rest");
  mercado = await criarEmpresa("Mercado Sem Zona", "merc");

  prato = await criarProduto(restaurante.id, "Prato do dia", 3000);
  // Produto personalizado: Tamanho (obrigatório; Grande +R$ 5,00) e Acompanhamento opcional (Arroz +R$ 2,00).
  pratoMontado = await criarProduto(restaurante.id, "Monte seu prato", 3000);
  const rotaGrupos = `/empresas/${restaurante.id}/produtos/${pratoMontado}/grupos-opcoes`;
  const tamanho = (await ctx.api(A, "POST", rotaGrupos, { nome: "Tamanho", minimoEscolhas: 1, maximoEscolhas: 1 })).json().grupos[0].id as string;
  const acompanhamento = (await ctx.api(A, "POST", rotaGrupos, { nome: "Acompanhamento", minimoEscolhas: 0, maximoEscolhas: 2 })).json().grupos[1].id as string;
  grande = (await ctx.api(A, "POST", `${rotaGrupos}/${tamanho}/opcoes`, { nome: "Grande", precoAdicionalCentavos: 500 })).json().grupos[0].opcoes[0].id;
  arroz = (await ctx.api(A, "POST", `${rotaGrupos}/${acompanhamento}/opcoes`, { nome: "Arroz", precoAdicionalCentavos: 200 })).json().grupos[1].opcoes[0].id;
  cesta = await criarProduto(mercado.id, "Cesta", 3000);

  zonas.gratis = await criarZona("Centro", quadrado(-43.97), 0);
  zonas.cinco = await criarZona("Bairro A", quadrado(-43.95), 500);
  zonas.sete = await criarZona("Bairro B", quadrado(-43.93), 700);

  enderecos.gratis = await ctx.criarEnderecoConfirmado(B, { apelido: "Centro" }, PONTO_GRATIS);
  enderecos.cinco = await ctx.criarEnderecoConfirmado(B, { apelido: "Bairro A" }, PONTO_CINCO);
  enderecos.sete = await ctx.criarEnderecoConfirmado(B, { apelido: "Bairro B" }, PONTO_SETE);
  enderecos.fora = await ctx.criarEnderecoConfirmado(B, { apelido: "Longe" }, PONTO_FORA);

  conversaRestaurante = await ctx.abrirConversa(B, `${PREFIXO}_rest`);
  conversaMercado = await ctx.abrirConversa(B, `${PREFIXO}_merc`);
});

after(() => ctx.encerrar());

describe("frete fixo da zona que contém o ponto do endereço", () => {
  it("A) zona grátis: subtotal 3000, frete 0, total 3000", async () => {
    const pedido = await pedirOk(corpoPedido(enderecos.gratis));
    assert.deepEqual(valores(pedido), { subtotal: 3000, freteOriginal: 0, desconto: 0, freteFinal: 0, total: 3000, zonaId: zonas.gratis.id, zonaNome: "Centro" });
  });

  it("B) zona de R$ 5,00: subtotal 3000, frete 500, total 3500", async () => {
    const pedido = await pedirOk(corpoPedido(enderecos.cinco));
    assert.deepEqual(valores(pedido), { subtotal: 3000, freteOriginal: 500, desconto: 0, freteFinal: 500, total: 3500, zonaId: zonas.cinco.id, zonaNome: "Bairro A" });
  });

  it("C) zona de R$ 7,00: subtotal 3000, frete 700, total 3700 — e o que foi gravado é o que se relê", async () => {
    const pedido = await pedirOk(corpoPedido(enderecos.sete));
    assert.deepEqual(valores(pedido), { subtotal: 3000, freteOriginal: 700, desconto: 0, freteFinal: 700, total: 3700, zonaId: zonas.sete.id, zonaNome: "Bairro B" });
    assert.deepEqual(valores(await reler(pedido.id)), valores(pedido));
  });

  it("D) endereço fora de todas as zonas continua recusado pela cobertura (e nada é gravado)", async () => {
    const corpo = corpoPedido(enderecos.fora);
    const resposta = await pedir(corpo);
    assert.equal(resposta.statusCode, 409, resposta.body);
    assert.equal(resposta.json().codigo, "ENDERECO_FORA_AREA_ENTREGA");
    const [gravados] = await ctx.banco.select({ total: count() }).from(pedidos).where(eq(pedidos.idCliente, corpo.idCliente));
    assert.equal(gravados?.total, 0);
  });

  it("E) empresa sem zonas: atende como antes, com frete 0 e sem zona", async () => {
    const pedido = await pedirOk({
      ...corpoPedido(enderecos.fora),
      empresaIdentidadeId: mercado.identidadeId,
      conversaId: conversaMercado,
      itens: [{ produtoId: cesta, quantidade: 1 }],
    });
    assert.deepEqual(valores(pedido), { subtotal: 3000, freteOriginal: 0, desconto: 0, freteFinal: 0, total: 3000, zonaId: null, zonaNome: null });
  });

  it("H) valores de frete/zona/total enviados pelo cliente são ignorados: vale o que o servidor calculou", async () => {
    const pedido = await pedirOk(
      corpoPedido(enderecos.sete, {
        freteCentavos: 0,
        freteOriginalCentavos: 0,
        freteFinalCentavos: 0,
        descontoFreteCentavos: 700,
        subtotalCentavos: 1,
        totalCentavos: 3000,
        zonaEntregaId: zonas.gratis.id,
        zonaEntregaNome: "Centro",
      }),
    );
    assert.deepEqual(valores(pedido), { subtotal: 3000, freteOriginal: 700, desconto: 0, freteFinal: 700, total: 3700, zonaId: zonas.sete.id, zonaNome: "Bairro B" });
  });

  it("I) personalização: os acréscimos das opções entram no SUBTOTAL, e o frete é somado depois", async () => {
    const pedido = await pedirOk(corpoPedido(enderecos.cinco, { itens: [{ produtoId: pratoMontado, quantidade: 2, opcaoIds: [grande, arroz] }] }));
    // (3000 + 500 + 200) × 2 = 7400 de itens; + 500 da zona = 7900.
    assert.equal(pedido.itens[0]?.precoUnitarioCentavos, 3700);
    assert.deepEqual([pedido.subtotalCentavos, pedido.freteFinalCentavos, pedido.totalCentavos], [7400, 500, 7900]);
  });

  it("J) troco é validado contra o TOTAL com frete (subtotal 3000 + frete 500 = 3500)", async () => {
    const dinheiro = (trocoParaCentavos: number) => corpoPedido(enderecos.cinco, { pagamento: { forma: "dinheiro", trocoParaCentavos } });

    // Cobre os produtos, mas não o total com frete: recusado.
    for (const insuficiente of [3200, 3499]) {
      const recusado = await pedir(dinheiro(insuficiente));
      assert.equal(recusado.statusCode, 400, `troco para ${insuficiente}`);
      assert.equal(recusado.json().codigo, "PAGAMENTO_INVALIDO");
    }
    // Exatamente o total = sem troco (normalizado para null).
    assert.equal((await pedirOk(dinheiro(3500))).trocoParaCentavos, null);
    const comTroco = await pedirOk(dinheiro(5000));
    assert.equal(comTroco.trocoParaCentavos, 5000);
    assert.equal(trocoEsperadoCentavos(comTroco), 1500);
  });
});

describe("taxa prevista antes do pedido (cobertura do endereço)", () => {
  const cobertura = (empresaIdentidadeId: string, ponto: { latitude: number; longitude: number }) =>
    ctx.api(B, "POST", `/empresas/${empresaIdentidadeId}/cobertura-entrega`, ponto);

  it("devolve o frete fixo da zona do ponto; fora da área não tem frete; empresa sem zonas é grátis", async () => {
    for (const [ponto, freteCentavos] of [[PONTO_GRATIS, 0], [PONTO_CINCO, 500], [PONTO_SETE, 700]] as const) {
      const resposta = await cobertura(restaurante.identidadeId, ponto);
      assert.equal(resposta.statusCode, 200, resposta.body);
      assert.deepEqual(resposta.json(), { atendida: true, zonasConfiguradas: true, freteCentavos });
    }
    assert.deepEqual((await cobertura(restaurante.identidadeId, PONTO_FORA)).json(), { atendida: false, zonasConfiguradas: true, freteCentavos: null });
    assert.deepEqual((await cobertura(mercado.identidadeId, PONTO_FORA)).json(), { atendida: true, zonasConfiguradas: false, freteCentavos: 0 });
  });

  it("a taxa prevista acompanha a edição da zona e coincide com a do pedido criado", async () => {
    await mudarFrete(zonas.cinco, 650);
    assert.equal((await cobertura(restaurante.identidadeId, PONTO_CINCO)).json().freteCentavos, 650);
    const pedido = await pedirOk(corpoPedido(enderecos.cinco));
    assert.equal(pedido.freteFinalCentavos, 650);
    await mudarFrete(zonas.cinco, 500);
  });
});

describe("snapshot, idempotência e leituras", () => {
  it("F) mudar o frete da zona depois não altera o pedido antigo; pedidos novos usam o valor novo", async () => {
    const antigo = await pedirOk(corpoPedido(enderecos.cinco));
    await mudarFrete(zonas.cinco, 800);

    assert.deepEqual([(await reler(antigo.id)).freteFinalCentavos, (await reler(antigo.id)).totalCentavos], [500, 3500]);
    const novo = await pedirOk(corpoPedido(enderecos.cinco));
    assert.deepEqual([novo.freteOriginalCentavos, novo.freteFinalCentavos, novo.totalCentavos], [800, 800, 3800]);

    await mudarFrete(zonas.cinco, 500);
  });

  it("K) retry do mesmo idCliente devolve o MESMO pedido; retry após o frete mudar não cria outro nem reescreve o snapshot", async () => {
    const corpo = corpoPedido(enderecos.sete);
    const primeiro = await pedirOk(corpo);

    const repetido = await pedir(corpo);
    assert.equal(repetido.statusCode, 200, repetido.body);
    assert.equal((repetido.json() as Pedido).id, primeiro.id);
    assert.deepEqual(valores(repetido.json()), valores(primeiro));

    // Entre as tentativas o frete da zona mudou: o retry não é mais a mesma tentativa.
    await mudarFrete(zonas.sete, 900);
    const aposMudanca = await pedir(corpo);
    assert.equal(aposMudanca.statusCode, 409, aposMudanca.body);
    assert.equal(aposMudanca.json().codigo, "ID_CLIENTE_REUTILIZADO");
    await mudarFrete(zonas.sete, 700);

    const [gravados] = await ctx.banco.select({ total: count() }).from(pedidos).where(eq(pedidos.idCliente, corpo.idCliente));
    assert.equal(gravados?.total, 1);
    assert.deepEqual(valores(await reler(primeiro.id)), valores(primeiro));
  });

  it("card na conversa e lista da empresa trazem subtotal, frete e total do snapshot", async () => {
    const pedido = await pedirOk(corpoPedido(enderecos.sete));

    const card = (await ctx.historico(B, conversaRestaurante)).mensagens.at(-1);
    assert.equal(card?.pedido?.id, pedido.id);
    assert.deepEqual([card?.pedido?.subtotalCentavos, card?.pedido?.freteFinalCentavos, card?.pedido?.totalCentavos], [3000, 700, 3700]);

    const comoRestaurante = como(A, restaurante.identidadeId);
    const lista: ListaPedidosEmpresa = (await ctx.api(comoRestaurante, "GET", `/empresas/${restaurante.id}/pedidos`)).json();
    const linha = lista.pedidos.find((item) => item.id === pedido.id);
    assert.deepEqual([linha?.subtotalCentavos, linha?.freteFinalCentavos, linha?.totalCentavos, linha?.zonaEntregaNome], [3000, 700, 3700, "Bairro B"]);
  });

  it("G) zona excluída: o pedido perde só a referência; nome e valores do snapshot permanecem", async () => {
    const pedido = await pedirOk(corpoPedido(enderecos.sete));
    // Não há rota de exclusão de zona (a operação desativa); a remoção é simulada no banco.
    await ctx.banco.delete(zonasEntrega).where(eq(zonasEntrega.id, zonas.sete.id));

    assert.deepEqual(valores(await reler(pedido.id)), { ...valores(pedido), zonaId: null });
    assert.equal((await reler(pedido.id)).zonaEntregaNome, "Bairro B");
  });
});
