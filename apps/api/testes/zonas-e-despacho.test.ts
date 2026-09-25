import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { saidasEntrega } from "@jaa/banco/schema";
import {
  EVENTO_SAIDA_ATUALIZADA,
  type Empresa,
  type EventoSaidaAtualizada,
  type ListaSaidas,
  type ListaZonas,
  type PainelDespacho,
  type Pedido,
  type Produto,
  type SaidaEntrega,
  type ZonaEntrega,
} from "@jaa/contratos";
import { eq } from "drizzle-orm";
import {
  aguardarAte,
  coletar,
  criarAmbienteIntegracao,
  type Pessoa,
} from "./apoio/integracao.js";
import {
  despacharPendentes,
  processarFormacoesVencidas,
} from "../src/features/entregas/casos-de-uso/despacho-automatico.js";

/*
 * Integração REAL de ZONAS + FORMAÇÃO AUTOMÁTICA + COMBINAÇÃO + DESPACHO PELO PRIMEIRO DA FILA.
 *
 * A = dona da Pizzaria (e da Padaria, para o isolamento); P/C = entregadores; B1..B3 = clientes.
 * O tempo é controlado empurrando o prazo gravado no banco para o passado — nada de esperar 15 min.
 */

const PREFIXO = `zon${randomUUID().slice(0, 4)}`;
const ctx = criarAmbienteIntegracao({
  telefones: [
    "+5531987653001",
    "+5531987653002",
    "+5531987653003",
    "+5531987653004",
    "+5531987653005",
    "+5531987653006",
  ],
  prefixoIp: "198.18.16.",
});

// Zona A e Zona B: quadrados vizinhos (dividem a divisa, sem área comum).
const ZONA_A = [
  { latitude: -19.93, longitude: -43.95 },
  { latitude: -19.93, longitude: -43.93 },
  { latitude: -19.91, longitude: -43.93 },
  { latitude: -19.91, longitude: -43.95 },
];
const ZONA_B = [
  { latitude: -19.93, longitude: -43.93 },
  { latitude: -19.93, longitude: -43.91 },
  { latitude: -19.91, longitude: -43.91 },
  { latitude: -19.91, longitude: -43.93 },
];
const PONTO_A = { latitude: -19.92, longitude: -43.94 };
const PONTO_B = { latitude: -19.92, longitude: -43.92 };
const PONTO_FORA = { latitude: -19.85, longitude: -43.8 };

let A: Pessoa;
let P: Pessoa;
let C: Pessoa;
let B1: Pessoa;
let B2: Pessoa;
let B3: Pessoa;
let pizzaria: Empresa;
let padaria: Empresa;
let pizza: Produto;
let paulo = "";
let carlos = "";
let zonaA: ZonaEntrega;
let zonaB: ZonaEntrega;
const conversas = new Map<string, string>();

const despacho = () => ({
  banco: ctx.banco,
  eventosEntregas: ctx.eventosEntregas,
});

const avancar = (pedidoId: string, statusAtual: string) =>
  ctx.api(A, "POST", `/empresas/${pizzaria.id}/pedidos/${pedidoId}/avancar`, {
    statusAtual,
  });

// Cada pedido nasce com um endereço próprio confirmado NAQUELE ponto: é o snapshot que classifica.
async function pedidoProntoEm(
  cliente: Pessoa,
  ponto: { latitude: number; longitude: number },
): Promise<Pedido> {
  const enderecoId = await ctx.criarEnderecoConfirmado(
    cliente,
    {
      apelido: `Casa ${randomUUID().slice(0, 6)}`,
      numero: `${Math.floor(Math.random() * 900) + 100}`,
    },
    ponto,
  );
  const resposta = await ctx.api(cliente, "POST", "/pedidos", {
    idCliente: randomUUID(),
    empresaIdentidadeId: pizzaria.identidadeId,
    conversaId: conversas.get(cliente.identidadeId),
    enderecoId,
    itens: [{ produtoId: pizza.id, quantidade: 1 }],
    pagamento: { forma: "cartao" },
  });
  assert.equal(resposta.statusCode, 201, resposta.body);
  let pedido: Pedido = resposta.json();
  for (const status of ["recebido", "em_preparacao"] as const) {
    const avanco = await avancar(pedido.id, status);
    assert.equal(avanco.statusCode, 200, avanco.body);
    pedido = avanco.json();
  }
  return pedido;
}

// Fecha o que estiver em formação: deixa o cenário seguinte começar do zero, sem herdar sobras.
async function fecharTodasAsFormacoes() {
  for (const saida of await listarSaidas()) {
    if (saida.status === "em_formacao")
      await ctx.api(
        A,
        "POST",
        `/empresas/${pizzaria.id}/saidas/${saida.id}/fechar`,
      );
  }
}

const listarSaidas = async (): Promise<SaidaEntrega[]> =>
  (
    (
      await ctx.api(A, "GET", `/empresas/${pizzaria.id}/saidas`)
    ).json() as ListaSaidas
  ).saidas;
