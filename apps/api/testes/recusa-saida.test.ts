import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { recusasSaida } from "@jaa/banco/schema";
import type {
  Empresa,
  ListaSaidas,
  ListaVinculosEntregador,
  Pedido,
  Produto,
  SaidaEntrega,
} from "@jaa/contratos";
import { and, eq } from "drizzle-orm";
import { criarAmbienteIntegracao, type Pessoa } from "./apoio/integracao.js";

const PREFIXO = `rec${randomUUID().slice(0, 4)}`;
const ctx = criarAmbienteIntegracao({
  telefones: [
    "+5531987657101",
    "+5531987657102",
    "+5531987657103",
    "+5531987657104",
  ],
  prefixoIp: "198.18.71.",
});

let gestora: Pessoa;
let pauloPessoa: Pessoa;
let carlosPessoa: Pessoa;
let cliente: Pessoa;
let empresa: Empresa;
let produto: Produto;
let paulo = "";
let carlos = "";
let conversaId = "";
let enderecoId = "";

async function deixarDisponivelNaBase(pessoa: Pessoa, entregadorId: string) {
  const disponibilidade = await ctx.api(
    pessoa,
    "PATCH",
    `/entregas/vinculos/${entregadorId}`,
    { disponivel: true },
  );
  assert.equal(disponibilidade.statusCode, 200, disponibilidade.body);
  for (let tentativa = 0; tentativa < 2; tentativa += 1) {
    const localizacao = await ctx.api(
      pessoa,
      "POST",
      `/entregas/vinculos/${entregadorId}/localizacao`,
      {
        latitude: -19.9,
        longitude: -43.9,
        precisaoMetros: 5,
        medidaEm: new Date().toISOString(),
      },
    );
    assert.equal(localizacao.statusCode, 200, localizacao.body);
  }
}

async function criarPedidoPronto(): Promise<Pedido> {
  let pedido: Pedido = (
    await ctx.api(cliente, "POST", "/pedidos", {
      idCliente: randomUUID(),
      empresaIdentidadeId: empresa.identidadeId,
      conversaId,
      enderecoId,
      itens: [{ produtoId: produto.id, quantidade: 1 }],
      pagamento: { forma: "cartao" },
    })
  ).json();
  for (const statusAtual of ["recebido", "em_preparacao"] as const) {
    const resposta = await ctx.api(
      gestora,
      "POST",
      `/empresas/${empresa.id}/pedidos/${pedido.id}/avancar`,
      { statusAtual },
    );
    assert.equal(resposta.statusCode, 200, resposta.body);
    pedido = resposta.json();
  }
  return pedido;
}

async function criarELiberar(
  entregadorId: string,
  pedidoId: string,
): Promise<SaidaEntrega> {
  const criada = await ctx.api(
    gestora,
    "POST",
    `/empresas/${empresa.id}/saidas`,
    { entregadorId, pedidoIds: [pedidoId] },
  );
  assert.equal(criada.statusCode, 201, criada.body);
  const saida: SaidaEntrega = criada.json();
  const liberada = await ctx.api(
    gestora,
    "POST",
    `/empresas/${empresa.id}/saidas/${saida.id}/liberar`,
  );
  assert.equal(liberada.statusCode, 200, liberada.body);
  return liberada.json();
}

before(async () => {
  await ctx.iniciar();
  gestora = await ctx.criarPessoa(0, `${PREFIXO}_gestora`, "Gestora");
  pauloPessoa = await ctx.criarPessoa(
    1,
    `${PREFIXO}_paulo`,
    "Paulo Entregador",
  );
  carlosPessoa = await ctx.criarPessoa(
    2,
    `${PREFIXO}_carlos`,
    "Carlos Entregador",
  );
  cliente = await ctx.criarPessoa(3, `${PREFIXO}_cliente`, "Cliente");
  empresa = (
    await ctx.api(gestora, "POST", "/empresas", {
      nome: "Pizzaria Recusa",
      nomeUsuario: `${PREFIXO}_pizza`,
      slug: `${PREFIXO}-pizza`,
    })
  ).json();
  produto = (
    await ctx.api(gestora, "POST", `/empresas/${empresa.id}/produtos`, {
      nome: "Pizza",
      precoCentavos: 3990,
    })
  ).json();
  conversaId = await ctx.abrirConversa(cliente, empresa.nomeUsuario);
  enderecoId = await ctx.criarEnderecoConfirmado(
    cliente,
    { apelido: "Entrega", numero: "24" },
    { latitude: -19.92, longitude: -43.94 },
  );
  paulo = await ctx.criarEntregadorAtivo(
    gestora,
    empresa.id,
    pauloPessoa,
    `${PREFIXO}_paulo`,
  );
  carlos = await ctx.criarEntregadorAtivo(
    gestora,
    empresa.id,
    carlosPessoa,
    `${PREFIXO}_carlos`,
  );
  await ctx.api(gestora, "POST", `/empresas/${empresa.id}/base`, {
    cep: "30123-000",
    logradouro: "Avenida Afonso Pena",
    numero: "1000",
    bairro: "Centro",
    cidade: "Belo Horizonte",
    uf: "MG",
    raioMetros: 150,
  });
  await ctx.api(gestora, "POST", `/empresas/${empresa.id}/base/localizacao`, {
    latitude: -19.9,
    longitude: -43.9,
  });
  await deixarDisponivelNaBase(pauloPessoa, paulo);
  await deixarDisponivelNaBase(carlosPessoa, carlos);
});

