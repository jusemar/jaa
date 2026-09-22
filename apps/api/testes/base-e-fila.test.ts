import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import {
  entregadoresEmpresa,
  historicoFilaEntregador,
} from "@jaa/banco/schema";
import {
  EVENTO_FILA_ATUALIZADA,
  EVENTO_SITUACAO_OPERACIONAL,
  type BaseEmpresa,
  type Empresa,
  type EventoFilaAtualizada,
  type EventoSituacaoOperacional,
  type ListaSituacoesOperacionais,
  type PainelOperacional,
  type Pedido,
  type Produto,
  type SituacaoOperacional,
} from "@jaa/contratos";
import { eq } from "drizzle-orm";
import {
  aguardarAte,
  coletar,
  como,
  criarAmbienteIntegracao,
  type Pessoa,
} from "./apoio/integracao.js";

/*
 * Integração REAL da BASE OPERACIONAL, da PRESENÇA por geofence e da FILA automática.
 * A = dona da Pizzaria (e da Farmácia); P, C, J = entregadores; B = cliente.
 * O ponto da base fica na Savassi; "longe" é a ~1 km, fora de qualquer raio configurado.
 */

const PREFIXO = `fil${randomUUID().slice(0, 4)}`;
const ctx = criarAmbienteIntegracao({
  telefones: [
    "+5531987652101",
    "+5531987652102",
    "+5531987652103",
    "+5531987652104",
    "+5531987652105",
  ],
  prefixoIp: "198.18.16.",
});

const BASE = { latitude: -19.93, longitude: -43.938 };
const NA_BASE = { latitude: -19.9301, longitude: -43.9381 };
const PERTO_DA_BORDA = { latitude: -19.9315, longitude: -43.938 };
const LONGE = { latitude: -19.95, longitude: -43.95 };

let A: Pessoa;
let P: Pessoa;
let C: Pessoa;
let J: Pessoa;
let B: Pessoa;
let pizzaria: Empresa;
let farmacia: Empresa;
let pizza: Produto;
let paulo = "";
let carlos = "";
let joao = "";
let conversaB = "";
let enderecoB = "";

const enviarLocalizacao = (
  pessoa: Pessoa,
  entregadorId: string,
  coordenadas: { latitude: number; longitude: number },
  extras: Record<string, unknown> = {},
) =>
  ctx.api(pessoa, "POST", `/entregas/vinculos/${entregadorId}/localizacao`, {
    ...coordenadas,
    precisaoMetros: 10,
    medidaEm: new Date().toISOString(),
    ...extras,
  });

// A presença só é confirmada depois de leituras consecutivas (estabilização do GPS).
async function chegarNaBase(
  pessoa: Pessoa,
  entregadorId: string,
): Promise<SituacaoOperacional> {
  await enviarLocalizacao(pessoa, entregadorId, NA_BASE);
  const resposta = await enviarLocalizacao(pessoa, entregadorId, NA_BASE);
  assert.equal(resposta.statusCode, 200, resposta.body);
  return resposta.json();
}

async function sairDaBase(
  pessoa: Pessoa,
  entregadorId: string,
): Promise<SituacaoOperacional> {
  await enviarLocalizacao(pessoa, entregadorId, LONGE);
  const resposta = await enviarLocalizacao(pessoa, entregadorId, LONGE);
  assert.equal(resposta.statusCode, 200, resposta.body);
  return resposta.json();
}

const painel = async (empresa = pizzaria): Promise<PainelOperacional> =>
  (await ctx.api(A, "GET", `/empresas/${empresa.id}/operacao`)).json();