const saidaDoPedido = async (pedidoId: string) =>
  (await listarSaidas()).find((saida) =>
    saida.paradas.some((parada) => parada.pedidoId === pedidoId),
  ) ?? null;

// Empurra o prazo da formação para o passado: é o "relógio controlável" do fechamento por tempo.
async function vencerFormacao(saidaId: string) {
  await ctx.banco
    .update(saidasEntrega)
    .set({
      prazoFormacaoEm: new Date(Date.now() - 60_000),
      formacaoIniciadaEm: new Date(Date.now() - 120_000),
    })
    .where(eq(saidasEntrega.id, saidaId));
}

// Coloca o entregador na base (o servidor é quem decide presença) para ele entrar na fila.
async function entrarNaBase(pessoa: Pessoa, entregadorId: string, vezes = 2) {
  for (let i = 0; i < vezes; i++) {
    const resposta = await ctx.api(
      pessoa,
      "POST",
      `/entregas/vinculos/${entregadorId}/localizacao`,
      {
        latitude: -19.9,
        longitude: -43.9,
        precisaoMetros: 10,
        medidaEm: new Date().toISOString(),
      },
    );
    assert.equal(resposta.statusCode, 200, resposta.body);
  }
}

async function sairDaBase(pessoa: Pessoa, entregadorId: string) {
  for (let i = 0; i < 2; i++) {
    await ctx.api(
      pessoa,
      "POST",
      `/entregas/vinculos/${entregadorId}/localizacao`,
      {
        latitude: -19.99,
        longitude: -43.99,
        precisaoMetros: 10,
        medidaEm: new Date().toISOString(),
      },
    );
  }
}

before(async () => {
  await ctx.iniciar();
  A = await ctx.criarPessoa(0, `${PREFIXO}_a`, "Ana da Pizzaria");
  P = await ctx.criarPessoa(1, `${PREFIXO}_p`, "Paulo Entregador");
  C = await ctx.criarPessoa(2, `${PREFIXO}_c`, "Carlos Entregador");
  B1 = await ctx.criarPessoa(3, `${PREFIXO}_b1`, "Bruna Um");
  B2 = await ctx.criarPessoa(4, `${PREFIXO}_b2`, "Bento Dois");
  B3 = await ctx.criarPessoa(5, `${PREFIXO}_b3`, "Bia Três");

  pizzaria = (
    await ctx.api(A, "POST", "/empresas", {
      nome: "Pizzaria Zona",
      nomeUsuario: `${PREFIXO}_pizza`,
      slug: `${PREFIXO}-pizzaria`,
    })
  ).json();
  padaria = (
    await ctx.api(A, "POST", "/empresas", {
      nome: "Padaria Zona",
      nomeUsuario: `${PREFIXO}_pada`,
      slug: `${PREFIXO}-padaria`,
    })
  ).json();
  pizza = (
    await ctx.api(A, "POST", `/empresas/${pizzaria.id}/produtos`, {
      nome: "Pizza Calabresa",
      precoCentavos: 3990,
    })
  ).json();

  for (const cliente of [B1, B2, B3])
    conversas.set(
      cliente.identidadeId,
      await ctx.abrirConversa(cliente, `${PREFIXO}_pizza`),
    );

  paulo = await ctx.criarEntregadorAtivo(A, pizzaria.id, P, `${PREFIXO}_p`);
  carlos = await ctx.criarEntregadorAtivo(A, pizzaria.id, C, `${PREFIXO}_c`);

  // Base confirmada: sem ponto da base não existe presença nem fila (etapa anterior).
  await ctx.api(A, "POST", `/empresas/${pizzaria.id}/base`, {
    cep: "30123-000",
    logradouro: "Avenida Afonso Pena",
    numero: "1000",
    bairro: "Centro",
    cidade: "Belo Horizonte",
    uf: "MG",
    raioMetros: 150,
  });
  await ctx.api(A, "POST", `/empresas/${pizzaria.id}/base/localizacao`, {
    latitude: -19.9,
    longitude: -43.9,
  });
});

after(() => ctx.encerrar());

