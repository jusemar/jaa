import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { paradasSaida, saidasEntrega } from "@jaa/banco/schema";
import {
  EVENTO_PEDIDO_FILA,
  EVENTO_SAIDA_ATUALIZADA,
  type Empresa,
  type EventoPedidoFila,
  type EventoSaidaAtualizada,
  type FilaDoPedido,
  type ListaSaidas,
  type Pedido,
  type Produto,
  type SaidaEntrega,
} from "@jaa/contratos";
import { eq } from "drizzle-orm";
import { aguardarAte, coletar, como, criarAmbienteIntegracao, type Pessoa } from "./apoio/integracao.js";

/*
 * Integração REAL da SAÍDA DE ENTREGA: agrupamento de vários pedidos de UMA empresa para UM
 * entregador, sequência sugerida, reordenação pelo entregador (versionada) e fila derivada do cliente.
 * A = dona da Pizzaria (e da Farmácia); P = Paulo (entregador); C = Carlos (outro entregador);
 * B1..B3 = clientes.
 */

const PREFIXO = `sai${randomUUID().slice(0, 4)}`;
const ctx = criarAmbienteIntegracao({
  telefones: ["+5531987652001", "+5531987652002", "+5531987652003", "+5531987652004", "+5531987652005", "+5531987652006"],
  prefixoIp: "198.18.15.",
});

let A: Pessoa;
let P: Pessoa;
let C: Pessoa;
let B1: Pessoa;
let B2: Pessoa;
let B3: Pessoa;
let pizzaria: Empresa;
let farmacia: Empresa;
let pizza: Produto;
let dipirona: Produto;
let paulo = "";
let carlos = "";
let naFarmacia = "";
const conversas = new Map<string, string>();
const enderecos = new Map<string, string>();

const criarSaida = (pessoa: Pessoa, empresa: Empresa, corpo: Record<string, unknown>) =>
  ctx.api(pessoa, "POST", `/empresas/${empresa.id}/saidas`, corpo);
const liberarSaida = (saidaId: string, empresa: Empresa = pizzaria) =>
  ctx.api(A, "POST", `/empresas/${empresa.id}/saidas/${saidaId}/liberar`);
const avancar = (pedidoId: string, statusAtual: string, empresa: Empresa = pizzaria) =>
  ctx.api(A, "POST", `/empresas/${empresa.id}/pedidos/${pedidoId}/avancar`, { statusAtual });

async function pedidoPronto(cliente: Pessoa, empresa = pizzaria, produto = pizza): Promise<Pedido> {
  const resposta = await ctx.api(cliente, "POST", "/pedidos", {
    idCliente: randomUUID(),
    empresaIdentidadeId: empresa.identidadeId,
    conversaId: conversas.get(`${cliente.identidadeId}:${empresa.id}`),
    enderecoId: enderecos.get(cliente.identidadeId),
    itens: [{ produtoId: produto.id, quantidade: 1 }],
    pagamento: { forma: "cartao" },
  });
  assert.equal(resposta.statusCode, 201, resposta.body);
  let pedido: Pedido = resposta.json();
  for (const status of ["recebido", "em_preparacao"] as const) {
    const avanco = await avancar(pedido.id, status, empresa);
    assert.equal(avanco.statusCode, 200, avanco.body);
    pedido = avanco.json();
  }
  return pedido;
}

