import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  EntregaAtribuida,
  FilaDoPedido,
  ParadaSaida,
  SaidaEntrega,
} from "@jaa/contratos";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AcaoIniciarSaida } from "./area-minhas-entregas.tsx";
import { FilaDoCliente, SequenciaDaSaida } from "./saida-apresentacao.tsx";

const texto = (html: string) => html.replace(/<[^>]+>/g, "").replace(/ /g, " ");
const uuid = (n: number) =>
  `${String(n).repeat(8)}-0000-4000-8000-000000000000`;

const parada = (
  n: number,
  posicao: number,
  encerradaEm: string | null = null,
): ParadaSaida => ({
  id: uuid(n),
  pedidoId: uuid(n + 1),
  numeroPedido: n,
  posicao,
  statusPedido: encerradaEm ? "entregue" : "saiu_para_entrega",
  destino: {
    enderecoId: uuid(n + 2),
    cep: "30123000",
    logradouro: `Rua ${n}`,
    numero: `${100 + n}`,
    complemento: null,
    bairro: "Centro",
    cidade: "Belo Horizonte",
    uf: "MG",
    pontoReferencia: null,
    latitude: -19.919125,
    longitude: -43.938602,
    localizacaoConfirmadaEm: "2026-09-16T11:55:00.000Z",
  },
  cliente: {
    identidadeId: uuid(n + 3),
    tipo: "pessoal",
    nomeExibicao: `Cliente ${n}`,
    nomeUsuario: `cliente${n}`,
  },
  totalCentavos: 3990,
  encerradaEm,
  motivoEncerramento: encerradaEm ? "Pedido entregue" : null,
});

const saida = (paradas: ParadaSaida[]): SaidaEntrega => ({
  id: uuid(1),
  empresa: {
    identidadeId: uuid(2),
    nome: "Pizzaria BH",
    nomeUsuario: "pizzariabh",
    slug: "pizzaria-bh",
  },
  entregador: {
    identidadeId: uuid(3),
    tipo: "pessoal",
    nomeExibicao: "Paulo Entregador",
    nomeUsuario: "paulo",
  },
  status: "em_andamento",
  versaoSequencia: 2,
  paradas,
  rota: null,
  zonaPrincipal: null,
  zonasCombinadas: [],
  automatica: false,
  criadoEm: "2026-09-16T12:00:00.000Z",
  formacaoIniciadaEm: null,
  prazoFormacaoEm: null,
  fechadaEm: "2026-09-16T12:05:00.000Z",
  atribuidaEm: "2026-09-16T12:05:00.000Z",
  liberadaEm: "2026-09-16T12:09:00.000Z",
  iniciadaEm: "2026-09-16T12:10:00.000Z",
  concluidaEm: null,
});

describe("sequência da saída", () => {
  const entrega: EntregaAtribuida = {
    pedidoId: uuid(2),
    numeroPedido: 1,
    empresa: saida([]).empresa,
    status: "saiu_para_entrega",
    destino: parada(1, 1).destino,
    cliente: parada(1, 1).cliente,
    itens: [{ nomeProduto: "Pizza Calabresa", quantidade: 2 }],
    totalCentavos: 3990,
    formaPagamentoNaEntrega: "cartao",
    trocoParaCentavos: null,
    atribuidoEm: "2026-09-16T12:05:00.000Z",
  };
  const render = (
    dados: SaidaEntrega,
    comReordenacao = false,
    entregas: EntregaAtribuida[] = [],
    comConclusao = false,
  ) =>
    renderToStaticMarkup(
      createElement(SequenciaDaSaida, {
        saida: dados,
        entregas,
        ...(comReordenacao ? { aoMover: () => {} } : {}),
        ...(comConclusao ? { aoConcluir: () => {} } : {}),
      }),
    );

  it("numera as paradas ativas e marca a próxima (posição operacional, não localização)", () => {
    const html = render(saida([parada(1, 1), parada(2, 2), parada(3, 3)]));
    const conteudo = texto(html);
    assert.ok(conteudo.includes("1ª parada · Pedido #1"));
    assert.ok(conteudo.includes("3ª parada · Pedido #3"));
    assert.ok(
      html.includes("data-proxima-parada"),
      "a primeira ativa é a próxima",
    );
    assert.equal((html.match(/data-proxima-parada/g) ?? []).length, 1);
    // Nada de prometer rota/tempo sem motor de roteamento.
    assert.ok(conteudo.includes("Sequência sugerida pelo Jaa"));
    for (const proibido of [
      "melhor rota",
      "rota mais rápida",
      "menor tempo",
      "km",
      "ETA",
      "minutos",
    ]) {
      assert.equal(
        conteudo.toLowerCase().includes(proibido.toLowerCase()),
        false,
        proibido,
      );
    }
  });

  it("paradas encerradas saem da sequência ativa e viram histórico", () => {
    const html = render(
      saida([
        parada(1, 1, "2026-09-16T12:40:00.000Z"),
        parada(2, 2),
        parada(3, 3),
      ]),
    );
    assert.ok(html.includes("data-parada-encerrada"));
    assert.ok(texto(html).includes("Pedido #1 · Cliente 1 — Pedido entregue"));
    // A sequência ativa renumera a partir da primeira que sobrou.
    assert.ok(texto(html).includes("1ª parada · Pedido #2"));
  });

  it("consolida endereço, cliente, itens, pagamento e status no card da parada", () => {
    const conteudo = texto(render(saida([parada(1, 1)]), false, [entrega]));
    for (const esperado of [
      "Rua 1, 101",
      "Centro, Belo Horizonte/MG",
      "Cliente: Cliente 1",
      "2 itens",
      "R$ 39,90",
      "Cartão na entrega",
      "Status: Saiu para entrega",
      "Ver itens",
      "2× Pizza Calabresa",
    ]) {
      assert.ok(conteudo.includes(esperado), esperado);
    }
  });

  it("oferece concluir somente a próxima parada de uma rota em andamento", () => {
    const html = render(
      saida([parada(1, 1), parada(2, 2)]),
      false,
      [entrega],
      true,
    );
    assert.equal((html.match(/data-concluir-parada/g) ?? []).length, 1);
    assert.ok(texto(html).includes("Marcar como entregue"));

    const preparada = {
      ...saida([parada(1, 1)]),
      status: "preparada" as const,
    };
    assert.equal(
      render(preparada, false, [entrega], true).includes(
        "data-concluir-parada",
      ),
      false,
    );
  });

  it("só oferece reordenar quando quem exibe é o entregador", () => {
    const unica = render(saida([parada(1, 1)]), true);
    assert.equal(unica.includes("data-subir-parada"), false);
    assert.equal(unica.includes("data-descer-parada"), false);
    assert.ok(texto(unica).includes("Parada única nesta rota."));

    assert.equal(
      render(saida([parada(1, 1), parada(2, 2)])).includes("data-subir-parada"),
      false,
    );
    const doEntregador = render(saida([parada(1, 1), parada(2, 2)]), true);
    assert.ok(doEntregador.includes("data-subir-parada"));
    assert.ok(doEntregador.includes("data-descer-parada"));
    // A primeira não sobe e a última não desce.
    assert.equal(
      (doEntregador.match(/data-subir-parada="true" disabled=""/g) ?? [])
        .length,
      1,
    );
    assert.equal(
      (doEntregador.match(/data-descer-parada="true" disabled=""/g) ?? [])
        .length,
      1,
    );
  });

  it("saída sem parada ativa explica o estado", () => {
    assert.ok(
      texto(render(saida([parada(1, 1, "2026-09-16T12:40:00.000Z")]))).includes(
        "Nenhuma entrega ativa nesta saída.",
      ),
    );
  });
});