describe("zonas de entrega", () => {
  it("a empresa desenha o polígono e a zona nasce ativa", async () => {
    const resposta = await ctx.api(
      A,
      "POST",
      `/empresas/${pizzaria.id}/zonas`,
      { nome: "Zona A", vertices: ZONA_A },
    );
    assert.equal(resposta.statusCode, 201, resposta.body);
    zonaA = resposta.json();
    assert.equal(zonaA.ativa, true);
    assert.equal(zonaA.vertices.length, 4);

    const respostaB = await ctx.api(
      A,
      "POST",
      `/empresas/${pizzaria.id}/zonas`,
      { nome: "Zona B", vertices: ZONA_B },
    );
    assert.equal(respostaB.statusCode, 201, respostaB.body);
    zonaB = respostaB.json();
    // Vizinhas que só dividem a divisa convivem normalmente.
    assert.equal(
      (
        (
          await ctx.api(A, "GET", `/empresas/${pizzaria.id}/zonas`)
        ).json() as ListaZonas
      ).zonas.length,
      2,
    );
  });

  it("valida cobertura antes de confirmar o ponto e bloqueia pedido fora das zonas", async () => {
    const rascunho = {
      apelido: "Rascunho contextual",
      cep: "30123-000",
      logradouro: "Rua das Flores",
      numero: "10",
      bairro: "Centro",
      cidade: "Belo Horizonte",
      uf: "MG",
    };
    const antes = (await ctx.api(B1, "GET", "/enderecos")).json().enderecos
      .length as number;
    const sugestao = await ctx.api(
      B1,
      "POST",
      `/empresas/${pizzaria.identidadeId}/enderecos/sugestao-localizacao`,
      rascunho,
    );
    assert.equal(sugestao.statusCode, 200, sugestao.body);
    assert.equal(sugestao.json().coordenadas, null);
    assert.equal(
      (await ctx.api(B1, "GET", "/enderecos")).json().enderecos.length,
      antes,
    );

    const salvarFora = await ctx.api(
      B1,
      "POST",
      `/empresas/${pizzaria.identidadeId}/enderecos`,
      { endereco: rascunho, coordenadas: PONTO_FORA },
    );
    assert.equal(salvarFora.statusCode, 409, salvarFora.body);
    assert.equal(salvarFora.json().codigo, "ENDERECO_FORA_AREA_ENTREGA");
    assert.equal(
      (await ctx.api(B1, "GET", "/enderecos")).json().enderecos.length,
      antes,
    );

    const salvarDentro = await ctx.api(
      B1,
      "POST",
      `/empresas/${pizzaria.identidadeId}/enderecos`,
      { endereco: rascunho, coordenadas: PONTO_A },
    );
    assert.equal(salvarDentro.statusCode, 201, salvarDentro.body);
    assert.equal(salvarDentro.json().latitude, PONTO_A.latitude);
    assert.ok(salvarDentro.json().localizacaoConfirmadaEm);

    const dentro = await ctx.api(
      B1,
      "POST",
      `/empresas/${pizzaria.identidadeId}/cobertura-entrega`,
      PONTO_A,
    );
    assert.equal(dentro.statusCode, 200, dentro.body);
    assert.deepEqual(dentro.json(), {
      atendida: true,
      zonasConfiguradas: true,
    });

    const fora = await ctx.api(
      B1,
      "POST",
      `/empresas/${pizzaria.identidadeId}/cobertura-entrega`,
      PONTO_FORA,
    );
    assert.equal(fora.statusCode, 200, fora.body);
    assert.deepEqual(fora.json(), { atendida: false, zonasConfiguradas: true });

    const cadastro = await ctx.api(B1, "POST", "/enderecos", {
      apelido: "Fora",
      cep: "30123-000",
      logradouro: "Rua Fora",
      numero: "10",
      bairro: "Outro bairro",
      cidade: "Belo Horizonte",
      uf: "MG",
    });
    assert.equal(cadastro.statusCode, 201, cadastro.body);
    const enderecoId = cadastro.json().id as string;
    const confirmacaoFora = await ctx.api(
      B1,
      "POST",
      `/enderecos/${enderecoId}/localizacao/empresas/${pizzaria.identidadeId}`,
      PONTO_FORA,
    );
    assert.equal(confirmacaoFora.statusCode, 409);
    assert.equal(confirmacaoFora.json().codigo, "ENDERECO_FORA_AREA_ENTREGA");

    const confirmacaoDentro = await ctx.api(
      B1,
      "POST",
      `/enderecos/${enderecoId}/localizacao/empresas/${pizzaria.identidadeId}`,
      PONTO_A,
    );
    assert.equal(confirmacaoDentro.statusCode, 200, confirmacaoDentro.body);

    const enderecoFora = await ctx.criarEnderecoConfirmado(
      B1,
      { apelido: "Fora para pedido", numero: "11" },
      PONTO_FORA,
    );
    const pedidoFora = await ctx.api(B1, "POST", "/pedidos", {
      idCliente: randomUUID(),
      empresaIdentidadeId: pizzaria.identidadeId,
      conversaId: conversas.get(B1.identidadeId),
      enderecoId: enderecoFora,
      itens: [{ produtoId: pizza.id, quantidade: 1 }],
      pagamento: { forma: "cartao" },
    });
    assert.equal(pedidoFora.statusCode, 409);
    assert.equal(pedidoFora.json().codigo, "ENDERECO_FORA_AREA_ENTREGA");
  });

  it("recusa polígono inválido e área sobreposta a outra zona ativa", async () => {
    const poucosPontos = await ctx.api(
      A,
      "POST",
      `/empresas/${pizzaria.id}/zonas`,
      { nome: "Curta", vertices: ZONA_A.slice(0, 2) },
    );
    assert.equal(poucosPontos.statusCode, 400);

    const comLaco = await ctx.api(A, "POST", `/empresas/${pizzaria.id}/zonas`, {
      nome: "Gravata",
      vertices: [ZONA_A[0], ZONA_A[2], ZONA_A[1], ZONA_A[3]],
    });
    assert.equal(comLaco.statusCode, 400);
    assert.equal(comLaco.json().codigo, "ZONA_INVALIDA");

    const sobreposta = await ctx.api(
      A,
      "POST",
      `/empresas/${pizzaria.id}/zonas`,
      {
        nome: "Invasora",
        vertices: [
          { latitude: -19.925, longitude: -43.945 },
          { latitude: -19.925, longitude: -43.935 },
          { latitude: -19.915, longitude: -43.935 },
          { latitude: -19.915, longitude: -43.945 },
        ],
      },
    );
    assert.equal(sobreposta.statusCode, 409);
    assert.equal(sobreposta.json().codigo, "ZONAS_SOBREPOSTAS");
    assert.ok(
      String(sobreposta.json().mensagem).includes("Zona A"),
      "a mensagem diz qual zona conflita",
    );

    const nomeRepetido = await ctx.api(
      A,
      "POST",
      `/empresas/${pizzaria.id}/zonas`,
      {
        nome: "zona a",
        vertices: [
          { latitude: -19.89, longitude: -43.89 },
          { latitude: -19.89, longitude: -43.87 },
          { latitude: -19.87, longitude: -43.87 },
        ],
      },
    );
    assert.equal(nomeRepetido.statusCode, 409);
  });

  it("zona é da empresa: outra empresa e o cliente não leem nem editam", async () => {
    assert.equal(
      (await ctx.api(B1, "GET", `/empresas/${pizzaria.id}/zonas`)).statusCode,
      404,
    );
    assert.equal(
      (await ctx.api(P, "GET", `/empresas/${pizzaria.id}/zonas`)).statusCode,
      404,
      "entregador não é administrador",
    );
    assert.equal(
      (
        await ctx.api(A, "PATCH", `/empresas/${padaria.id}/zonas/${zonaA.id}`, {
          nome: "Roubada",
          vertices: ZONA_A,
        })
      ).statusCode,
      404,
    );
    assert.equal(
      (
        (
          await ctx.api(A, "GET", `/empresas/${padaria.id}/zonas`)
        ).json() as ListaZonas
      ).zonas.length,
      0,
    );
  });

  it("editar nome/desenho e desativar continuam disponíveis", async () => {
    const renomeada = await ctx.api(
      A,
      "PATCH",
      `/empresas/${pizzaria.id}/zonas/${zonaB.id}`,
      { nome: "Zona B (leste)", vertices: ZONA_B },
    );
    assert.equal(renomeada.statusCode, 200, renomeada.body);
    assert.equal((renomeada.json() as ZonaEntrega).nome, "Zona B (leste)");

    const desativada = await ctx.api(
      A,
      "PATCH",
      `/empresas/${pizzaria.id}/zonas/${zonaB.id}`,
      { nome: "Zona B (leste)", vertices: ZONA_B, ativa: false },
    );
    assert.equal((desativada.json() as ZonaEntrega).ativa, false);
    // Volta a ativa para os testes seguintes.
    zonaB = (
      await ctx.api(A, "PATCH", `/empresas/${pizzaria.id}/zonas/${zonaB.id}`, {
        nome: "Zona B (leste)",
        vertices: ZONA_B,
        ativa: true,
      })
    ).json();
  });
});

