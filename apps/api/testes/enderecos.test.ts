import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { destinosPedido, enderecosCliente } from "@jaa/banco/schema";
import type { Empresa, EnderecoCliente, ListaEnderecos, Pedido, Produto, SugestaoLocalizacao } from "@jaa/contratos";
import { eq } from "drizzle-orm";
import { como, criarAmbienteIntegracao, type Pessoa } from "./apoio/integracao.js";

/*
 * Integração REAL dos ENDEREÇOS do cliente e do PONTO DE ENTREGA confirmado:
 * agenda privada, confirmação explícita, invalidação por alteração estrutural e snapshot no Pedido.
 * A = dona da Pizzaria; B = cliente; C = outro cliente (nunca vê endereço alheio).
 */

const PREFIXO = `end${randomUUID().slice(0, 4)}`;
const ctx = criarAmbienteIntegracao({
  telefones: ["+5531987651801", "+5531987651802", "+5531987651803"],
  prefixoIp: "198.18.13.",
});

let A: Pessoa;
let B: Pessoa;
let C: Pessoa;
let pizzaria: Empresa;
let pizza: Produto;
let conversaBP = "";

const PONTO = { latitude: -19.919125, longitude: -43.938602 };

const enderecoBase = {
  apelido: "Casa",
  cep: "30123-000",
  logradouro: "Rua das Flores",
  numero: "150",
  complemento: "Apto 302",
  bairro: "Centro",
  cidade: "Belo Horizonte",
  uf: "MG",
  pontoReferencia: "Portão azul",
};

async function cadastrar(pessoa: Pessoa, dados: Record<string, unknown> = {}): Promise<EnderecoCliente> {
  const resposta = await ctx.api(pessoa, "POST", "/enderecos", { ...enderecoBase, ...dados });
  assert.equal(resposta.statusCode, 201, resposta.body);
  return resposta.json();
}

const confirmar = (pessoa: Pessoa, enderecoId: string, coordenadas: unknown = PONTO) =>
  ctx.api(pessoa, "POST", `/enderecos/${enderecoId}/localizacao`, coordenadas);

async function pedir(pessoa: Pessoa, enderecoId: string, extras: Record<string, unknown> = {}) {
  return ctx.api(pessoa, "POST", "/pedidos", {
    idCliente: randomUUID(),
    empresaIdentidadeId: pizzaria.identidadeId,
    conversaId: conversaBP,
    enderecoId,
    itens: [{ produtoId: pizza.id, quantidade: 2 }],
    pagamento: { forma: "dinheiro", trocoParaCentavos: 10000 },
    ...extras,
  });
}

before(async () => {
  await ctx.iniciar();
  A = await ctx.criarPessoa(0, `${PREFIXO}_a`, "Junior Rocha");
  B = await ctx.criarPessoa(1, `${PREFIXO}_b`, "Bruna Cliente");
  C = await ctx.criarPessoa(2, `${PREFIXO}_c`, "Carlos Outro");
  pizzaria = (await ctx.api(A, "POST", "/empresas", { nome: "Pizzaria BH", nomeUsuario: `${PREFIXO}_pizza`, slug: `${PREFIXO}-pizzaria` })).json();
  pizza = (await ctx.api(A, "POST", `/empresas/${pizzaria.id}/produtos`, { nome: "Pizza Calabresa", precoCentavos: 3990 })).json();
  conversaBP = await ctx.abrirConversa(B, `${PREFIXO}_pizza`);
});

after(() => ctx.encerrar());

