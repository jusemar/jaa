import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  Pedido,
  PedidoDaEmpresa,
  SaidaEntrega,
  StatusPedido,
  StatusSaida,
} from "@jaa/contratos";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AcoesPedidoEmpresa } from "./acoes-pedido-empresa.tsx";
import { DetalhePedido, TimelinePedido } from "./apresentacao-pedido.tsx";
import { ListaPedidosEmpresa } from "./lista-pedidos-empresa.tsx";
import {
  APRESENTACAO_STATUS_ENTREGA,
  LegendaStatusEntrega,
  ResumoLogisticoPedido,
} from "./resumo-logistico-pedido.tsx";

const texto = (html: string) => html.replace(/<[^>]+>/g, "").replace(/ /g, " ");
const uuid = (n: number) =>
  `${String(n).repeat(8)}-0000-4000-8000-000000000000`;

const evento = (
  status: StatusPedido,
  minuto: string,
  motivo: string | null = null,
) => ({
  id: uuid(status.length),
  status,
  ocorridoEm: `2026-09-15T12:${minuto}:00.000Z`,
  motivo,
});

const pedido = (
  status: StatusPedido,
  historico: Pedido["historico"],
  motivoCancelamento: string | null = null,
): Pedido => ({
  id: uuid(4),
  numero: 4,
  status,
  motivoCancelamento,
  historico,
  origem: "conversa",
  conversaId: uuid(5),
  empresa: {
    identidadeId: uuid(6),
    nome: "Pizzaria BH",
    nomeUsuario: "pizzariabh",
    slug: "pizzaria-bh",
  },
  cliente: {
    identidadeId: uuid(7),
    nomeExibicao: "Bruna Cliente",
    nomeUsuario: "bruna",
    tipo: "pessoal",
  },
  itens: [
    {
      id: uuid(8),
      produtoId: uuid(9),
      nomeProduto: "Pizza Calabresa",
      precoUnitarioCentavos: 3990,
      quantidade: 2,
      subtotalCentavos: 7980,
      escolhas: [], observacao: null,
    },
  ],
  destino: {
    enderecoId: "66666666-0000-4000-8000-000000000000",
    cep: "30123000",
    logradouro: "Rua das Flores",
    numero: "150",
    complemento: "Apto 302",
    bairro: "Centro",
    cidade: "Belo Horizonte",
    uf: "MG",
    pontoReferencia: "Portão azul",
    latitude: -19.919125,
    longitude: -43.938602,
    localizacaoConfirmadaEm: "2026-09-15T11:55:00.000Z",
  },
  formaPagamentoNaEntrega: "dinheiro",
  trocoParaCentavos: 10000,
  totalCentavos: 7980,
  criadoEm: "2026-09-15T12:00:00.000Z",
  atualizadoEm: "2026-09-15T12:09:00.000Z",
});

const emPreparacao = pedido("em_preparacao", [
  evento("recebido", "00"),
  evento("confirmado", "05"),
  evento("em_preparacao", "09"),
]);

describe("timeline do acompanhamento", () => {
  it("distingue concluídas, atual e futuras — e só as reais têm horário", () => {
    const html = renderToStaticMarkup(
      createElement(TimelinePedido, { pedido: emPreparacao }),
    );
    assert.ok(html.includes('data-etapa="recebido" data-situacao="concluida"'));
    assert.ok(
      html.includes('data-etapa="em_preparacao" data-situacao="atual"'),
    );
    assert.ok(html.includes('data-etapa="entregue" data-situacao="futura"'));
    const conteudo = texto(html);
    for (const esperado of [
      "Pedido recebido",
      "Em preparação",
      "Pronto",
      "Saiu para entrega",
      "Entregue",
    ]) {
      assert.ok(conteudo.includes(esperado), esperado);
    }
    // Etapas futuras aparecem sem horário inventado.
    assert.equal(
      (html.match(/data-situacao="futura"[^>]*>[^<]*—/g) ?? []).length,
      0,
    );
  });

  it("pedido cancelado encerra a timeline e mostra o motivo, sem etapas futuras", () => {
    const cancelado = pedido(
      "cancelado",
      [
        evento("recebido", "00"),
        evento("confirmado", "05"),
        evento("cancelado", "20", "Produto indisponível"),
      ],
      "Produto indisponível",
    );
    const html = renderToStaticMarkup(
      createElement(DetalhePedido, { pedido: cancelado, aoFechar: () => {} }),
    );

    assert.ok(html.includes('data-status-pedido="cancelado"'));
    assert.ok(
      texto(html).includes("Motivo do cancelamento: Produto indisponível"),
    );
    assert.ok(html.includes('data-etapa="cancelado" data-situacao="atual"'));
    assert.equal(html.includes('data-situacao="futura"'), false);
  });
});