describe("formação automática", () => {
  it("pedido pronto entra na formação da zona dele; o segundo entra na MESMA saída", async () => {
    await ctx.api(A, "POST", `/empresas/${pizzaria.id}/despacho`, {
      maxPedidosPorSaida: 3,
      tempoFormacaoMinutos: 15,
      combinarZonas: false,
    });

    const primeiro = await pedidoProntoEm(B1, PONTO_A);
    const saida = await saidaDoPedido(primeiro.id);
    assert.ok(saida, "o pedido pronto criou uma saída em formação");
    assert.equal(saida.status, "em_formacao");
    assert.equal(saida.automatica, true);
    assert.equal(
      saida.entregador,
      null,
      "em formação ainda não tem entregador",
    );
    assert.equal(saida.zonaPrincipal?.nome, "Zona A");
    assert.ok(saida.prazoFormacaoEm, "o prazo fica persistido no banco");

    const segundo = await pedidoProntoEm(B2, PONTO_A);
    const mesma = await saidaDoPedido(segundo.id);
    assert.equal(
      mesma?.id,
      saida.id,
      "não abre uma segunda saída da mesma zona à toa",
    );
    assert.equal(mesma?.paradas.length, 2);
    // Entrar em formação NÃO avança o pedido: ele continua pronto.
    assert.equal(
      (
        await ctx.api(
          A,
          "GET",
          `/empresas/${pizzaria.id}/pedidos/${primeiro.id}`,
        )
      ).json().status,
      "pronto",
    );
  });

  it("pedido de outra zona forma a própria saída", async () => {
    const naZonaA = await pedidoProntoEm(B1, PONTO_A);
    const pedidoB = await pedidoProntoEm(B3, PONTO_B);
    const saidaA = await saidaDoPedido(naZonaA.id);
    const saidaB = await saidaDoPedido(pedidoB.id);
    assert.equal(saidaA?.zonaPrincipal?.nome, "Zona A");
    assert.equal(saidaB?.zonaPrincipal?.nome, "Zona B (leste)");
    assert.notEqual(saidaB?.id, saidaA?.id, "cada zona forma a própria saída");
  });

  it("ao atingir a quantidade máxima a saída fecha sozinha e a próxima começa vazia", async () => {
    await fecharTodasAsFormacoes();
    // Máximo 3: o terceiro pedido da zona fecha a saída.
    await pedidoProntoEm(B1, PONTO_A);
    await pedidoProntoEm(B2, PONTO_A);
    const terceiro = await pedidoProntoEm(B1, PONTO_A);
    const fechada = await saidaDoPedido(terceiro.id);
    assert.equal(fechada?.paradas.length, 3);
    assert.notEqual(fechada?.status, "em_formacao");
    assert.ok(fechada?.fechadaEm, "fechada tem data de fechamento");
    assert.ok(
      fechada?.liberadaEm,
      "quantidade libera automaticamente quando a opção está ativa",
    );

    const quarto = await pedidoProntoEm(B2, PONTO_A);
    const nova = await saidaDoPedido(quarto.id);
    assert.notEqual(
      nova?.id,
      fechada?.id,
      "o pedido seguinte abre uma NOVA formação da zona",
    );
    assert.equal(nova?.status, "em_formacao");
    assert.equal(nova?.paradas.length, 1);
    // Nunca ultrapassa o limite configurado.
    for (const saida of await listarSaidas())
      assert.ok(
        saida.paradas.filter((parada) => parada.encerradaEm === null).length <=
          3,
        saida.id,
      );
  });

  it("pedido fora de todas as zonas é bloqueado antes de entrar na automação", async () => {
    const enderecoId = await ctx.criarEnderecoConfirmado(
      B3,
      { apelido: "Fora da cobertura", numero: "999" },
      PONTO_FORA,
    );
    const resposta = await ctx.api(B3, "POST", "/pedidos", {
      idCliente: randomUUID(),
      empresaIdentidadeId: pizzaria.identidadeId,
      conversaId: conversas.get(B3.identidadeId),
      enderecoId,
      itens: [{ produtoId: pizza.id, quantidade: 1 }],
      pagamento: { forma: "cartao" },
    });
    assert.equal(resposta.statusCode, 409);
    assert.equal(resposta.json().codigo, "ENDERECO_FORA_AREA_ENTREGA");
  });
});