before(async () => {
  await ctx.iniciar();
  A = await ctx.criarPessoa(0, `${PREFIXO}_a`, "Ana da Pizzaria");
  P = await ctx.criarPessoa(1, `${PREFIXO}_p`, "Paulo Entregador");
  C = await ctx.criarPessoa(2, `${PREFIXO}_c`, "Carlos Entregador");
  B1 = await ctx.criarPessoa(3, `${PREFIXO}_b1`, "Bruna Um");
  B2 = await ctx.criarPessoa(4, `${PREFIXO}_b2`, "Bento Dois");
  B3 = await ctx.criarPessoa(5, `${PREFIXO}_b3`, "Bia Três");
  pizzaria = (await ctx.api(A, "POST", "/empresas", { nome: "Pizzaria BH", nomeUsuario: `${PREFIXO}_pizza`, slug: `${PREFIXO}-pizzaria` })).json();
  farmacia = (await ctx.api(A, "POST", "/empresas", { nome: "Farmácia Central", nomeUsuario: `${PREFIXO}_farma`, slug: `${PREFIXO}-farmacia` })).json();
  pizza = (await ctx.api(A, "POST", `/empresas/${pizzaria.id}/produtos`, { nome: "Pizza Calabresa", precoCentavos: 3990 })).json();
  dipirona = (await ctx.api(A, "POST", `/empresas/${farmacia.id}/produtos`, { nome: "Dipirona", precoCentavos: 890 })).json();

  // Cada cliente com endereço confirmado próprio (coordenadas diferentes: a sequência é geográfica).
  let deslocamento = 0;
  for (const [indice, cliente] of [B1, B2, B3].entries()) {
    conversas.set(`${cliente.identidadeId}:${pizzaria.id}`, await ctx.abrirConversa(cliente, `${PREFIXO}_pizza`));
    conversas.set(`${cliente.identidadeId}:${farmacia.id}`, await ctx.abrirConversa(cliente, `${PREFIXO}_farma`));
    deslocamento += 0.01;
    enderecos.set(
      cliente.identidadeId,
      await ctx.criarEnderecoConfirmado(cliente, { apelido: `Casa ${indice + 1}`, numero: `${100 + indice}` }, { latitude: -19.91 - deslocamento, longitude: -43.93 - deslocamento }),
    );
  }

  paulo = await ctx.criarEntregadorAtivo(A, pizzaria.id, P, `${PREFIXO}_p`);
  carlos = await ctx.criarEntregadorAtivo(A, pizzaria.id, C, `${PREFIXO}_c`);
  naFarmacia = await ctx.criarEntregadorAtivo(A, farmacia.id, P, `${PREFIXO}_p`);
});

after(() => ctx.encerrar());