describe("ações operacionais da empresa", () => {
  const acoes = (dados: Pedido) =>
    renderToStaticMarkup(
      createElement(AcoesPedidoEmpresa, {
        pedido: dados,
        ocupado: false,
        aoAvancar: () => {},
        aoCancelar: () => {},
      }),
    );

  it("mostra só a próxima ação válida, nunca sete botões de status", () => {
    const proximas: Array<[StatusPedido, string]> = [
      ["recebido", "Iniciar preparação"],
      ["confirmado", "Iniciar preparação"],
      ["em_preparacao", "Marcar como pronto"],
      ["saiu_para_entrega", "Marcar como entregue"],
      ["em_rota", "Marcar como entregue"],
    ];
    for (const [status, rotulo] of proximas) {
      const html = acoes(pedido(status, [evento("recebido", "00")]));
      const conteudo = texto(html);
      assert.ok(conteudo.includes(rotulo), rotulo);
      assert.equal(
        (html.match(/data-avancar-pedido/g) ?? []).length,
        1,
        status,
      );
      for (const outro of proximas.filter(([, texto]) => texto !== rotulo))
        assert.equal(
          conteudo.includes(outro[1]),
          false,
          `${status} não mostra ${outro[1]}`,
        );
      assert.ok(conteudo.includes("Cancelar pedido"), status);
    }
    const pronto = acoes(pedido("pronto", [evento("recebido", "00")]));
    assert.equal(
      pronto.includes("data-avancar-pedido"),
      false,
      "pedido pronto só sai pela rota liberada",
    );
    assert.ok(texto(pronto).includes("Cancelar pedido"));
  });

  it("estados terminais não oferecem avanço nem cancelamento", () => {
    for (const status of ["entregue", "cancelado"] as const) {
      const html = acoes(
        pedido(
          status,
          [evento("recebido", "00")],
          status === "cancelado" ? "Produto indisponível" : null,
        ),
      );
      assert.ok(html.includes("data-sem-acoes"), status);
      assert.equal(html.includes("data-avancar-pedido"), false, status);
      assert.equal(html.includes("data-cancelar-pedido"), false, status);
    }
  });

  it("cancelar não acontece por um clique: primeiro motivo e confirmação", () => {
    const html = acoes(emPreparacao);
    assert.ok(html.includes("data-cancelar-pedido"));
    // A confirmação e o motivo só aparecem depois de pedir para cancelar.
    assert.equal(html.includes("data-confirmar-cancelamento"), false);
    assert.equal(html.includes('name="motivoCancelamento"'), false);
  });
});

const linha: PedidoDaEmpresa = {
  id: uuid(4),
  numero: 4,
  status: "recebido",
  cliente: {
    identidadeId: uuid(7),
    nomeExibicao: "Bruna Cliente",
    nomeUsuario: "bruna",
    tipo: "pessoal",
  },
  conversaId: uuid(5),
  quantidadeItens: 3,
  totalCentavos: 9180,
  formaPagamentoNaEntrega: "dinheiro",
  trocoParaCentavos: 10000,
  criadoEm: "2026-09-15T19:42:00.000Z",
};

describe("lista operacional da empresa", () => {
  it("cada linha mostra cliente, itens, total, pagamento e status", () => {
    const conteudo = texto(
      renderToStaticMarkup(
        createElement(ListaPedidosEmpresa, {
          pedidos: [linha],
          aoAbrir: () => {},
        }),
      ),
    );
    for (const esperado of [
      "Pedido #4",
      "Bruna Cliente",
      "3 itens",
      "R$ 91,80",
      "Dinheiro na entrega",
      "Pedido: Recebido",
      "Abrir",
    ]) {
      assert.ok(conteudo.includes(esperado), esperado);
    }
  });

  it("pedido sem saída não ganha bloco logístico vazio", () => {
    const html = renderToStaticMarkup(
      createElement(ListaPedidosEmpresa, {
        pedidos: [linha],
        saidas: [],
        aoAbrir: () => {},
      }),
    );
    assert.equal(html.includes("data-resumo-logistico"), false);
  });

  it("lista vazia explica que não há pedidos", () => {
    assert.ok(
      texto(
        renderToStaticMarkup(
          createElement(ListaPedidosEmpresa, {
            pedidos: [],
            aoAbrir: () => {},
          }),
        ),
      ).includes("Nenhum pedido aqui."),
    );
  });

  it("padroniza estados terminais mesmo sem saída associada", () => {
    const entregue = renderToStaticMarkup(
      createElement(ListaPedidosEmpresa, {
        pedidos: [{ ...linha, status: "entregue" }],
        saidas: [],
        aoAbrir: () => {},
      }),
    );
    assert.ok(texto(entregue).includes("Pedido: Entregue"));
    assert.ok(texto(entregue).includes("Entrega: Concluído"));
    assert.ok(entregue.includes(APRESENTACAO_STATUS_ENTREGA.concluida.fundo));

    const cancelado = renderToStaticMarkup(
      createElement(ListaPedidosEmpresa, {
        pedidos: [{ ...linha, status: "cancelado" }],
        saidas: [],
        aoAbrir: () => {},
      }),
    );
    assert.ok(texto(cancelado).includes("Pedido: Cancelado"));
    assert.ok(texto(cancelado).includes("Entrega: Cancelada"));
    assert.ok(cancelado.includes(APRESENTACAO_STATUS_ENTREGA.cancelada.fundo));
  });
});

