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
  subtotalCentavos: 7980,
  freteOriginalCentavos: 0,
  descontoFreteCentavos: 0,
  freteFinalCentavos: 0,
  zonaEntregaId: null,
  zonaEntregaNome: null,
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
  subtotalCentavos: 9180,
  freteFinalCentavos: 0,
  zonaEntregaNome: null,
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
  exigeRetornoBase: false,
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

describe("recusa do servidor na área de pedidos", () => {
  it("atribuição/avanço recusados: o aviso é mostrado DEPOIS da releitura (que limpa o erro)", async () => {
    // Causa do "atribuiu, mas não apareceu": a releitura (`abrir`) chamava setErro(null) e apagava o
    // 409 (ex.: pedido já dentro da saída automática). Sem DOM nos testes: garantia estrutural.
    const { readFileSync } = await import("node:fs");
    const fonte = readFileSync(new URL("./area-pedidos-empresa.tsx", import.meta.url), "utf8");
    assert.match(fonte, /if \(!resultado\.ok\) \{[\s\S]*?await abrir\(pedidoId\);\s*setErro\(resultado\.mensagem\);/);
    assert.match(fonte, /await carregar\(\);\s*setErro\(resultado\.mensagem\);/);
  });
});

describe("atribuição manual de pedido que está numa saída que ainda não saiu", () => {
  it("a MESMA ação pede confirmação curta e, confirmada, reenvia com transferirDaSaida", async () => {
    const { ConfirmarTransferencia } = await import("../../entregas/components/entrega-do-pedido.tsx");
    const html = renderToStaticMarkup(createElement(ConfirmarTransferencia, { nomeEntregador: "Motoboy Teste", ocupado: false, aoConfirmar: () => {}, aoCancelar: () => {} }));
    assert.ok(html.includes('role="alertdialog"'));
    assert.ok(html.includes("Deseja atribuí-lo a Motoboy Teste?"));
    assert.ok(html.includes("Atribuir mesmo assim"));
    assert.ok(html.includes("Cancelar"));

    const { readFileSync } = await import("node:fs");
    const fonte = readFileSync(new URL("./area-pedidos-empresa.tsx", import.meta.url), "utf8");
    assert.match(fonte, /resultado\.codigo === "PEDIDO_EM_SAIDA_TRANSFERIVEL"/);
    assert.match(fonte, /aoConfirmar=\{\(\) => void atribuir\(transferencia\.pedidoId, transferencia\.entregadorId, true\)\}/);
    // Sucesso aparece e a tela relê (sem F5); nenhum fluxo paralelo de transferência.
    assert.match(fonte, /avisar\.sucesso\(/);
    assert.equal((fonte.match(/atribuirEntrega\(/g) ?? []).length, 1);
  });
});

describe("lista → página/filtros → Abrir → tela exclusiva do pedido → Voltar → mesma página/filtros", () => {
  const lerFonte = async (arquivo: string) => (await import("node:fs")).readFileSync(new URL(arquivo, import.meta.url), "utf8");

  it("cada pedido tem o botão 'Abrir' e os dados do item também abrem — dois botões irmãos, sem aninhar", async () => {
    const html = renderToStaticMarkup(createElement(ListaPedidosEmpresa, { pedidos: [linha], aoAbrir: () => {} }));
    const botao = html.match(/<button[^>]*data-botao-abrir[^>]*>\s*Abrir\s*<\/button>/)?.[0] ?? "";
    assert.ok(botao.includes('type="button"') && !botao.includes("disabled"), botao);
    const item = html.slice(html.indexOf("data-abrir-pedido"), html.indexOf("data-botao-abrir"));
    assert.ok(item.includes("Pedido #4") && !item.slice(0, item.indexOf("</button>")).includes("<button"), "nenhum botão dentro de outro");
    const fonte = await lerFonte("./lista-pedidos-empresa.tsx");
    assert.equal((fonte.match(/onClick=\{\(\) => aoAbrir\(pedido\)\}/g) ?? []).length, 2);
  });

  it("a área mostra UMA tela por vez: o pedido aberto substitui a lista (nada de detalhe abaixo dela)", async () => {
    const fonte = await lerFonte("./area-pedidos-empresa.tsx");
    const tela = fonte.slice(fonte.indexOf("<section ref={secaoRef}"));
    const [doPedido, daLista] = [tela.slice(tela.indexOf("{aberto ? ("), tela.indexOf(") : (")), tela.slice(tela.indexOf(") : ("), tela.indexOf("{erro && ("))];
    assert.ok(doPedido.includes("data-voltar-para-pedidos") && doPedido.includes("Voltar para pedidos") && doPedido.includes("<DetalhePedido"));
    assert.ok(!doPedido.includes("<ListaPedidosEmpresa") && !doPedido.includes("<FiltrosPedidos") && !doPedido.includes("<PaginacaoPedidos"));
    assert.ok(daLista.includes("<ListaPedidosEmpresa") && daLista.includes("<FiltrosPedidos") && daLista.includes("<LegendaStatusEntrega") && daLista.includes("<PaginacaoPedidos") && daLista.includes("Atualizar"));
    assert.ok(!daLista.includes("<DetalhePedido"));
    assert.equal((fonte.match(/<DetalhePedido/g) ?? []).length, 1);
    // A solução provisória saiu por inteiro.
    assert.ok(!/scrollIntoView|scroll-mt|detalheRef|data-detalhe-do-pedido-aberto/.test(fonte));
    // Nada de modal/drawer para o pedido.
    assert.ok(!/<Janela|<Folha|role="dialog"/.test(fonte));
  });

  it("a tela do pedido mantém TODAS as ações (entrega, transferência, avançar, cancelar) e o título com o cliente", async () => {
    const fonte = await lerFonte("./area-pedidos-empresa.tsx");
    for (const parte of ["<EntregaDoPedidoEmpresa", "<ConfirmarTransferencia", "<AcoesPedidoEmpresa", "avancarStatusPedido(empresaId", "cancelarPedido(empresaId", "titulo={`Pedido #${aberto.numero} — ${aberto.cliente.nomeExibicao}`}"]) assert.ok(fonte.includes(parte), parte);
  });

  it("abrir e voltar NÃO mexem na consulta (filtro + página): quem volta cai na mesma lista", async () => {
    const fonte = await lerFonte("./area-pedidos-empresa.tsx");
    const abrir = fonte.slice(fonte.indexOf("async function abrir("), fonte.indexOf("async function atribuir("));
    const voltar = fonte.slice(fonte.indexOf("function voltarParaPedidos()"), fonte.indexOf("const resumo ="));
    assert.ok(abrir.includes("setAberto(resultado.dados)") && !abrir.includes("setConsulta") && !abrir.includes("setLista"));
    assert.ok(voltar.includes("setAberto(null)") && !voltar.includes("setConsulta") && !voltar.includes("setLista"));
    // Só a página pedida vem do servidor.
    assert.match(fonte, /listarPedidosDaEmpresa\(empresaId, \{ filtro, antesDe: cursor, limite: PEDIDOS_POR_PAGINA \}\)/);
  });

  it("DetalhePedido: sem `aoFechar` não há X e o título pode ser de quem usa; o padrão (cliente/conversa) não mudou", () => {
    const base = { ...pedido("recebido", []), numero: 16 };
    const doCliente = renderToStaticMarkup(createElement(DetalhePedido, { pedido: base, aoFechar: () => {} }));
    assert.ok(doCliente.includes('aria-label="Fechar pedido"') && doCliente.includes(`Pedido #16 — ${base.empresa.nome}`));
    const daEmpresa = renderToStaticMarkup(createElement(DetalhePedido, { pedido: base, titulo: "Pedido #16 — Pedro" }));
    assert.ok(!daEmpresa.includes('aria-label="Fechar pedido"') && daEmpresa.includes("Pedido #16 — Pedro") && daEmpresa.includes('aria-label="Detalhe do pedido"'));
    assert.ok(texto(daEmpresa).includes(`Cliente: ${base.cliente.nomeExibicao}`) && daEmpresa.includes("data-total-pedido"));
  });
});

describe("paginação da lista de pedidos (10 por página)", () => {
  const A = "018f0000-0000-7000-8000-00000000000a";
  const B = "018f0000-0000-7000-8000-00000000000b";

  it("contagem e páginas: menos de 10, exatamente 10, mais de 10, página do meio e a última", async () => {
    const { PEDIDOS_POR_PAGINA, resumoDaPagina } = await import("../lib/paginacao-pedidos.ts");
    assert.equal(PEDIDOS_POR_PAGINA, 10);
    assert.deepEqual(pick(resumoDaPagina({ pagina: 1, quantidadeNaPagina: 3, total: 3, temProxima: false })), ["3 pedidos", 1, 1, false, false]);
    assert.equal(resumoDaPagina({ pagina: 1, quantidadeNaPagina: 1, total: 1, temProxima: false }).contagem, "1 pedido");
    assert.deepEqual(pick(resumoDaPagina({ pagina: 1, quantidadeNaPagina: 10, total: 10, temProxima: true })), ["10 pedidos", 1, 1, false, false], "10 exatos: a API oferece cursor (página cheia), mas o total diz que não há mais nada");
    assert.deepEqual(pick(resumoDaPagina({ pagina: 1, quantidadeNaPagina: 10, total: 36, temProxima: true })), ["1–10 de 36 pedidos", 1, 4, false, true]);
    assert.deepEqual(pick(resumoDaPagina({ pagina: 3, quantidadeNaPagina: 10, total: 36, temProxima: true })), ["21–30 de 36 pedidos", 3, 4, true, true]);
    assert.deepEqual(pick(resumoDaPagina({ pagina: 4, quantidadeNaPagina: 6, total: 36, temProxima: false })), ["31–36 de 36 pedidos", 4, 4, true, false]);
    function pick(r: ReturnType<typeof resumoDaPagina>) {
      return [r.contagem, r.pagina, r.totalPaginas, r.temAnterior, r.temProxima];
    }
  });

  it("próxima/anterior guardam o caminho; trocar de filtro volta à página 1; página que sumiu recua", async () => {
    const { CONSULTA_INICIAL, cursorDaPagina, irParaAnterior, irParaProxima, paginaAtual, paginaFicouVazia, trocarFiltro } = await import("../lib/paginacao-pedidos.ts");
    const p2 = irParaProxima(CONSULTA_INICIAL, A);
    const p3 = irParaProxima(p2, B);
    assert.deepEqual([paginaAtual(CONSULTA_INICIAL), paginaAtual(p2), paginaAtual(p3)], [1, 2, 3]);
    assert.deepEqual([cursorDaPagina(CONSULTA_INICIAL), cursorDaPagina(p2), cursorDaPagina(p3)], [undefined, A, B]);
    assert.deepEqual(irParaAnterior(p3), p2);
    assert.equal(irParaAnterior(CONSULTA_INICIAL), CONSULTA_INICIAL);
    assert.equal(irParaProxima(p3, null), p3, "sem cursor não há próxima página");
    assert.deepEqual(trocarFiltro(p3, "em_preparacao"), { filtro: "em_preparacao", cursores: [] });
    assert.equal(trocarFiltro(p3, "todos"), p3, "o mesmo filtro não perde a página");
    assert.ok(paginaFicouVazia(p3, 0) && !paginaFicouVazia(p3, 2) && !paginaFicouVazia(CONSULTA_INICIAL, 0));
  });

  it("PaginacaoPedidos: contagem + ‹ Anterior · Página 1 de 4 · Próxima ›; com uma página só, apenas a contagem", async () => {
    const { PaginacaoPedidos } = await import("./lista-pedidos-empresa.tsx");
    const { resumoDaPagina } = await import("../lib/paginacao-pedidos.ts");
    const render = (dados: Parameters<typeof resumoDaPagina>[0]) => renderToStaticMarkup(createElement(PaginacaoPedidos, { resumo: resumoDaPagina(dados), aoAnterior: () => {}, aoProxima: () => {} }));
    const primeira = render({ pagina: 1, quantidadeNaPagina: 10, total: 36, temProxima: true });
    assert.ok(texto(primeira).includes("1–10 de 36 pedidos") && texto(primeira).includes("Página 1 de 4") && texto(primeira).includes("Anterior") && texto(primeira).includes("Próxima"));
    assert.match(primeira, /data-pagina-anterior="true" disabled=""/);
    assert.doesNotMatch(primeira, /data-pagina-proxima="true" disabled=""/);
    assert.match(render({ pagina: 4, quantidadeNaPagina: 6, total: 36, temProxima: false }), /data-pagina-proxima="true" disabled=""/);
    const unica = render({ pagina: 1, quantidadeNaPagina: 3, total: 3, temProxima: false });
    assert.ok(texto(unica).includes("3 pedidos") && !unica.includes("data-pagina-proxima"));
    assert.equal(render({ pagina: 1, quantidadeNaPagina: 0, total: 0, temProxima: false }), "");
    assert.ok(!primeira.includes(" style="));
  });
});