before(async () => {
  await ctx.iniciar();
  A = await ctx.criarPessoa(0, `${PREFIXO}_a`, "Ana da Pizzaria");
  P = await ctx.criarPessoa(1, `${PREFIXO}_p`, "Paulo Entregador");
  C = await ctx.criarPessoa(2, `${PREFIXO}_c`, "Carlos Entregador");
  J = await ctx.criarPessoa(3, `${PREFIXO}_j`, "João Entregador");
  B = await ctx.criarPessoa(4, `${PREFIXO}_b`, "Bruna Cliente");
  pizzaria = (
    await ctx.api(A, "POST", "/empresas", {
      nome: "Pizzaria BH",
      nomeUsuario: `${PREFIXO}_pizza`,
      slug: `${PREFIXO}-pizzaria`,
    })
  ).json();
  farmacia = (
    await ctx.api(A, "POST", "/empresas", {
      nome: "Farmácia Central",
      nomeUsuario: `${PREFIXO}_farma`,
      slug: `${PREFIXO}-farmacia`,
    })
  ).json();
  pizza = (
    await ctx.api(A, "POST", `/empresas/${pizzaria.id}/produtos`, {
      nome: "Pizza Calabresa",
      precoCentavos: 3990,
    })
  ).json();
  conversaB = await ctx.abrirConversa(B, `${PREFIXO}_pizza`);
  enderecoB = await ctx.criarEnderecoConfirmado(B);

  paulo = await ctx.criarEntregadorAtivo(A, pizzaria.id, P, `${PREFIXO}_p`);
  carlos = await ctx.criarEntregadorAtivo(A, pizzaria.id, C, `${PREFIXO}_c`);
  joao = await ctx.criarEntregadorAtivo(A, pizzaria.id, J, `${PREFIXO}_j`);

  // Base da Pizzaria configurada e com ponto confirmado (a Farmácia fica sem base de propósito).
  const base = await ctx.api(A, "POST", `/empresas/${pizzaria.id}/base`, {
    cep: "30112-000",
    logradouro: "Avenida do Contorno",
    numero: "500",
    bairro: "Savassi",
    cidade: "Belo Horizonte",
    uf: "MG",
    raioMetros: 150,
  });
  assert.equal(base.statusCode, 200, base.body);
  assert.equal(
    (
      await ctx.api(
        A,
        "POST",
        `/empresas/${pizzaria.id}/base/localizacao`,
        BASE,
      )
    ).statusCode,
    200,
  );
});

after(() => ctx.encerrar());