describe("fechamento por tempo e combinação de zonas", () => {
  it("sem combinação autorizada, a saída vencida fecha sozinha", async () => {
    await ctx.api(A, "POST", `/empresas/${pizzaria.id}/despacho`, {
      maxPedidosPorSaida: 5,
      tempoFormacaoMinutos: 15,
      combinarZonas: false,
    });
    await fecharTodasAsFormacoes();
    const pedido = await pedidoProntoEm(B1, PONTO_A);
    const emFormacao = await saidaDoPedido(pedido.id);
    assert.equal(emFormacao?.status, "em_formacao");

    await vencerFormacao(emFormacao?.id ?? "");
    await processarFormacoesVencidas(despacho());

    const depois = await saidaDoPedido(pedido.id);
    assert.notEqual(depois?.status, "em_formacao");
    assert.ok(
      depois?.liberadaEm,
      "tempo libera automaticamente quando a opção está ativa",
    );
    assert.deepEqual(
      depois?.zonasCombinadas,
      [],
      "não juntou ninguém: combinar estava desligado",
    );
  });

  it("com combinação autorizada, zonas compatíveis viram uma saída só — sem passar do limite", async () => {
    await ctx.api(A, "POST", `/empresas/${pizzaria.id}/despacho`, {
      maxPedidosPorSaida: 3,
      tempoFormacaoMinutos: 15,
      combinarZonas: true,
    });
    await fecharTodasAsFormacoes();
    const compatibilidade = await ctx.api(
      A,
      "POST",
      `/empresas/${pizzaria.id}/zonas/${zonaA.id}/compatibilidades`,
      { zonaIds: [zonaB.id] },
    );
    assert.equal(compatibilidade.statusCode, 200, compatibilidade.body);
    // A relação é simétrica: marcar em A também vale para B.
    const zonas = (compatibilidade.json() as ListaZonas).zonas;
    assert.deepEqual(
      zonas.find((zona) => zona.id === zonaB.id)?.compativeisCom,
      [zonaA.id],
    );

    // Zona A com 2 pedidos (capacidade para mais 1) e zona B com 2: só o mais antigo de B cabe.
    const naZonaA1 = await pedidoProntoEm(B1, PONTO_A);
    await pedidoProntoEm(B2, PONTO_A);
    const naZonaB1 = await pedidoProntoEm(B2, PONTO_B);
    const naZonaB2 = await pedidoProntoEm(B3, PONTO_B);
    const formacaoA = await saidaDoPedido(naZonaA1.id);
    const formacaoB = await saidaDoPedido(naZonaB1.id);
    assert.notEqual(formacaoA?.id, formacaoB?.id);

    await vencerFormacao(formacaoA?.id ?? "");
    await processarFormacoesVencidas(despacho());

    const combinada = await saidaDoPedido(naZonaA1.id);
    assert.equal(
      combinada?.paradas.filter((parada) => parada.encerradaEm === null).length,
      3,
      "encheu até o máximo configurado",
    );
    assert.ok(
      combinada?.zonasCombinadas.some((zona) => zona.id === zonaB.id),
      "a saída mostra a zona combinada",
    );
    assert.equal(
      (await saidaDoPedido(naZonaB1.id))?.id,
      combinada?.id,
      "o pedido mais antigo de B foi o que entrou",
    );
    // O excedente permanece: continua em formação na zona de origem.
    const restante = await saidaDoPedido(naZonaB2.id);
    assert.equal(restante?.status, "em_formacao");
    assert.notEqual(restante?.id, combinada?.id);
  });

  it("zonas incompatíveis nunca são combinadas", async () => {
    await ctx.api(
      A,
      "POST",
      `/empresas/${pizzaria.id}/zonas/${zonaA.id}/compatibilidades`,
      { zonaIds: [] },
    );
    await fecharTodasAsFormacoes();

    const naZonaA = await pedidoProntoEm(B1, PONTO_A);
    const naZonaB = await pedidoProntoEm(B2, PONTO_B);
    const formacaoA = await saidaDoPedido(naZonaA.id);
    const formacaoB = await saidaDoPedido(naZonaB.id);

    await vencerFormacao(formacaoA?.id ?? "");
    await processarFormacoesVencidas(despacho());

    const depois = await saidaDoPedido(naZonaA.id);
    assert.equal(
      depois?.paradas.length,
      1,
      "ficou sozinha: a compatibilidade foi removida",
    );
    assert.deepEqual(depois?.zonasCombinadas, []);
    assert.equal(
      (await saidaDoPedido(naZonaB.id))?.id,
      formacaoB?.id,
      "a zona B continua com o pedido dela",
    );
  });

  it("o prazo vencido é reconhecido depois de um restart (ele vive no banco)", async () => {
    await fecharTodasAsFormacoes();
    const pedido = await pedidoProntoEm(B2, PONTO_A);
    const formacao = await saidaDoPedido(pedido.id);
    await vencerFormacao(formacao?.id ?? "");

    // Simula a API subindo de novo: nenhum timer em memória, só o prazo persistido.
    const fechadas = await processarFormacoesVencidas({
      banco: ctx.banco,
      eventosEntregas: ctx.eventosEntregas,
    });
    assert.ok(
      fechadas.includes(formacao?.id ?? ""),
      "o vencimento não se perde com o processo reiniciado",
    );
  });
});