describe("agenda de endereços", () => {
  it("cadastra endereço SEM ponto confirmado e normaliza o CEP", async () => {
    const endereco = await cadastrar(B, { apelido: "Trabalho" });

    assert.equal(endereco.cep, "30123000");
    assert.equal(endereco.logradouro, "Rua das Flores");
    assert.equal(endereco.latitude, null);
    assert.equal(endereco.longitude, null);
    assert.equal(endereco.localizacaoConfirmadaEm, null, "endereço novo nasce sem ponto de entrega");
    // Nada de dono, arquivamento ou colunas internas no contrato público.
    assert.equal("identidadeId" in endereco, false);
    assert.equal("arquivadoEm" in endereco, false);
  });

  it("lista somente os próprios endereços", async () => {
    const meu = await cadastrar(B, { apelido: "Casa da mãe" });
    await cadastrar(C, { apelido: "Casa do Carlos", logradouro: "Rua do Carlos" });

    const lista: ListaEnderecos = (await ctx.api(B, "GET", "/enderecos")).json();
    assert.ok(lista.enderecos.some((endereco) => endereco.id === meu.id));
    assert.equal(lista.enderecos.some((endereco) => endereco.apelido === "Casa do Carlos"), false);

    const doOutro: ListaEnderecos = (await ctx.api(C, "GET", "/enderecos")).json();
    assert.equal(doOutro.enderecos.some((endereco) => endereco.id === meu.id), false);
  });

  it("endereço de outra pessoa é indistinguível de inexistente", async () => {
    const meu = await cadastrar(B);

    for (const caminho of [`/enderecos/${meu.id}`]) assert.equal((await ctx.api(C, "GET", caminho)).statusCode, 404);
    assert.equal((await ctx.api(C, "PATCH", `/enderecos/${meu.id}`, { ...enderecoBase, numero: "999" })).statusCode, 404);
    assert.equal((await confirmar(C, meu.id)).statusCode, 404);
    assert.equal((await ctx.api(C, "DELETE", `/enderecos/${meu.id}`)).statusCode, 404);
    assert.equal((await ctx.api(B, "GET", `/enderecos/${randomUUID()}`)).statusCode, 404);
    // Nada foi alterado pelo intruso.
    assert.equal((await ctx.api(B, "GET", `/enderecos/${meu.id}`)).json().numero, "150");
  });

  it("identidade empresarial não tem agenda de endereços de consumidor", async () => {
    const comoEmpresa = como(A, pizzaria.identidadeId);
    assert.equal((await ctx.api(comoEmpresa, "GET", "/enderecos")).statusCode, 403);
    const tentativa = await ctx.api(comoEmpresa, "POST", "/enderecos", enderecoBase);
    assert.equal(tentativa.statusCode, 403);
    assert.equal(tentativa.json().codigo, "IDENTIDADE_NAO_AUTORIZADA");
    // E anônimo não chega perto.
    assert.equal((await ctx.api(null, "GET", "/enderecos")).statusCode, 401);
  });

  it("recusa endereço incompleto, CEP e UF inválidos", async () => {
    for (const invalido of [{ logradouro: "  " }, { numero: "" }, { cep: "123" }, { uf: "XX" }, { apelido: "" }]) {
      assert.equal((await ctx.api(B, "POST", "/enderecos", { ...enderecoBase, ...invalido })).statusCode, 400, JSON.stringify(invalido));
    }
  });

  it("arquiva o endereço sem apagar o histórico dos pedidos", async () => {
    const endereco = await cadastrar(B, { apelido: "Temporário" });
    assert.equal((await ctx.api(B, "DELETE", `/enderecos/${endereco.id}`)).statusCode, 204);
    assert.equal((await ctx.api(B, "GET", `/enderecos/${endereco.id}`)).statusCode, 404);

    const lista: ListaEnderecos = (await ctx.api(B, "GET", "/enderecos")).json();
    assert.equal(lista.enderecos.some((salvo) => salvo.id === endereco.id), false);
    // A linha continua no banco (pedidos antigos referenciam o endereço de origem).
    const [linha] = await ctx.banco.select().from(enderecosCliente).where(eq(enderecosCliente.id, endereco.id));
    assert.ok(linha?.arquivadoEm);
  });
});

describe("ponto de entrega confirmado", () => {
  it("confirmação explícita grava latitude, longitude e a data", async () => {
    const endereco = await cadastrar(B);
    const resposta = await confirmar(B, endereco.id);
    assert.equal(resposta.statusCode, 200, resposta.body);
    const confirmado: EnderecoCliente = resposta.json();

    assert.equal(confirmado.latitude, PONTO.latitude);
    assert.equal(confirmado.longitude, PONTO.longitude);
    assert.ok(confirmado.localizacaoConfirmadaEm);
    // O texto continua exatamente como o cliente cadastrou: o mapa nunca corrige o número.
    assert.equal(confirmado.numero, "150");
    assert.equal(confirmado.logradouro, "Rua das Flores");
  });

  it("recusa coordenadas fora da faixa, não numéricas ou incompletas", async () => {
    const endereco = await cadastrar(B);
    for (const invalida of [
      { latitude: 91, longitude: 0 },
      { latitude: -19.9, longitude: 181 },
      { latitude: "-19.9", longitude: -43.9 },
      { latitude: null, longitude: -43.9 },
      { latitude: -19.9 },
      {},
    ]) {
      assert.equal((await confirmar(B, endereco.id, invalida)).statusCode, 400, JSON.stringify(invalida));
    }
    assert.equal((await ctx.api(B, "GET", `/enderecos/${endereco.id}`)).json().localizacaoConfirmadaEm, null);
  });

  it("reajustar o pin substitui o ponto e atualiza a confirmação", async () => {
    const endereco = await cadastrar(B);
    const primeira: EnderecoCliente = (await confirmar(B, endereco.id)).json();
    const novoPonto = { latitude: -19.92, longitude: -43.94 };
    const segunda: EnderecoCliente = (await confirmar(B, endereco.id, novoPonto)).json();

    assert.equal(segunda.latitude, novoPonto.latitude);
    assert.equal(segunda.longitude, novoPonto.longitude);
    assert.ok(new Date(segunda.localizacaoConfirmadaEm ?? 0) >= new Date(primeira.localizacaoConfirmadaEm ?? 0));
  });

  it("geocodificação é só sugestão: sem provedor configurado, não há palpite e nada é confirmado", async () => {
    const endereco = await cadastrar(B);
    const resposta = await ctx.api(B, "GET", `/enderecos/${endereco.id}/sugestao-localizacao`);
    assert.equal(resposta.statusCode, 200);
    const sugestao: SugestaoLocalizacao = resposta.json();

    assert.equal(sugestao.disponivel, false);
    assert.equal(sugestao.coordenadas, null);
    assert.equal((await ctx.api(B, "GET", `/enderecos/${endereco.id}`)).json().localizacaoConfirmadaEm, null, "consultar sugestão não confirma ponto");
  });
});

