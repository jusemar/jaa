import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SaidaEntrega } from "@jaa/contratos";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AreaLogisticaEmpresa } from "./area-logistica-empresa.tsx";
import { AreaSaidasEmpresa, classeStatusSaida, filtrarSaidasDaOperacao, identificacaoDoEntregador, rotuloStatusSaida } from "./area-saidas-empresa.tsx";

const uuid = "11111111-1111-4111-8111-111111111111";

describe("organização da logística", () => {
  it("abre em Operação, oferece as três abas e mantém mapas fechados", () => {
    const html = renderToStaticMarkup(createElement(AreaLogisticaEmpresa, { empresaId: uuid, nomeEmpresa: "Pizzaria" }));
    assert.ok(html.includes("Operação"));
    assert.ok(html.includes("Entregadores"));
    assert.ok(html.includes("Zonas e automação"));
    assert.ok(html.includes("Em formação"));
    assert.ok(html.includes("Aguardando retirada"));
    assert.ok(html.includes("Em andamento"));
    assert.ok(html.includes("Montar saída manual"));
    assert.equal(html.includes("data-mapa-percurso"), false);
  });
});

const saida = (status: SaidaEntrega["status"] = "em_andamento"): SaidaEntrega => ({
  id: uuid,
  empresa: { identidadeId: uuid, nome: "Pizzaria", nomeUsuario: "pizzaria", slug: "pizzaria" },
  entregador: { identidadeId: uuid, tipo: "pessoal", nomeExibicao: "Entregador 1", nomeUsuario: "entregador1" },
  status,
  versaoSequencia: 1,
  paradas: [
    {
      id: uuid,
      pedidoId: uuid,
      numeroPedido: 3,
      posicao: 1,
      statusPedido: status === "concluida" ? "entregue" : "saiu_para_entrega",
      destino: {
        enderecoId: uuid,
        cep: "30123000",
        logradouro: "Rua das Flores",
        numero: "24",
        complemento: null,
        bairro: "Centro",
        cidade: "Belo Horizonte",
        uf: "MG",
        pontoReferencia: null,
        latitude: -19.92,
        longitude: -43.94,
        localizacaoConfirmadaEm: "2026-09-20T12:00:00.000Z",
      },
      cliente: { identidadeId: uuid, tipo: "pessoal", nomeExibicao: "Cliente", nomeUsuario: "cliente" },
      totalCentavos: 3990,
      encerradaEm: status === "concluida" ? "2026-09-20T13:00:00.000Z" : null,
      motivoEncerramento: status === "concluida" ? "Pedido entregue" : null,
    },
  ],
  rota: null,
  zonaPrincipal: { id: uuid, nome: "Zona A" },
  zonasCombinadas: [],
  automatica: true,
  criadoEm: "2026-09-20T12:00:00.000Z",
  formacaoIniciadaEm: null,
  prazoFormacaoEm: null,
  fechadaEm: "2026-09-20T12:05:00.000Z",
  atribuidaEm: "2026-09-20T12:06:00.000Z",
  liberadaEm: "2026-09-20T12:07:00.000Z",
  iniciadaEm: status === "em_andamento" || status === "concluida" ? "2026-09-20T12:10:00.000Z" : null,
  concluidaEm: status === "concluida" ? "2026-09-20T13:00:00.000Z" : null,
});

describe("apresentação da aba Operação", () => {
  const render = (aberta: boolean) =>
    renderToStaticMarkup(
      createElement(AreaSaidasEmpresa, {
        empresaId: uuid,
        nomeEmpresa: "Pizzaria",
        saidasIniciais: [saida()],
        rotasAbertasIniciais: aberta ? [uuid] : [],
      }),
    );

  it("mostra filtros com contagens derivadas, incluindo concluídas", () => {
    const rotas = [saida("em_formacao"), { ...saida("liberada_retirada"), id: "22222222-2222-4222-8222-222222222222" }, { ...saida("concluida"), id: "33333333-3333-4333-8333-333333333333" }];
    assert.equal(filtrarSaidasDaOperacao(rotas, "todos").length, 3);
    assert.equal(filtrarSaidasDaOperacao(rotas, "formacao").length, 1);
    assert.equal(filtrarSaidasDaOperacao(rotas, "retirada").length, 1);
    assert.equal(filtrarSaidasDaOperacao(rotas, "andamento").length, 0);
    assert.equal(filtrarSaidasDaOperacao(rotas, "concluidas").length, 1);
  });

  it("inicia o accordion fechado com resumo essencial e sem mapa", () => {
    const html = render(false);
    assert.ok(html.includes("<details"));
    assert.equal(html.includes("<details open"), false);
    assert.ok(html.includes("Em entrega"));
    assert.ok(html.includes("Rota Zona A"));
    assert.ok(html.includes("1 pedido · Pedido #3"));
    assert.ok(html.includes("Entregador: Entregador 1"));
    assert.equal(html.includes("Sequência sugerida"), false);
    assert.equal(html.includes("data-mapa-percurso"), false);
  });

  it("quando aberto mostra os detalhes, mas mantém o mapa fechado", () => {
    const html = render(true);
    assert.ok(html.includes("<details open"));
    assert.ok(html.includes("Sequência sugerida"));
    assert.ok(html.includes("Próxima parada"));
    assert.ok(html.includes("Exibir mapa"));
    assert.equal(html.includes("data-mapa-percurso"), false);
  });

  it("usa classes visuais distintas sem retirar o texto do status", () => {
    assert.notEqual(classeStatusSaida("em_formacao"), classeStatusSaida("em_andamento"));
    assert.notEqual(classeStatusSaida("em_andamento"), classeStatusSaida("concluida"));
  });
});

describe("identificação operacional da saída", () => {
  const identificacao = (status: SaidaEntrega["status"], nome: string | null) =>
    identificacaoDoEntregador({
      status,
      entregador: nome ? { identidadeId: uuid, tipo: "pessoal", nomeExibicao: nome, nomeUsuario: "entregador" } : null,
    });

  it("distingue rota sem entregador da rota atribuída", () => {
    assert.equal(identificacao("aguardando_entregador", null), "Aguardando entregador");
    assert.equal(identificacao("liberada_retirada", "Paulo"), "Entregador: Paulo");
  });

  it("apresenta saída em andamento como Em entrega", () => {
    assert.equal(rotuloStatusSaida({ status: "em_andamento" } as SaidaEntrega), "Em entrega");
  });
});