const saida = (status: StatusSaida, entregador = true): SaidaEntrega => ({
  id: uuid(status.length + 20),
  empresa: {
    identidadeId: uuid(6),
    nome: "Pizzaria BH",
    nomeUsuario: "pizzariabh",
    slug: "pizzaria-bh",
  },
  entregador: entregador
    ? {
        identidadeId: uuid(3),
        tipo: "pessoal",
        nomeExibicao: "Entregador 2",
        nomeUsuario: "entregador2",
      }
    : null,
  status,
  versaoSequencia: 1,
  paradas: [],
  rota: null,
  zonaPrincipal: { id: uuid(8), nome: "D" },
  zonasCombinadas: [],
  automatica: true,
  criadoEm: "2026-09-15T12:00:00.000Z",
  formacaoIniciadaEm: null,
  prazoFormacaoEm: null,
  fechadaEm: null,
  atribuidaEm: entregador ? "2026-09-15T12:05:00.000Z" : null,
  liberadaEm:
    status === "liberada_retirada" ||
    status === "em_andamento" ||
    status === "concluida"
      ? "2026-09-15T12:10:00.000Z"
      : null,
  iniciadaEm:
    status === "em_andamento" || status === "concluida"
      ? "2026-09-15T12:15:00.000Z"
      : null,
  concluidaEm: status === "concluida" ? "2026-09-15T13:00:00.000Z" : null,
});

describe("resumo logístico do pedido", () => {
  const render = (status: StatusSaida, comEntregador = true) =>
    texto(
      renderToStaticMarkup(
        createElement(ResumoLogisticoPedido, {
          statusPedido: status === "concluida" ? "entregue" : "pronto",
          saida: saida(status, comEntregador),
        }),
      ),
    );

  it("apresenta os estados reais sem substituir o status do pedido", () => {
    assert.ok(render("em_formacao", false).includes("Entrega: Em formação"));
    assert.ok(
      render("aguardando_entregador", false).includes(
        "Entrega: Aguardando entregador",
      ),
    );
    assert.ok(
      render("liberada_retirada").includes("Entrega: Liberado para retirada"),
    );
    assert.ok(render("em_andamento").includes("Entrega: Em rota"));
    assert.ok(render("concluida").includes("Entrega: Concluído"));
  });

  it("mostra rota e entregador reais, ou aguardando atribuição", () => {
    assert.ok(render("liberada_retirada").includes("Rota: D"));
    assert.ok(render("liberada_retirada").includes("Entregador: Entregador 2"));
    assert.ok(
      render("aguardando_entregador", false).includes(
        "Entregador: Aguardando atribuição",
      ),
    );
  });

  it("cada estado usa cor exclusiva e a legenda reutiliza exatamente a mesma apresentação", () => {
    const cores = Object.values(APRESENTACAO_STATUS_ENTREGA).map(
      (item) => item.fundo,
    );
    assert.equal(new Set(cores).size, cores.length);
    const legenda = renderToStaticMarkup(createElement(LegendaStatusEntrega));
    for (const item of Object.values(APRESENTACAO_STATUS_ENTREGA)) {
      assert.ok(legenda.includes(item.rotulo));
      assert.ok(legenda.includes(item.fundo));
    }
    assert.equal(
      legenda.includes("rounded-full bg-"),
      false,
      "a legenda usa chips, não bolinhas isoladas",
    );
  });

  it("aplica ao card o mesmo fundo central de cada estado da saída", () => {
    for (const status of [
      "em_formacao",
      "aguardando_entregador",
      "preparada",
      "liberada_retirada",
      "em_andamento",
      "concluida",
    ] as const) {
      const rota = {
        ...saida(status),
        paradas: [{ pedidoId: linha.id } as SaidaEntrega["paradas"][number]],
      };
      const html = renderToStaticMarkup(
        createElement(ListaPedidosEmpresa, {
          pedidos: [linha],
          saidas: [rota],
          aoAbrir: () => {},
        }),
      );
      assert.ok(
        html.includes(APRESENTACAO_STATUS_ENTREGA[status].fundo),
        status,
      );
    }
  });
});