describe("invalidação da confirmação ao editar", () => {
  it("mudar campo estrutural (número) apaga o ponto confirmado", async () => {
    const endereco = await cadastrar(B);
    await confirmar(B, endereco.id);

    const editado: EnderecoCliente = (await ctx.api(B, "PATCH", `/enderecos/${endereco.id}`, { ...enderecoBase, numero: "300" })).json();
    assert.equal(editado.numero, "300");
    assert.equal(editado.latitude, null);
    assert.equal(editado.localizacaoConfirmadaEm, null, "outro número pode ser outro destino: confirma de novo");
  });

  it("mudar só o apelido preserva o ponto confirmado", async () => {
    const endereco = await cadastrar(B);
    const confirmado: EnderecoCliente = (await confirmar(B, endereco.id)).json();

    const editado: EnderecoCliente = (await ctx.api(B, "PATCH", `/enderecos/${endereco.id}`, { ...enderecoBase, apelido: "Minha casa" })).json();
    assert.equal(editado.apelido, "Minha casa");
    assert.equal(editado.latitude, PONTO.latitude);
    assert.equal(editado.localizacaoConfirmadaEm, confirmado.localizacaoConfirmadaEm);
  });

  it("mudar complemento também invalida (pode ser outra entrada física)", async () => {
    const endereco = await cadastrar(B);
    await confirmar(B, endereco.id);
    const editado: EnderecoCliente = (await ctx.api(B, "PATCH", `/enderecos/${endereco.id}`, { ...enderecoBase, complemento: "Casa 2 dos fundos" })).json();
    assert.equal(editado.localizacaoConfirmadaEm, null);
  });
});