after(() => ctx.encerrar());

describe("recusa de rota pelo entregador", () => {
  it("preserva a rota e o pedido, registra a recusa e despacha para o próximo elegível", async () => {
    const pedido = await criarPedidoPronto();
    const liberada = await criarELiberar(paulo, pedido.id);
    assert.equal(liberada.status, "liberada_retirada");

    const resposta = await ctx.api(
      pauloPessoa,
      "POST",
      `/entregas/saidas/${liberada.id}/recusar`,
    );
    assert.equal(resposta.statusCode, 200, resposta.body);

    const atual: SaidaEntrega = (
      await ctx.api(
        gestora,
        "GET",
        `/empresas/${empresa.id}/saidas/${liberada.id}`,
      )
    ).json();
    assert.equal(atual.id, liberada.id, "a mesma rota foi preservada");
    assert.deepEqual(
      atual.paradas.map((parada) => parada.pedidoId),
      [pedido.id],
    );
    assert.ok(atual.liberadaEm, "a liberação foi preservada");
    assert.equal(
      atual.entregador?.nomeExibicao,
      "Carlos Entregador",
      "o próximo elegível recebeu a rota",
    );

    const pedidoAtual: Pedido = (
      await ctx.api(
        gestora,
        "GET",
        `/empresas/${empresa.id}/pedidos/${pedido.id}`,
      )
    ).json();
    assert.equal(pedidoAtual.status, "pronto");
    assert.equal(
      (await ctx.api(cliente, "GET", `/pedidos/${pedido.id}/fila`)).json()
        .situacao,
      "aguardando_saida",
    );
    const vinculos = (
      await ctx.api(pauloPessoa, "GET", "/entregas/vinculos")
    ).json() as ListaVinculosEntregador;
    assert.equal(
      vinculos.vinculos.find((item) => item.id === paulo)?.disponivel,
      true,
    );
    assert.equal(
      await ctx.banco
        .select()
        .from(recusasSaida)
        .where(
          and(
            eq(recusasSaida.saidaId, liberada.id),
            eq(recusasSaida.entregadorId, paulo),
          ),
        )
        .then((itens) => itens.length),
      1,
    );
  });

  it("sem outro elegível fica aguardando e nunca volta imediatamente para quem recusou", async () => {
    const pedido = await criarPedidoPronto();
    const liberada = await criarELiberar(paulo, pedido.id);
    const resposta = await ctx.api(
      pauloPessoa,
      "POST",
      `/entregas/saidas/${liberada.id}/recusar`,
    );
    assert.equal(resposta.statusCode, 200, resposta.body);

    const saidas = (
      await ctx.api(gestora, "GET", `/empresas/${empresa.id}/saidas`)
    ).json() as ListaSaidas;
    const atual = saidas.saidas.find((saida) => saida.id === liberada.id);
    assert.equal(atual?.status, "aguardando_entregador");
    assert.equal(atual?.entregador, null);
    assert.equal(
      (await ctx.api(pauloPessoa, "GET", `/entregas/saidas/${liberada.id}`))
        .statusCode,
      404,
    );
  });

  it("depois de sair para entrega a API bloqueia a recusa", async () => {
    const atribuidaAoCarlos = (
      (
        await ctx.api(gestora, "GET", `/empresas/${empresa.id}/saidas`)
      ).json() as ListaSaidas
    ).saidas.find(
      (saida) =>
        saida.entregador?.nomeExibicao === "Carlos Entregador" &&
        saida.status === "liberada_retirada",
    );
    assert.ok(atribuidaAoCarlos);
    assert.equal(
      (
        await ctx.api(
          carlosPessoa,
          "POST",
          `/entregas/saidas/${atribuidaAoCarlos.id}/iniciar`,
        )
      ).statusCode,
      200,
    );
    const recusada = await ctx.api(
      carlosPessoa,
      "POST",
      `/entregas/saidas/${atribuidaAoCarlos.id}/recusar`,
    );
    assert.equal(recusada.statusCode, 409);
    assert.equal(recusada.json().codigo, "SAIDA_NAO_PODE_SER_RECUSADA");
  });
});