describe("despacho pelo primeiro entregador apto da fila", () => {
  it("quem está fora da base ou inapto nunca é escolhido; sem ninguém, a saída aguarda", async () => {
    await sairDaBase(P, paulo);
    await sairDaBase(C, carlos);
    await fecharTodasAsFormacoes();

    const pedido = await pedidoProntoEm(B1, PONTO_A);
    const formacao = await saidaDoPedido(pedido.id);
    await vencerFormacao(formacao?.id ?? "");
    await processarFormacoesVencidas(despacho());

    const aguardando = await saidaDoPedido(pedido.id);
    assert.equal(aguardando?.status, "aguardando_entregador");
    assert.equal(
      aguardando?.entregador,
      null,
      "ninguém fora da base é escolhido",
    );
    // Nada é cancelado e nenhum pedido volta atrás.
    assert.equal(
      (
        await ctx.api(A, "GET", `/empresas/${pizzaria.id}/pedidos/${pedido.id}`)
      ).json().status,
      "pronto",
    );
  });

  it("entregador entra na fila e a saída pendente é despachada automaticamente", async () => {
    const eventos = coletar<EventoSaidaAtualizada>(
      await ctx.conectar(P),
      EVENTO_SAIDA_ATUALIZADA,
    );
    await entrarNaBase(P, paulo);

    await aguardarAte(async () =>
      (await listarSaidas()).some(
        (saida) =>
          saida.status === "liberada_retirada" &&
          saida.entregador?.nomeExibicao === "Paulo Entregador",
      ),
    );
    const atribuida = (await listarSaidas()).find(
      (saida) =>
        saida.status === "liberada_retirada" &&
        saida.entregador?.nomeExibicao === "Paulo Entregador",
    );
    assert.ok(atribuida, "a saída que esperava foi para o primeiro da fila");
    assert.ok(atribuida.atribuidaEm, "a atribuição ficou registrada");
    assert.ok(atribuida.liberadaEm, "a liberação automática ficou registrada");
    assert.equal(
      atribuida.iniciadaEm,
      null,
      "atribuir não é iniciar: os pedidos continuam na loja",
    );

    // O entregador recebe a saída dele em tempo real (e só a dele).
    await aguardarAte(() =>
      eventos.some((evento) => evento.saida.id === atribuida.id),
    );
    // Recebeu saída: saiu da fila da base.
    const situacoes = (await ctx.api(P, "GET", "/entregas/situacao")).json();
    assert.equal(
      situacoes.situacoes.find(
        (item: { entregadorId: string }) => item.entregadorId === paulo,
      ).posicaoFila,
      null,
    );
  });

  it("duas saídas fechando não recebem o mesmo entregador; a mais antiga vai primeiro", async () => {
    // Paulo já está com uma saída; Carlos ainda não entrou na base.
    const naZonaA = await pedidoProntoEm(B1, PONTO_A);
    const naZonaB = await pedidoProntoEm(B2, PONTO_B);
    for (const pedido of [naZonaA, naZonaB]) {
      const formacao = await saidaDoPedido(pedido.id);
      await vencerFormacao(formacao?.id ?? "");
    }
    await processarFormacoesVencidas(despacho());

    const pendentes = (await listarSaidas()).filter(
      (saida) => saida.status === "aguardando_entregador",
    );
    assert.ok(pendentes.length >= 2, "as duas fecharam e ficaram esperando");

    await entrarNaBase(C, carlos);
    await aguardarAte(async () =>
      (await listarSaidas()).some(
        (saida) => saida.entregador?.nomeExibicao === "Carlos Entregador",
      ),
    );

    const comCarlos = (await listarSaidas()).filter(
      (saida) =>
        saida.entregador?.nomeExibicao === "Carlos Entregador" &&
        saida.status === "liberada_retirada",
    );
    assert.equal(comCarlos.length, 1, "Carlos recebeu UMA saída, não as duas");
    // A escolhida é a que espera há mais tempo (pedido mais antigo).
    const maisAntigaPendente = pendentes.sort((a, b) =>
      a.criadoEm < b.criadoEm ? -1 : 1,
    )[0];
    assert.equal(comCarlos[0]?.id, maisAntigaPendente?.id);
    // A outra continua esperando: ninguém elegível sobrou.
    assert.ok(
      (await listarSaidas()).some(
        (saida) => saida.status === "aguardando_entregador",
      ),
    );
  });

  it("entregador de outra empresa nunca é usado, e o cliente não vê nada do despacho", async () => {
    // Carlos tem vínculo só com a pizzaria: a padaria não o alcança.
    assert.equal(
      (await ctx.api(A, "GET", `/empresas/${padaria.id}/despacho`)).json()
        .automacaoAtiva,
      false,
    );
    const despachadasNaPadaria = await despacharPendentes(
      despacho(),
      padaria.id,
    );
    assert.deepEqual(
      despachadasNaPadaria,
      [],
      "a padaria não despacha saída da pizzaria",
    );

    assert.equal(
      (await ctx.api(B1, "GET", `/empresas/${pizzaria.id}/despacho`))
        .statusCode,
      404,
    );
    assert.equal(
      (await ctx.api(B1, "GET", `/empresas/${pizzaria.id}/saidas`)).statusCode,
      404,
    );
    assert.equal(
      (await ctx.api(P, "GET", `/empresas/${pizzaria.id}/despacho`)).statusCode,
      404,
    );
  });
});