describe("pedido com destino", () => {
  it("o pedido só existe com endereço do próprio cliente e ponto confirmado", async () => {
    const semPonto = await cadastrar(B, { apelido: "Sem ponto" });
    const doOutro = await cadastrar(C, { apelido: "Do Carlos" });
    await confirmar(C, doOutro.id);

    const semConfirmacao = await pedir(B, semPonto.id);
    assert.equal(semConfirmacao.statusCode, 409);
    assert.equal(semConfirmacao.json().codigo, "LOCALIZACAO_NAO_CONFIRMADA");

    // Endereço de outro cliente: indistinguível de inexistente.
    assert.equal((await pedir(B, doOutro.id)).statusCode, 404);
    assert.equal((await pedir(B, randomUUID())).statusCode, 404);
    assert.equal((await ctx.api(B, "POST", "/pedidos", { idCliente: randomUUID(), empresaIdentidadeId: pizzaria.identidadeId, conversaId: conversaBP, itens: [{ produtoId: pizza.id, quantidade: 1 }], pagamento: { forma: "cartao" } })).statusCode, 400, "pedido sem endereço nem começa");
  });

  it("o servidor monta o snapshot do destino a partir do banco", async () => {
    const endereco = await cadastrar(B, { apelido: "Entrega" });
    await confirmar(B, endereco.id);

    const resposta = await pedir(B, endereco.id);
    assert.equal(resposta.statusCode, 201, resposta.body);
    const pedido: Pedido = resposta.json();

    assert.equal(pedido.destino?.logradouro, "Rua das Flores");
    assert.equal(pedido.destino?.numero, "150");
    assert.equal(pedido.destino?.complemento, "Apto 302");
    assert.equal(pedido.destino?.cep, "30123000");
    assert.equal(pedido.destino?.uf, "MG");
    assert.equal(pedido.destino?.pontoReferencia, "Portão azul");
    assert.equal(pedido.destino?.latitude, PONTO.latitude);
    assert.equal(pedido.destino?.longitude, PONTO.longitude);
    assert.equal(pedido.destino?.enderecoId, endereco.id);
    assert.ok(pedido.destino?.localizacaoConfirmadaEm);

    // O snapshot foi gravado na mesma transação do pedido.
    const [gravado] = await ctx.banco.select().from(destinosPedido).where(eq(destinosPedido.pedidoId, pedido.id));
    assert.equal(gravado?.numero, "150");
    assert.equal(gravado?.latitude, PONTO.latitude);
  });

  it("editar o endereço depois não altera pedido nenhum", async () => {
    const endereco = await cadastrar(B, { apelido: "Histórico" });
    await confirmar(B, endereco.id);
    const pedido: Pedido = (await pedir(B, endereco.id)).json();

    await ctx.api(B, "PATCH", `/enderecos/${endereco.id}`, { ...enderecoBase, logradouro: "Rua Nova", numero: "300" });
    await confirmar(B, endereco.id, { latitude: -20.1, longitude: -44.1 });

    const antigo: Pedido = (await ctx.api(B, "GET", `/pedidos/${pedido.id}`)).json();
    assert.equal(antigo.destino?.logradouro, "Rua das Flores");
    assert.equal(antigo.destino?.numero, "150");
    assert.equal(antigo.destino?.latitude, PONTO.latitude);
  });

  it("endereço confirmado é reutilizado: o segundo pedido não exige nova confirmação", async () => {
    const endereco = await cadastrar(B, { apelido: "Recorrente" });
    await confirmar(B, endereco.id);

    assert.equal((await pedir(B, endereco.id)).statusCode, 201);
    const segundo = await pedir(B, endereco.id);
    assert.equal(segundo.statusCode, 201, "endereço já confirmado segue valendo");
    assert.equal(segundo.json().destino.latitude, PONTO.latitude);
  });

  it("depois de alterar a rua, o mesmo endereço volta a exigir confirmação", async () => {
    const endereco = await cadastrar(B, { apelido: "Mudou" });
    await confirmar(B, endereco.id);
    assert.equal((await pedir(B, endereco.id)).statusCode, 201);

    await ctx.api(B, "PATCH", `/enderecos/${endereco.id}`, { ...enderecoBase, logradouro: "Rua Outra", numero: "42" });
    assert.equal((await pedir(B, endereco.id)).statusCode, 409, "alteração estrutural invalidou o ponto");

    await confirmar(B, endereco.id, { latitude: -19.93, longitude: -43.95 });
    const depois = await pedir(B, endereco.id);
    assert.equal(depois.statusCode, 201);
    assert.equal(depois.json().destino.logradouro, "Rua Outra");
  });

  it("a empresa vê o destino do pedido, mas nunca a agenda de endereços do cliente", async () => {
    const endereco = await cadastrar(B, { apelido: "Visível" });
    await confirmar(B, endereco.id);
    const pedido: Pedido = (await pedir(B, endereco.id)).json();

    const comoEmpresa = como(A, pizzaria.identidadeId);
    const daEmpresa: Pedido = (await ctx.api(comoEmpresa, "GET", `/pedidos/${pedido.id}`)).json();
    assert.equal(daEmpresa.destino?.logradouro, "Rua das Flores");
    assert.equal(daEmpresa.destino?.latitude, PONTO.latitude);

    // A agenda continua privada: nenhuma rota de endereços responde para a empresa.
    assert.equal((await ctx.api(comoEmpresa, "GET", "/enderecos")).statusCode, 403);
    assert.equal((await ctx.api(A, "GET", `/enderecos/${endereco.id}`)).statusCode, 404, "nem como pessoa física dona da empresa");
  });

  it("pedido legado (sem destino) continua válido e legível", async () => {
    const endereco = await cadastrar(B, { apelido: "Legado" });
    await confirmar(B, endereco.id);
    const pedido: Pedido = (await pedir(B, endereco.id)).json();

    // Simula um pedido criado antes desta etapa: sem linha de destino.
    await ctx.banco.delete(destinosPedido).where(eq(destinosPedido.pedidoId, pedido.id));

    const legado = await ctx.api(B, "GET", `/pedidos/${pedido.id}`);
    assert.equal(legado.statusCode, 200);
    assert.equal(legado.json().destino, null);
    assert.equal(legado.json().totalCentavos, 7980, "o resto do pedido continua intacto");
  });
});