describe("montar a saída", () => {
  it("agrupa vários pedidos prontos, sugere uma sequência e atribui tudo ao entregador", async () => {
    const pedidos = [await pedidoPronto(B1), await pedidoPronto(B2), await pedidoPronto(B3)];

    const resposta = await criarSaida(A, pizzaria, { entregadorId: paulo, pedidoIds: pedidos.map((pedido) => pedido.id) });
    assert.equal(resposta.statusCode, 201, resposta.body);
    const saida: SaidaEntrega = resposta.json();

    assert.equal(saida.status, "preparada");
    assert.equal(saida.entregador?.nomeExibicao, "Paulo Entregador");
    assert.equal(saida.paradas.length, 3);
    // Sequência sugerida: posições 1..n, cada pedido uma vez.
    assert.deepEqual(saida.paradas.map((parada) => parada.posicao), [1, 2, 3]);
    assert.deepEqual(saida.paradas.map((parada) => parada.numeroPedido), pedidos.map((pedido) => pedido.numero));
    assert.deepEqual([...new Set(saida.paradas.map((parada) => parada.pedidoId))].length, 3);
    // Cada parada usa o destino SNAPSHOT do pedido (com o ponto que o cliente confirmou).
    assert.equal(saida.paradas.every((parada) => parada.destino.latitude !== null && parada.destino.logradouro === "Rua das Flores"), true);
    // A atribuição continua sendo a fonte de "quem é o entregador": a saída gravou todas.
    for (const pedido of pedidos) assert.equal((await ctx.api(P, "GET", `/entregas/${pedido.id}`)).statusCode, 200);
  });

  it("recusa pedido que não está pronto, de outra empresa, inexistente ou já em outra saída", async () => {
    const pronto = await pedidoPronto(B1);
    const naoPronto: Pedido = (
      await ctx.api(B2, "POST", "/pedidos", {
        idCliente: randomUUID(),
        empresaIdentidadeId: pizzaria.identidadeId,
        conversaId: conversas.get(`${B2.identidadeId}:${pizzaria.id}`),
        enderecoId: enderecos.get(B2.identidadeId),
        itens: [{ produtoId: pizza.id, quantidade: 1 }],
        pagamento: { forma: "cartao" },
      })
    ).json();
    const naFarmaciaPedido = await pedidoPronto(B3, farmacia, dipirona);

    for (const pedidoIds of [[naoPronto.id], [naFarmaciaPedido.id], [randomUUID()], [pronto.id, naoPronto.id]]) {
      const recusa = await criarSaida(A, pizzaria, { entregadorId: paulo, pedidoIds });
      assert.equal(recusa.statusCode, 409, JSON.stringify(pedidoIds));
      assert.equal(recusa.json().codigo, "PEDIDOS_INVALIDOS_PARA_SAIDA");
    }
    // Nada foi montado pela metade.
    assert.equal(await ctx.banco.select().from(paradasSaida).where(eq(paradasSaida.pedidoId, pronto.id)).then((linhas) => linhas.length), 0);

    // Pedido já dentro de uma saída ativa não entra em outra.
    assert.equal((await criarSaida(A, pizzaria, { entregadorId: paulo, pedidoIds: [pronto.id] })).statusCode, 201);
    const repetido = await criarSaida(A, pizzaria, { entregadorId: carlos, pedidoIds: [pronto.id] });
    assert.equal(repetido.statusCode, 409);
  });

  it("uma saída é de UMA empresa: nunca mistura pedidos de empresas diferentes", async () => {
    const daPizzaria = await pedidoPronto(B1);
    const daFarmacia = await pedidoPronto(B2, farmacia, dipirona);

    const misturada = await criarSaida(A, pizzaria, { entregadorId: paulo, pedidoIds: [daPizzaria.id, daFarmacia.id] });
    assert.equal(misturada.statusCode, 409);
    // Cada empresa monta a sua, com o vínculo dela.
    assert.equal((await criarSaida(A, pizzaria, { entregadorId: paulo, pedidoIds: [daPizzaria.id] })).statusCode, 201);
    assert.equal((await criarSaida(A, farmacia, { entregadorId: naFarmacia, pedidoIds: [daFarmacia.id] })).statusCode, 201);
    // Entregador de outra empresa não serve.
    const outro = await pedidoPronto(B3);
    assert.equal((await criarSaida(A, pizzaria, { entregadorId: naFarmacia, pedidoIds: [outro.id] })).statusCode, 404);
  });

  it("entregador indisponível não recebe saída nova", async () => {
    const pedido = await pedidoPronto(B1);
    assert.equal((await ctx.api(C, "PATCH", `/entregas/vinculos/${carlos}`, { disponivel: false })).statusCode, 200);

    const recusa = await criarSaida(A, pizzaria, { entregadorId: carlos, pedidoIds: [pedido.id] });
    assert.equal(recusa.statusCode, 409);
    assert.equal(recusa.json().codigo, "ENTREGADOR_INDISPONIVEL");

    assert.equal((await ctx.api(C, "PATCH", `/entregas/vinculos/${carlos}`, { disponivel: true })).statusCode, 200);
    assert.equal((await criarSaida(A, pizzaria, { entregadorId: carlos, pedidoIds: [pedido.id] })).statusCode, 201);
  });

  it("dois gestores disputando o mesmo pedido: só uma saída vence", async () => {
    const pedido = await pedidoPronto(B2);
    const [primeira, segunda] = await Promise.all([
      criarSaida(A, pizzaria, { entregadorId: paulo, pedidoIds: [pedido.id] }),
      criarSaida(A, pizzaria, { entregadorId: carlos, pedidoIds: [pedido.id] }),
    ]);
    assert.deepEqual([primeira.statusCode, segunda.statusCode].sort(), [201, 409]);
    const paradas = await ctx.banco.select().from(paradasSaida).where(eq(paradasSaida.pedidoId, pedido.id));
    assert.equal(paradas.filter((parada) => parada.encerradaEm === null).length, 1, "o pedido está em uma única saída ativa");
  });

  it("empresa diferente e estranhos não acessam a saída", async () => {
    const pedido = await pedidoPronto(B3);
    const saida: SaidaEntrega = (await criarSaida(A, pizzaria, { entregadorId: paulo, pedidoIds: [pedido.id] })).json();

    assert.equal((await ctx.api(A, "GET", `/empresas/${farmacia.id}/saidas/${saida.id}`)).statusCode, 404);
    assert.equal((await ctx.api(B1, "GET", `/empresas/${pizzaria.id}/saidas/${saida.id}`)).statusCode, 404);
    assert.equal((await ctx.api(C, "GET", `/entregas/saidas/${saida.id}`)).statusCode, 404, "entregador que não é o da saída");
    assert.equal((await ctx.api(null, "GET", "/entregas/saidas")).statusCode, 401);
    assert.equal((await ctx.api(P, "GET", `/entregas/saidas/${saida.id}`)).statusCode, 200);
  });
});