describe("base operacional da empresa", () => {
  it("guarda o endereço, o raio e só confirma o ponto por ação explícita", async () => {
    const base: BaseEmpresa = (
      await ctx.api(A, "GET", `/empresas/${pizzaria.id}/base`)
    ).json();
    assert.equal(base.logradouro, "Avenida do Contorno");
    assert.equal(base.cep, "30112000");
    assert.equal(base.raioMetros, 150);
    assert.equal(base.latitude, BASE.latitude);
    assert.ok(base.localizacaoConfirmadaEm);

    // Raio fora dos limites e coordenada inválida são recusados.
    assert.equal(
      (
        await ctx.api(A, "POST", `/empresas/${pizzaria.id}/base`, {
          cep: "30112-000",
          logradouro: "Av",
          numero: "1",
          bairro: "B",
          cidade: "BH",
          uf: "MG",
          raioMetros: 5,
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (
        await ctx.api(A, "POST", `/empresas/${pizzaria.id}/base/localizacao`, {
          latitude: 100,
          longitude: 0,
        })
      ).statusCode,
      400,
    );
  });

  it("oferece sugestão de geocodificação sem confirmar nem alterar a base", async () => {
    const antes: BaseEmpresa = (
      await ctx.api(A, "GET", `/empresas/${pizzaria.id}/base`)
    ).json();
    const resposta = await ctx.api(
      A,
      "GET",
      `/empresas/${pizzaria.id}/base/sugestao-localizacao`,
    );
    assert.equal(resposta.statusCode, 200, resposta.body);
    assert.deepEqual(resposta.json(), { disponivel: false, coordenadas: null });
    const depois: BaseEmpresa = (
      await ctx.api(A, "GET", `/empresas/${pizzaria.id}/base`)
    ).json();
    assert.equal(depois.localizacaoConfirmadaEm, antes.localizacaoConfirmadaEm);
    assert.equal(depois.logradouro, antes.logradouro);
  });

  it("mudar o endereço estrutural invalida o ponto confirmado", async () => {
    const outra = (
      await ctx.api(A, "POST", "/empresas", {
        nome: "Loja Teste",
        nomeUsuario: `${PREFIXO}_loja`,
        slug: `${PREFIXO}-loja`,
      })
    ).json();
    await ctx.api(A, "POST", `/empresas/${outra.id}/base`, {
      cep: "30112-000",
      logradouro: "Rua A",
      numero: "10",
      bairro: "Centro",
      cidade: "BH",
      uf: "MG",
    });
    assert.equal(
      (await ctx.api(A, "POST", `/empresas/${outra.id}/base/localizacao`, BASE))
        .statusCode,
      200,
    );

    const editada: BaseEmpresa = (
      await ctx.api(A, "POST", `/empresas/${outra.id}/base`, {
        cep: "30112-000",
        logradouro: "Rua A",
        numero: "999",
        bairro: "Centro",
        cidade: "BH",
        uf: "MG",
      })
    ).json();
    assert.equal(editada.numero, "999");
    assert.equal(
      editada.localizacaoConfirmadaEm,
      null,
      "outro número pode ser outro lugar: confirma de novo",
    );
    // Só o raio muda? A confirmação continua valendo.
    assert.equal(
      (await ctx.api(A, "POST", `/empresas/${outra.id}/base/localizacao`, BASE))
        .statusCode,
      200,
    );
    const soRaio: BaseEmpresa = (
      await ctx.api(A, "POST", `/empresas/${outra.id}/base`, {
        cep: "30112-000",
        logradouro: "Rua A",
        numero: "999",
        bairro: "Centro",
        cidade: "BH",
        uf: "MG",
        raioMetros: 300,
      })
    ).json();
    assert.ok(soRaio.localizacaoConfirmadaEm);
    assert.equal(soRaio.raioMetros, 300);
  });

  it("só quem administra a empresa configura a base", async () => {
    for (const pessoa of [P, B]) {
      assert.equal(
        (await ctx.api(pessoa, "GET", `/empresas/${pizzaria.id}/base`))
          .statusCode,
        404,
        "entregador e cliente não veem a base",
      );
      assert.equal(
        (
          await ctx.api(pessoa, "POST", `/empresas/${pizzaria.id}/base`, {
            cep: "30112-000",
            logradouro: "X",
            numero: "1",
            bairro: "B",
            cidade: "BH",
            uf: "MG",
          })
        ).statusCode,
        404,
      );
    }
    assert.equal(
      (await ctx.api(null, "GET", `/empresas/${pizzaria.id}/base`)).statusCode,
      401,
    );
  });
});

describe("presença por geofence", () => {
  it("o servidor decide presença; o entregador nunca declara que está na base", async () => {
    // Fora da base: disponível, mas fora da fila.
    const fora = await sairDaBase(P, paulo);
    assert.equal(fora.naBase, false);
    assert.equal(fora.estado, "disponivel_fora_base");
    assert.equal(fora.posicaoFila, null);

    // "naBase: true" no corpo é ignorado: quem calcula é o servidor.
    const tentativa = await enviarLocalizacao(P, paulo, LONGE, {
      naBase: true,
    });
    assert.equal(tentativa.statusCode, 200);
    assert.equal(tentativa.json().naBase, false);

    const dentro = await chegarNaBase(P, paulo);
    assert.equal(dentro.naBase, true);
    assert.equal(dentro.estado, "disponivel_na_base");
    assert.equal(dentro.posicaoFila, 1);
  });

  it("uma leitura precisa de confirmação: presença não muda no primeiro ponto", async () => {
    await sairDaBase(C, carlos);
    const primeira = await enviarLocalizacao(C, carlos, NA_BASE);
    assert.equal(
      primeira.json().naBase,
      false,
      "uma leitura só não confirma chegada",
    );
    const segunda = await enviarLocalizacao(C, carlos, NA_BASE);
    assert.equal(segunda.json().naBase, true);
  });

  it("oscilação do GPS perto da borda não tira ninguém da fila", async () => {
    await chegarNaBase(C, carlos);
    const antes: SituacaoOperacional = (
      await ctx.api(C, "GET", "/entregas/situacao")
    )
      .json()
      .situacoes.find(
        (item: SituacaoOperacional) => item.entregadorId === carlos,
      );

    // Leitura ligeiramente fora do raio (ruído comum): continua na base e na mesma posição.
    const oscilacao = await enviarLocalizacao(C, carlos, PERTO_DA_BORDA);
    assert.equal(
      oscilacao.json().naBase,
      true,
      "ruído perto da borda não derruba a presença",
    );
    assert.equal(oscilacao.json().posicaoFila, antes.posicaoFila);

    // Ir de fato para longe, com leituras consistentes, tira da fila.
    const saiu = await sairDaBase(C, carlos);
    assert.equal(saiu.naBase, false);
    assert.equal(saiu.posicaoFila, null);
  });

  it("recusa leitura antiga, imprecisa, de outra pessoa ou sem base confirmada", async () => {
    const antiga = await enviarLocalizacao(P, paulo, NA_BASE, {
      medidaEm: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    });
    assert.equal(antiga.statusCode, 409);
    assert.equal(antiga.json().codigo, "LOCALIZACAO_IMPRECISA");
    const imprecisa = await enviarLocalizacao(P, paulo, NA_BASE, {
      precisaoMetros: 900,
    });
    assert.equal(imprecisa.statusCode, 409);

    // Ninguém envia localização por outro entregador.
    assert.equal((await enviarLocalizacao(C, paulo, NA_BASE)).statusCode, 404);
    assert.equal((await enviarLocalizacao(B, paulo, NA_BASE)).statusCode, 404);
    assert.equal(
      (
        await ctx.api(null, "POST", `/entregas/vinculos/${paulo}/localizacao`, {
          latitude: -19.93,
          longitude: -43.93,
          medidaEm: new Date().toISOString(),
        })
      ).statusCode,
      401,
    );

    // Empresa sem ponto de base confirmado não detecta presença.
    const naFarmacia = await ctx.criarEntregadorAtivo(
      A,
      farmacia.id,
      P,
      `${PREFIXO}_p`,
    );
    const semBase = await enviarLocalizacao(P, naFarmacia, NA_BASE);
    assert.equal(semBase.statusCode, 409);
    assert.equal(semBase.json().codigo, "BASE_NAO_CONFIGURADA");
  });
});

describe("fila automática", () => {
  it("entra sozinha, na ordem de chegada, sem gestor confirmar nada", async () => {
    for (const [pessoa, vinculo] of [
      [P, paulo],
      [C, carlos],
      [J, joao],
    ] as const)
      await sairDaBase(pessoa, vinculo);
    assert.deepEqual((await painel()).fila, []);

    await chegarNaBase(P, paulo);
    await chegarNaBase(C, carlos);
    await chegarNaBase(J, joao);

    const quadro = await painel();
    assert.deepEqual(
      quadro.fila.map((item) => item.pessoa.nomeExibicao),
      ["Paulo Entregador", "Carlos Entregador", "João Entregador"],
    );
    assert.deepEqual(
      quadro.fila.map((item) => item.posicaoFila),
      [1, 2, 3],
    );
    assert.equal(
      quadro.fila.every((item) => item.estado === "disponivel_na_base"),
      true,
    );
    assert.equal(quadro.baseConfigurada, true);
  });

  it("separa fila, disponíveis fora da base e indisponíveis", async () => {
    // João sai da base (segue aceitando) e Carlos, fora da base, para de aceitar.
    await sairDaBase(J, joao);
    await sairDaBase(C, carlos);
    assert.equal(
      (
        await ctx.api(C, "PATCH", `/entregas/vinculos/${carlos}`, {
          disponivel: false,
        })
      ).statusCode,
      200,
    );

    const quadro = await painel();
    assert.deepEqual(
      quadro.fila.map((item) => item.pessoa.nomeExibicao),
      ["Paulo Entregador"],
    );
    assert.ok(
      quadro.foraDaBase.some(
        (item) =>
          item.pessoa.nomeExibicao === "João Entregador" &&
          item.estado === "disponivel_fora_base",
      ),
    );
    assert.ok(
      quadro.indisponiveis.some(
        (item) =>
          item.pessoa.nomeExibicao === "Carlos Entregador" &&
          item.estado === "indisponivel",
      ),
    );
    // O painel é derivado: nenhuma coordenada trafega.
    assert.equal(JSON.stringify(quadro).includes("latitude"), false);

    // Voltar a aceitar estando FORA da base não entra na fila.
    assert.equal(
      (
        await ctx.api(C, "PATCH", `/entregas/vinculos/${carlos}`, {
          disponivel: true,
        })
      ).statusCode,
      200,
    );
    const depois = await painel();
    assert.equal(
      depois.fila.some(
        (item) => item.pessoa.nomeExibicao === "Carlos Entregador",
      ),
      false,
    );
    assert.ok(
      depois.foraDaBase.some(
        (item) => item.pessoa.nomeExibicao === "Carlos Entregador",
      ),
    );
  });

  it("deixar de aceitar, ou ter o vínculo desativado, remove da fila na hora", async () => {
    await chegarNaBase(C, carlos);
    assert.ok((await painel()).fila.some((item) => item.id === carlos));

    assert.equal(
      (
        await ctx.api(C, "PATCH", `/entregas/vinculos/${carlos}`, {
          disponivel: false,
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (await painel()).fila.some((item) => item.id === carlos),
      false,
    );

    // Vínculo desativado pela empresa também tira.
    await ctx.api(C, "PATCH", `/entregas/vinculos/${carlos}`, {
      disponivel: true,
    });
    await chegarNaBase(C, carlos);
    assert.ok((await painel()).fila.some((item) => item.id === carlos));
    assert.equal(
      (
        await ctx.api(
          A,
          "PATCH",
          `/empresas/${pizzaria.id}/entregadores/${carlos}`,
          { status: "inativo" },
        )
      ).statusCode,
      200,
    );
    assert.equal(
      (await painel()).fila.some((item) => item.id === carlos),
      false,
    );

    // Histórico de entrada/saída da fila fica registrado.
    const historico = await ctx.banco
      .select()
      .from(historicoFilaEntregador)
      .where(eq(historicoFilaEntregador.entregadorId, carlos));
    assert.ok(historico.length >= 2);
    assert.ok(historico.some((linha) => linha.motivoSaida !== null));

    await ctx.api(
      A,
      "PATCH",
      `/empresas/${pizzaria.id}/entregadores/${carlos}`,
      { status: "ativo" },
    );
    await ctx.api(C, "PATCH", `/entregas/vinculos/${carlos}`, {
      disponivel: true,
    });
  });

  it("entradas quase simultâneas mantêm a fila determinística", async () => {
    for (const [pessoa, vinculo] of [
      [P, paulo],
      [C, carlos],
      [J, joao],
    ] as const)
      await sairDaBase(pessoa, vinculo);

    await Promise.all([
      enviarLocalizacao(P, paulo, NA_BASE).then(() =>
        enviarLocalizacao(P, paulo, NA_BASE),
      ),
      enviarLocalizacao(C, carlos, NA_BASE).then(() =>
        enviarLocalizacao(C, carlos, NA_BASE),
      ),
      enviarLocalizacao(J, joao, NA_BASE).then(() =>
        enviarLocalizacao(J, joao, NA_BASE),
      ),
    ]);

    const quadro = await painel();
    assert.equal(quadro.fila.length, 3);
    assert.deepEqual(
      quadro.fila.map((item) => item.posicaoFila),
      [1, 2, 3],
      "posições sem ambiguidade",
    );
    // A ordem é estável entre leituras.
    assert.deepEqual(
      (await painel()).fila.map((item) => item.id),
      quadro.fila.map((item) => item.id),
    );
  });
});

describe("ciclo do entregador", () => {
  it("receber saída tira da fila; concluir na base recoloca no final", async () => {
    for (const [pessoa, vinculo] of [
      [P, paulo],
      [C, carlos],
      [J, joao],
    ] as const)
      await sairDaBase(pessoa, vinculo);
    await chegarNaBase(P, paulo);
    await chegarNaBase(C, carlos);
    assert.deepEqual(
      (await painel()).fila.map((item) => item.id),
      [paulo, carlos],
    );

    // Pedido pronto e saída para Paulo (o primeiro da fila).
    const pedido: Pedido = (
      await ctx.api(B, "POST", "/pedidos", {
        idCliente: randomUUID(),
        empresaIdentidadeId: pizzaria.identidadeId,
        conversaId: conversaB,
        enderecoId: enderecoB,
        itens: [{ produtoId: pizza.id, quantidade: 1 }],
        pagamento: { forma: "cartao" },
      })
    ).json();
    let atual = pedido;
    for (const status of ["recebido", "em_preparacao"] as const) {
      atual = (
        await ctx.api(
          A,
          "POST",
          `/empresas/${pizzaria.id}/pedidos/${atual.id}/avancar`,
          { statusAtual: status },
        )
      ).json();
    }
    const saida = await ctx.api(A, "POST", `/empresas/${pizzaria.id}/saidas`, {
      entregadorId: paulo,
      pedidoIds: [pedido.id],
    });
    assert.equal(saida.statusCode, 201, saida.body);

    // Saiu da fila: Carlos assume a primeira posição.
    assert.deepEqual(
      (await painel()).fila.map((item) => item.id),
      [carlos],
    );

    // Conclui a entrega; ele continua na base e aceitando → volta ao FINAL da fila.
    assert.equal(
      (
        await ctx.api(
          A,
          "POST",
          `/empresas/${pizzaria.id}/saidas/${saida.json().id}/liberar`,
        )
      ).statusCode,
      200,
    );
    assert.equal(
      (await ctx.api(P, "POST", `/entregas/saidas/${saida.json().id}/iniciar`))
        .statusCode,
      200,
    );
    const durante: ListaSituacoesOperacionais = (
      await ctx.api(P, "GET", "/entregas/situacao")
    ).json();
    const emEntrega = durante.situacoes.find(
      (item) => item.entregadorId === paulo,
    );
    assert.equal(emEntrega?.estado, "em_entrega");
    assert.equal(
      emEntrega?.posicaoFila,
      null,
      "rota em andamento nunca participa da fila",
    );
    for (const status of ["saiu_para_entrega"] as const) {
      assert.equal(
        (
          await ctx.api(
            A,
            "POST",
            `/empresas/${pizzaria.id}/pedidos/${pedido.id}/avancar`,
            { statusAtual: status },
          )
        ).statusCode,
        200,
      );
    }
    assert.deepEqual(
      (await painel()).fila.map((item) => item.id),
      [carlos, paulo],
      "volta no fim, não na frente",
    );
    // Concluir a saída não desligou "aceitando entregas".
    const situacoes: ListaSituacoesOperacionais = (
      await ctx.api(P, "GET", "/entregas/situacao")
    ).json();
    assert.equal(
      situacoes.situacoes.find((item) => item.entregadorId === paulo)
        ?.disponivel,
      true,
    );
    assert.equal(
      situacoes.situacoes.find((item) => item.entregadorId === paulo)?.estado,
      "disponivel_na_base",
    );
  });

  it("o entregador vê a própria posição, sem detalhes dos outros", async () => {
    const situacoes: ListaSituacoesOperacionais = (
      await ctx.api(P, "GET", "/entregas/situacao")
    ).json();
    const naPizzaria = situacoes.situacoes.find(
      (item) => item.entregadorId === paulo,
    );
    assert.ok(naPizzaria);
    assert.equal(naPizzaria?.empresa.nome, "Pizzaria BH");
    assert.equal(typeof naPizzaria?.posicaoFila, "number");
    assert.equal(typeof naPizzaria?.totalNaFila, "number");
    // Nada dos outros integrantes da fila.
    assert.equal(JSON.stringify(situacoes).includes("Carlos"), false);
    assert.equal(JSON.stringify(situacoes).includes("pessoa"), false);
  });

  it("empresa A não enxerga fila, presença nem base da empresa B", async () => {
    const outraDona = (
      await ctx.api(C, "POST", "/empresas", {
        nome: "Padaria Rival",
        nomeUsuario: `${PREFIXO}_rival`,
        slug: `${PREFIXO}-rival`,
      })
    ).json();

    assert.equal(
      (await ctx.api(C, "GET", `/empresas/${pizzaria.id}/operacao`)).statusCode,
      404,
    );
    assert.equal(
      (await ctx.api(C, "GET", `/empresas/${pizzaria.id}/base`)).statusCode,
      404,
    );
    assert.equal(
      (await ctx.api(A, "GET", `/empresas/${outraDona.id}/operacao`))
        .statusCode,
      404,
    );
    // O painel da Farmácia (mesma dona) não mostra a operação da Pizzaria.
    const daFarmacia = await painel(farmacia);
    assert.equal(daFarmacia.fila.length, 0);
    assert.equal(
      daFarmacia.baseConfigurada,
      false,
      "sem ponto confirmado não há geofence",
    );
  });
});

describe("realtime da operação", () => {
  it("empresa recebe o painel; o entregador recebe só a própria situação", async () => {
    await sairDaBase(J, joao);
    const [socketEmpresa, socketJoao, socketPaulo] = await Promise.all([
      ctx.conectar(como(A, pizzaria.identidadeId)),
      ctx.conectar(J),
      ctx.conectar(P),
    ]);
    const paineis = coletar<EventoFilaAtualizada>(
      socketEmpresa,
      EVENTO_FILA_ATUALIZADA,
    );
    const doJoao = coletar<EventoSituacaoOperacional>(
      socketJoao,
      EVENTO_SITUACAO_OPERACIONAL,
    );
    const doPaulo = coletar<EventoSituacaoOperacional>(
      socketPaulo,
      EVENTO_SITUACAO_OPERACIONAL,
    );
    const painelNoEntregador = coletar<EventoFilaAtualizada>(
      socketJoao,
      EVENTO_FILA_ATUALIZADA,
    );

    await chegarNaBase(J, joao);
    await aguardarAte(() => paineis.length >= 1 && doJoao.length >= 1);

    assert.ok(
      paineis.at(-1)?.painel.fila.some((item) => item.id === joao),
      "a empresa vê a fila atualizada",
    );
    assert.equal(doJoao.at(-1)?.situacao.entregadorId, joao);
    assert.equal(doJoao.at(-1)?.situacao.naBase, true);
    assert.equal(
      painelNoEntregador.length,
      0,
      "o entregador não recebe o painel da empresa",
    );
    assert.equal(
      doPaulo.length,
      0,
      "ninguém recebe a situação de outro entregador",
    );
    // Nenhuma coordenada trafega no realtime.
    assert.equal(JSON.stringify(paineis).includes("latitude"), false);
  });
});

describe("aptidão operacional", () => {
  it("entregador inapto não entra na fila, mesmo aceitando e na base", async () => {
    await chegarNaBase(J, joao);
    assert.ok((await painel()).fila.some((item) => item.id === joao));

    // Gancho operacional (pendência a resolver), separado de disponibilidade e de acerto financeiro.
    await ctx.banco
      .update(entregadoresEmpresa)
      .set({ aptoParaSaida: false })
      .where(eq(entregadoresEmpresa.id, joao));
    assert.equal(
      (
        await ctx.api(J, "PATCH", `/entregas/vinculos/${joao}`, {
          disponivel: false,
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (
        await ctx.api(J, "PATCH", `/entregas/vinculos/${joao}`, {
          disponivel: true,
        })
      ).statusCode,
      200,
    );

    const quadro = await painel();
    assert.equal(
      quadro.fila.some((item) => item.id === joao),
      false,
      "inapto não entra na fila",
    );
    assert.ok(
      quadro.foraDaBase.some(
        (item) => item.id === joao && item.estado === "inapto",
      ),
    );

    await ctx.banco
      .update(entregadoresEmpresa)
      .set({ aptoParaSaida: true })
      .where(eq(entregadoresEmpresa.id, joao));
  });
});