describe("fila do cliente", () => {
  const render = (fila: FilaDoPedido) =>
    renderToStaticMarkup(createElement(FilaDoCliente, { fila }));

  it("mostra só a posição derivada do próprio pedido", () => {
    assert.ok(
      texto(
        render({ pedidoId: uuid(9), situacao: "na_fila", entregasAntes: 3 }),
      ).includes("3 entregas antes da sua"),
    );
    assert.ok(
      texto(
        render({ pedidoId: uuid(9), situacao: "na_fila", entregasAntes: 1 }),
      ).includes("1 entrega antes da sua"),
    );
    assert.ok(
      texto(
        render({
          pedidoId: uuid(9),
          situacao: "indo_ate_voce",
          entregasAntes: 0,
        }),
      ).includes("Indo até você"),
    );
    assert.ok(
      texto(
        render({
          pedidoId: uuid(9),
          situacao: "aguardando_saida",
          entregasAntes: 2,
        }),
      ).includes("separado para a entrega"),
    );
  });

  it("não revela nada de outros pedidos, clientes ou da rota", () => {
    const html = render({
      pedidoId: uuid(9),
      situacao: "na_fila",
      entregasAntes: 2,
    });
    for (const proibido of [
      "Cliente",
      "Rua",
      "Paulo",
      "sequência",
      "entregador",
    ]) {
      assert.equal(texto(html).includes(proibido), false, proibido);
    }
  });

  it("pedido fora de saída (ou encerrado) não mostra fila nenhuma", () => {
    assert.equal(
      render({ pedidoId: uuid(9), situacao: "sem_saida", entregasAntes: null }),
      "",
    );
    assert.equal(
      render({ pedidoId: uuid(9), situacao: "encerrado", entregasAntes: null }),
      "",
    );
  });
});

describe("iniciar a saída (tela do entregador)", () => {
  const render = (status: SaidaEntrega["status"], ocupado = false) =>
    renderToStaticMarkup(
      createElement(AcaoIniciarSaida, {
        saida: { ...saida([parada(1, 1)]), status },
        ocupado,
        aoIniciar: () => {},
        aoRecusar: () => {},
      }),
    );

  it("liberada e ainda não iniciada: mostra 'SAIR PARA ENTREGA'", () => {
    const html = render("liberada_retirada");
    assert.ok(html.includes("data-iniciar-saida"));
    assert.ok(html.includes("data-recusar-saida"));
    assert.ok(texto(html).includes("SAIR PARA ENTREGA"));
    assert.ok(texto(html).includes("Recusar rota"));
    assert.equal(html.includes('disabled=""'), false);
  });

  it("enquanto a ação está em curso, o botão fica desabilitado (sem toque duplo)", () => {
    assert.ok(render("liberada_retirada", true).includes('disabled=""'));
  });

  it("já em andamento: não oferece iniciar de novo nem duplica o estado operacional", () => {
    const html = render("em_andamento");
    assert.equal(html.includes("data-iniciar-saida"), false);
    assert.equal(html.includes("data-recusar-saida"), false);
    assert.equal(texto(html).includes("Saída em andamento"), false);
    assert.equal(texto(html).includes("Em entrega"), false);
  });

  it("antes da liberação ou depois da conclusão: nenhuma ação de início", () => {
    for (const status of [
      "em_formacao",
      "aguardando_entregador",
      "preparada",
      "concluida",
    ] as const) {
      assert.equal(
        render(status).includes("data-iniciar-saida"),
        false,
        status,
      );
      assert.equal(
        render(status).includes("data-recusar-saida"),
        false,
        status,
      );
    }
  });
});