describe("iniciar a saída", () => {
  it("leva os pedidos para 'saiu para entrega' pela máquina de estados, com histórico", async () => {
    const pedidos = [await pedidoPronto(B1), await pedidoPronto(B2)];
    const saida: SaidaEntrega = (await criarSaida(A, pizzaria, { entregadorId: paulo, pedidoIds: pedidos.map((pedido) => pedido.id) })).json();

    const antesDaLiberacao = await ctx.api(P, "POST", `/entregas/saidas/${saida.id}/iniciar`);
    assert.equal(antesDaLiberacao.statusCode, 409, "o entregador não sai antes da liberação");
    const liberada = await liberarSaida(saida.id);
    assert.equal(liberada.statusCode, 200, liberada.body);
    assert.equal((liberada.json() as SaidaEntrega).status, "liberada_retirada");
    assert.ok((liberada.json() as SaidaEntrega).liberadaEm);
    const iniciada = await ctx.api(P, "POST", `/entregas/saidas/${saida.id}/iniciar`);
    assert.equal(iniciada.statusCode, 200, iniciada.body);
    const emAndamento: SaidaEntrega = iniciada.json();
    assert.equal(emAndamento.status, "em_andamento");
    assert.ok(emAndamento.iniciadaEm);

    for (const pedido of pedidos) {
      const atual: Pedido = (await ctx.api(A, "GET", `/empresas/${pizzaria.id}/pedidos/${pedido.id}`)).json();
      assert.equal(atual.status, "saiu_para_entrega");
      // Histórico do PEDIDO preservado: nada de atalho que pule a máquina de estados.
      assert.deepEqual(atual.historico.map((evento) => evento.status), ["recebido", "em_preparacao", "pronto", "saiu_para_entrega"]);
    }
    // A empresa libera, mas não inicia a entrega no lugar do entregador.
    assert.equal((await ctx.api(A, "POST", `/empresas/${pizzaria.id}/saidas/${saida.id}/iniciar`)).statusCode, 404);
  });

  it("o ENTREGADOR atual inicia a própria saída pela mesma regra — e não inicia de novo", async () => {
    const pedidos = [await pedidoPronto(B1), await pedidoPronto(B3)];
    const saida: SaidaEntrega = (await criarSaida(A, pizzaria, { entregadorId: paulo, pedidoIds: pedidos.map((pedido) => pedido.id) })).json();
    assert.equal(saida.status, "preparada");

    // Outra pessoa (mesmo sendo entregador da empresa) não enxerga a saída de Paulo: 404, sem revelar nada.
    assert.equal((await ctx.api(C, "POST", `/entregas/saidas/${saida.id}/iniciar`)).statusCode, 404);
    // Cliente, então, muito menos.
    assert.equal((await ctx.api(B1, "POST", `/entregas/saidas/${saida.id}/iniciar`)).statusCode, 404);

    assert.equal((await liberarSaida(saida.id)).statusCode, 200);
    const iniciada = await ctx.api(P, "POST", `/entregas/saidas/${saida.id}/iniciar`);
    assert.equal(iniciada.statusCode, 200, iniciada.body);
    const emAndamento: SaidaEntrega = iniciada.json();
    assert.equal(emAndamento.status, "em_andamento");
    assert.ok(emAndamento.iniciadaEm);

    // Os pedidos avançam pela MESMA máquina de estados, com histórico completo.
    for (const pedido of pedidos) {
      const atual: Pedido = (await ctx.api(A, "GET", `/empresas/${pizzaria.id}/pedidos/${pedido.id}`)).json();
      assert.equal(atual.status, "saiu_para_entrega");
      assert.deepEqual(atual.historico.map((evento) => evento.status), ["recebido", "em_preparacao", "pronto", "saiu_para_entrega"]);
    }

    // Já em andamento: ele não inicia de novo; a empresa sequer possui essa operação.
    const deNovo = await ctx.api(P, "POST", `/entregas/saidas/${saida.id}/iniciar`);
    assert.equal(deNovo.statusCode, 409);
    assert.equal(deNovo.json().codigo, "SAIDA_NAO_LIBERADA");
    assert.equal((await ctx.api(A, "POST", `/empresas/${pizzaria.id}/saidas/${saida.id}/iniciar`)).statusCode, 404);

    // E o rastreamento, que depende de a saída estar em andamento, passa a aceitar a posição dele.
    const posicao = await ctx.api(P, "POST", `/entregas/saidas/${saida.id}/posicao`, {
      latitude: -19.92,
      longitude: -43.94,
      precisaoMetros: 10,
      capturadaEm: new Date().toISOString(),
    });
    assert.ok(posicao.statusCode >= 200 && posicao.statusCode < 300, posicao.body);
  });
});