describe("controle do gestor e regra absoluta da saída iniciada", () => {
  it("com liberação automática desativada, o limite prepara a rota mas exige o gestor", async () => {
    await fecharTodasAsFormacoes();
    const configurada = await ctx.api(
      A,
      "POST",
      `/empresas/${pizzaria.id}/despacho`,
      {
        maxPedidosPorSaida: 1,
        tempoFormacaoMinutos: 15,
        combinarZonas: false,
        liberacaoAutomatica: false,
      },
    );
    assert.equal(configurada.statusCode, 200, configurada.body);
    assert.equal(
      (configurada.json() as PainelDespacho).configuracao.liberacaoAutomatica,
      false,
    );

    const pedido = await pedidoProntoEm(B3, PONTO_A);
    const preparada = await saidaDoPedido(pedido.id);
    assert.notEqual(preparada?.status, "em_formacao");
    assert.equal(
      preparada?.liberadaEm,
      null,
      "atingir o limite não autoriza a retirada",
    );
    assert.ok(
      preparada?.rota,
      "a rota já está organizada antes da decisão do gestor",
    );

    const liberada = await ctx.api(
      A,
      "POST",
      `/empresas/${pizzaria.id}/saidas/${preparada?.id}/liberar`,
    );
    assert.equal(liberada.statusCode, 200, liberada.body);
    assert.ok((liberada.json() as SaidaEntrega).liberadaEm);
    await ctx.api(A, "POST", `/empresas/${pizzaria.id}/despacho`, {
      liberacaoAutomatica: true,
      maxPedidosPorSaida: 3,
    });
  });

  it("o gestor libera antecipadamente uma saída em formação, já com a rota planejada", async () => {
    const pedido = await pedidoProntoEm(B3, PONTO_A);
    const formacao = await saidaDoPedido(pedido.id);
    assert.equal(formacao?.status, "em_formacao");

    const fechada = await ctx.api(
      A,
      "POST",
      `/empresas/${pizzaria.id}/saidas/${formacao?.id}/liberar`,
    );
    assert.equal(fechada.statusCode, 200, fechada.body);
    assert.notEqual((fechada.json() as SaidaEntrega).status, "em_formacao");
    assert.ok((fechada.json() as SaidaEntrega).liberadaEm);
    assert.ok(
      (fechada.json() as SaidaEntrega).rota,
      "a rota foi organizada antes da liberação",
    );

    // Liberar de novo não faz sentido e é recusado com clareza.
    const repetido = await ctx.api(
      A,
      "POST",
      `/empresas/${pizzaria.id}/saidas/${formacao?.id}/liberar`,
    );
    assert.equal(repetido.statusCode, 409);
    assert.equal(repetido.json().codigo, "SAIDA_NAO_PODE_SER_LIBERADA");
  });

  it("saída iniciada NUNCA recebe pedido novo, nem da mesma zona", async () => {
    const emAndamento = (await listarSaidas()).find(
      (saida) => saida.status === "liberada_retirada",
    );
    assert.ok(emAndamento, "há uma saída liberada para o entregador iniciar");
    const pessoaEntregadora =
      emAndamento.entregador?.nomeExibicao === "Carlos Entregador" ? C : P;
    const iniciada = await ctx.api(
      pessoaEntregadora,
      "POST",
      `/entregas/saidas/${emAndamento.id}/iniciar`,
    );
    assert.equal(iniciada.statusCode, 200, iniciada.body);
    assert.equal((iniciada.json() as SaidaEntrega).status, "em_andamento");
    const paradasAntes = (iniciada.json() as SaidaEntrega).paradas.length;

    const novo = await pedidoProntoEm(B1, PONTO_A);
    const saidaDoNovo = await saidaDoPedido(novo.id);
    assert.notEqual(
      saidaDoNovo?.id,
      emAndamento.id,
      "o pedido novo foi para outra saída",
    );

    const depois = (await listarSaidas()).find(
      (saida) => saida.id === emAndamento.id,
    );
    assert.equal(
      depois?.paradas.length,
      paradasAntes,
      "a saída iniciada não mudou",
    );
    // Os pedidos daquela saída avançaram pela máquina de estados de sempre.
    assert.equal(
      (
        await ctx.api(
          A,
          "GET",
          `/empresas/${pizzaria.id}/pedidos/${emAndamento.paradas[0]?.pedidoId}`,
        )
      ).json().status,
      "saiu_para_entrega",
    );
  });

  it("pedido cancelado sai da formação e a saída continua consistente", async () => {
    const pedido = await pedidoProntoEm(B2, PONTO_B);
    const formacao = await saidaDoPedido(pedido.id);
    const quantidadeAntes =
      formacao?.paradas.filter((parada) => parada.encerradaEm === null)
        .length ?? 0;

    const cancelado = await ctx.api(
      A,
      "POST",
      `/empresas/${pizzaria.id}/pedidos/${pedido.id}/cancelar`,
      { statusAtual: "pronto", motivo: "Cliente desistiu" },
    );
    assert.equal(cancelado.statusCode, 200, cancelado.body);

    // Busca pelo id: saída concluída sai da lista de ativas, mas continua existindo no histórico.
    const depois: SaidaEntrega = (
      await ctx.api(A, "GET", `/empresas/${pizzaria.id}/saidas/${formacao?.id}`)
    ).json();
    const ativas = depois.paradas.filter(
      (parada) => parada.encerradaEm === null,
    ).length;
    assert.equal(ativas, quantidadeAntes - 1);
    // Saída que ficou sem pedido nenhum é encerrada, sem parada órfã nem capacidade fantasma.
    if (ativas === 0) assert.equal(depois.status, "concluida");
    else
      assert.equal(
        depois.status,
        "em_formacao",
        "com pedido restante, ela continua formando",
      );
  });
});