describe("sequência e reordenação", () => {
  async function saidaComTres(): Promise<SaidaEntrega> {
    const pedidos = [await pedidoPronto(B1), await pedidoPronto(B2), await pedidoPronto(B3)];
    const saida: SaidaEntrega = (await criarSaida(A, pizzaria, { entregadorId: paulo, pedidoIds: pedidos.map((pedido) => pedido.id) })).json();
    assert.equal((await liberarSaida(saida.id)).statusCode, 200);
    assert.equal((await ctx.api(P, "POST", `/entregas/saidas/${saida.id}/iniciar`)).statusCode, 200);
    return (await ctx.api(P, "GET", `/entregas/saidas/${saida.id}`)).json();
  }

  it("o entregador reordena a própria sequência e a versão avança", async () => {
    const saida = await saidaComTres();
    const invertida = [...saida.paradas].reverse().map((parada) => parada.pedidoId);

    const resposta = await ctx.api(P, "PATCH", `/entregas/saidas/${saida.id}/sequencia`, { versaoSequencia: saida.versaoSequencia, pedidoIds: invertida });
    assert.equal(resposta.statusCode, 200, resposta.body);
    const reordenada: SaidaEntrega = resposta.json();

    assert.deepEqual(reordenada.paradas.map((parada) => parada.pedidoId), invertida);
    assert.deepEqual(reordenada.paradas.map((parada) => parada.posicao), [1, 2, 3]);
    assert.equal(reordenada.versaoSequencia, saida.versaoSequencia + 1);
    // Reordenar preserva TODAS as paradas exatamente uma vez.
    assert.deepEqual([...reordenada.paradas.map((parada) => parada.pedidoId)].sort(), [...saida.paradas.map((parada) => parada.pedidoId)].sort());
  });

  it("versão antiga não sobrescreve sequência mais nova", async () => {
    const saida = await saidaComTres();
    const ordem = saida.paradas.map((parada) => parada.pedidoId);
    assert.equal((await ctx.api(P, "PATCH", `/entregas/saidas/${saida.id}/sequencia`, { versaoSequencia: saida.versaoSequencia, pedidoIds: [...ordem].reverse() })).statusCode, 200);

    const atrasada = await ctx.api(P, "PATCH", `/entregas/saidas/${saida.id}/sequencia`, { versaoSequencia: saida.versaoSequencia, pedidoIds: ordem });
    assert.equal(atrasada.statusCode, 409);
    assert.equal(atrasada.json().codigo, "SEQUENCIA_DESATUALIZADA");
    const atual: SaidaEntrega = (await ctx.api(P, "GET", `/entregas/saidas/${saida.id}`)).json();
    assert.deepEqual(atual.paradas.map((parada) => parada.pedidoId), [...ordem].reverse(), "a ordem mais nova continua valendo");
  });

  it("só o entregador da saída reordena; a empresa e outros não", async () => {
    const saida = await saidaComTres();
    const ordem = saida.paradas.map((parada) => parada.pedidoId);

    for (const pessoa of [C, B1, A]) {
      assert.equal((await ctx.api(pessoa, "PATCH", `/entregas/saidas/${saida.id}/sequencia`, { versaoSequencia: saida.versaoSequencia, pedidoIds: ordem })).statusCode, 404);
    }
    // Ordem inválida (faltando ou repetindo parada) é recusada.
    assert.equal((await ctx.api(P, "PATCH", `/entregas/saidas/${saida.id}/sequencia`, { versaoSequencia: saida.versaoSequencia, pedidoIds: ordem.slice(1) })).statusCode, 400);
    assert.equal((await ctx.api(P, "PATCH", `/entregas/saidas/${saida.id}/sequencia`, { versaoSequencia: saida.versaoSequencia, pedidoIds: [ordem[0], ordem[0], ordem[1]] })).statusCode, 400);
  });

  it("entrega concluída e cancelamento tiram a parada da sequência sem apagar histórico", async () => {
    const saida = await saidaComTres();
    const [primeiro, segundo, terceiro] = saida.paradas.map((parada) => parada.pedidoId);

    // saiu_para_entrega → entregue, sem a etapa redundante EM_ROTA.
    assert.equal((await avancar(primeiro as string, "saiu_para_entrega")).statusCode, 200);
    // Entregue: sai da sequência ativa, mas a parada continua registrada.
    // Cancelado: idem.
    assert.equal((await ctx.api(A, "POST", `/empresas/${pizzaria.id}/pedidos/${segundo}/cancelar`, { statusAtual: "saiu_para_entrega", motivo: "Cliente desistiu" })).statusCode, 200);

    const atual: SaidaEntrega = (await ctx.api(A, "GET", `/empresas/${pizzaria.id}/saidas/${saida.id}`)).json();
    assert.equal(atual.paradas.length, 3, "histórico das paradas permanece");
    const ativas = atual.paradas.filter((parada) => parada.encerradaEm === null);
    assert.deepEqual(ativas.map((parada) => parada.pedidoId), [terceiro]);
    assert.equal(atual.paradas.find((parada) => parada.pedidoId === primeiro)?.motivoEncerramento, "Pedido entregue");
    assert.equal(atual.status, "em_andamento");

    // Última parada concluída: a saída se encerra sozinha.
    assert.equal((await avancar(terceiro as string, "saiu_para_entrega")).statusCode, 200);
    const concluida: SaidaEntrega = (await ctx.api(A, "GET", `/empresas/${pizzaria.id}/saidas/${saida.id}`)).json();
    assert.equal(concluida.status, "concluida");
    assert.ok(concluida.concluidaEm);
  });

  it("pedido dentro de saída não é reatribuído individualmente", async () => {
    const saida = await saidaComTres();
    const pedidoId = saida.paradas[0]?.pedidoId as string;

    const recusa = await ctx.api(A, "POST", `/empresas/${pizzaria.id}/pedidos/${pedidoId}/entrega`, { entregadorId: carlos });
    assert.equal(recusa.statusCode, 409);
    assert.equal(recusa.json().codigo, "SAIDA_EM_ANDAMENTO");
    assert.equal((await ctx.api(P, "GET", `/entregas/${pedidoId}`)).statusCode, 200, "continua com quem está na saída");
    assert.equal((await ctx.api(C, "GET", `/entregas/${pedidoId}`)).statusCode, 404);
  });

  it("ficar indisponível depois não desfaz a saída já recebida", async () => {
    const saida = await saidaComTres();
    assert.equal((await ctx.api(P, "PATCH", `/entregas/vinculos/${paulo}`, { disponivel: false })).statusCode, 200);

    const minhas: ListaSaidas = (await ctx.api(P, "GET", "/entregas/saidas")).json();
    assert.ok(minhas.saidas.some((item) => item.id === saida.id), "a saída em andamento continua dele");
    assert.equal((await ctx.api(P, "GET", `/entregas/saidas/${saida.id}`)).statusCode, 200);
    // Mas nada novo entra.
    const novo = await pedidoPronto(B1);
    assert.equal((await criarSaida(A, pizzaria, { entregadorId: paulo, pedidoIds: [novo.id] })).statusCode, 409);

    assert.equal((await ctx.api(P, "PATCH", `/entregas/vinculos/${paulo}`, { disponivel: true })).statusCode, 200);
  });
});

describe("fila do cliente", () => {
  it("cada cliente recebe só a própria posição, derivada da sequência", async () => {
    const pedidos = [await pedidoPronto(B1), await pedidoPronto(B2), await pedidoPronto(B3)];
    const saida: SaidaEntrega = (await criarSaida(A, pizzaria, { entregadorId: paulo, pedidoIds: pedidos.map((pedido) => pedido.id) })).json();

    // Antes de sair, o cliente sabe que o pedido está separado — nunca "indo até você".
    const antes: FilaDoPedido = (await ctx.api(B1, "GET", `/pedidos/${pedidos[0]?.id}/fila`)).json();
    assert.equal(antes.situacao, "aguardando_saida");

    assert.equal((await liberarSaida(saida.id)).statusCode, 200);
    assert.equal((await ctx.api(P, "POST", `/entregas/saidas/${saida.id}/iniciar`)).statusCode, 200);
    const emOrdem: SaidaEntrega = (await ctx.api(P, "GET", `/entregas/saidas/${saida.id}`)).json();
    const ordem = emOrdem.paradas.map((parada) => parada.pedidoId);

    const donoDoPedido = new Map([[pedidos[0]?.id, B1], [pedidos[1]?.id, B2], [pedidos[2]?.id, B3]]);
    for (const [posicao, pedidoId] of ordem.entries()) {
      const cliente = donoDoPedido.get(pedidoId) as Pessoa;
      const fila: FilaDoPedido = (await ctx.api(cliente, "GET", `/pedidos/${pedidoId}/fila`)).json();
      assert.equal(fila.entregasAntes, posicao, `posição ${posicao}`);
      assert.equal(fila.situacao, posicao === 0 ? "indo_ate_voce" : "na_fila");
      // Só situação e número: nada de outros clientes, endereços ou pedidos.
      assert.deepEqual(Object.keys(fila).sort(), ["entregasAntes", "pedidoId", "situacao"]);
    }

    // Reordenar muda a fila de todo mundo, sem revelar nada a mais.
    const invertida = [...ordem].reverse();
    assert.equal((await ctx.api(P, "PATCH", `/entregas/saidas/${saida.id}/sequencia`, { versaoSequencia: emOrdem.versaoSequencia, pedidoIds: invertida })).statusCode, 200);
    const ultimoAgoraPrimeiro = donoDoPedido.get(invertida[0]) as Pessoa;
    const fila: FilaDoPedido = (await ctx.api(ultimoAgoraPrimeiro, "GET", `/pedidos/${invertida[0]}/fila`)).json();
    assert.equal(fila.situacao, "indo_ate_voce");
    assert.equal(fila.entregasAntes, 0);
  });

  it("o cliente não alcança a saída nem a fila de outro pedido", async () => {
    const pedido = await pedidoPronto(B1);
    const saida: SaidaEntrega = (await criarSaida(A, pizzaria, { entregadorId: paulo, pedidoIds: [pedido.id] })).json();

    assert.equal((await ctx.api(B2, "GET", `/pedidos/${pedido.id}/fila`)).statusCode, 404, "fila de pedido alheio");
    assert.equal((await ctx.api(B1, "GET", `/entregas/saidas/${saida.id}`)).statusCode, 404, "cliente não abre a saída");
    assert.equal((await ctx.api(B1, "GET", `/empresas/${pizzaria.id}/saidas`)).statusCode, 404);
    assert.equal((await ctx.api(B1, "GET", `/pedidos/${pedido.id}/fila`)).statusCode, 200, "mas vê a própria fila");
  });
});

describe("realtime da saída", () => {
  it("empresa e entregador recebem a saída; cada cliente recebe só a própria fila", async () => {
    const pedidos = [await pedidoPronto(B1), await pedidoPronto(B2)];
    const [socketEmpresa, socketPaulo, socketB1, socketB2, socketCarlos] = await Promise.all([
      ctx.conectar(como(A, pizzaria.identidadeId)),
      ctx.conectar(P),
      ctx.conectar(B1),
      ctx.conectar(B2),
      ctx.conectar(C),
    ]);
    const daEmpresa = coletar<EventoSaidaAtualizada>(socketEmpresa, EVENTO_SAIDA_ATUALIZADA);
    const doPaulo = coletar<EventoSaidaAtualizada>(socketPaulo, EVENTO_SAIDA_ATUALIZADA);
    const doCarlos = coletar<EventoSaidaAtualizada>(socketCarlos, EVENTO_SAIDA_ATUALIZADA);
    const saidaNoCliente = coletar<EventoSaidaAtualizada>(socketB1, EVENTO_SAIDA_ATUALIZADA);
    const filaB1 = coletar<EventoPedidoFila>(socketB1, EVENTO_PEDIDO_FILA);
    const filaB2 = coletar<EventoPedidoFila>(socketB2, EVENTO_PEDIDO_FILA);

    const saida: SaidaEntrega = (await criarSaida(A, pizzaria, { entregadorId: paulo, pedidoIds: pedidos.map((pedido) => pedido.id) })).json();
    await aguardarAte(() => daEmpresa.length >= 1 && doPaulo.length >= 1 && filaB1.length >= 1 && filaB2.length >= 1);

    assert.equal(daEmpresa[0]?.saida.id, saida.id);
    assert.equal(doPaulo[0]?.saida.paradas.length, 2);
    assert.equal(doCarlos.length, 0, "entregador de fora não recebe a saída");
    assert.equal(saidaNoCliente.length, 0, "o cliente NUNCA recebe a saída completa");
    // O cliente recebe só a própria posição.
    assert.equal(filaB1[0]?.pedidoId, pedidos[0]?.id);
    assert.deepEqual(Object.keys(filaB1[0] ?? {}).sort(), ["entregasAntes", "pedidoId", "situacao"]);

    // Reordenar avisa os dois lados e atualiza a fila de cada cliente.
    const emOrdem: SaidaEntrega = (await ctx.api(P, "GET", `/entregas/saidas/${saida.id}`)).json();
    const antesDaTroca = filaB1.length;
    assert.equal(
      (await ctx.api(P, "PATCH", `/entregas/saidas/${saida.id}/sequencia`, { versaoSequencia: emOrdem.versaoSequencia, pedidoIds: [...emOrdem.paradas.map((p) => p.pedidoId)].reverse() })).statusCode,
      200,
    );
    await aguardarAte(() => filaB1.length > antesDaTroca && daEmpresa.length >= 2);
    assert.equal(saidaNoCliente.length, 0);
  });
});

describe("saída no banco", () => {
  it("guarda quem montou, quando, o entregador e a sequência inicial", async () => {
    const pedidos = [await pedidoPronto(B1), await pedidoPronto(B2)];
    const saida: SaidaEntrega = (await criarSaida(A, pizzaria, { entregadorId: paulo, pedidoIds: pedidos.map((pedido) => pedido.id) })).json();

    const [registro] = await ctx.banco.select().from(saidasEntrega).where(eq(saidasEntrega.id, saida.id));
    assert.equal(registro?.entregadorId, paulo);
    assert.equal(registro?.empresaId, pizzaria.id);
    assert.equal(typeof registro?.criadaPorUsuarioId, "string", "auditoria interna de quem montou");
    assert.equal(registro?.versaoSequencia, 1);
    // A auditoria nunca é serializada para ninguém.
    assert.equal(JSON.stringify(saida).includes(registro?.criadaPorUsuarioId ?? "impossível"), false);
  });
});
