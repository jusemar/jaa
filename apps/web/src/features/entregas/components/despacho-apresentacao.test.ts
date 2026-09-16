import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PainelDespacho, SaidaEntrega } from "@jaa/contratos";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ConfiguracaoAutomacao, PendenciasForaDeZona, QuadroDeSaidas, formatarEspera } from "./painel-despacho.tsx";

const texto = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/ /g, " ").replace(/\s+/g, " ");
const uuid = (n: number) => `${String(n).repeat(8)}-0000-4000-8000-000000000000`;

const saida = (dados: Partial<SaidaEntrega> = {}): SaidaEntrega => ({
  id: uuid(1),
  empresa: { identidadeId: uuid(2), nome: "Pizzaria BH", nomeUsuario: "pizzariabh", slug: "pizzaria-bh" },
  entregador: null,
  status: "em_formacao",
  versaoSequencia: 1,
  paradas: [],
  rota: null,
  zonaPrincipal: { id: uuid(3), nome: "Centro" },
  zonasCombinadas: [],
  automatica: true,
  criadoEm: "2026-09-16T12:00:00.000Z",
  formacaoIniciadaEm: "2026-09-16T12:00:00.000Z",
  prazoFormacaoEm: "2026-09-16T12:15:00.000Z",
  fechadaEm: null,
  atribuidaEm: null,
  iniciadaEm: null,
  concluidaEm: null,
  ...dados,
});

const parada = (n: number) => ({
  id: uuid(n + 30),
  pedidoId: uuid(n + 40),
  posicao: n,
  statusPedido: "pronto" as const,
  destino: {
    enderecoId: uuid(n + 50),
    cep: "30123000",
    logradouro: "Rua das Flores",
    numero: `${100 + n}`,
    complemento: null,
    bairro: "Centro",
    cidade: "Belo Horizonte",
    uf: "MG" as const,
    pontoReferencia: null,
    latitude: -19.92,
    longitude: -43.94,
    localizacaoConfirmadaEm: "2026-09-16T11:55:00.000Z",
  },
  cliente: { identidadeId: uuid(n + 60), tipo: "pessoal" as const, nomeExibicao: `Cliente ${n}`, nomeUsuario: `cliente${n}` },
  totalCentavos: 3990,
  encerradaEm: null,
  motivoEncerramento: null,
});

const painel = (dados: Partial<PainelDespacho> = {}): PainelDespacho => ({
  configuracao: { maxPedidosPorSaida: 5, tempoFormacaoMinutos: 15, combinarZonas: true },
  zonas: [],
  pedidosForaDeZona: [],
  automacaoAtiva: true,
  ...dados,
});

describe("configuração da automação", () => {
  const render = () =>
    renderToStaticMarkup(createElement(ConfiguracaoAutomacao, { configuracao: painel().configuracao, ocupado: false, aoSalvar: () => {} }));

  it("quantidade e tempo são campos da EMPRESA, com limites seguros", () => {
    const html = render();
    assert.ok(html.includes('name="maxPedidosPorSaida"'));
    assert.ok(html.includes('value="5"'));
    assert.ok(html.includes('name="tempoFormacaoMinutos"'));
    assert.ok(html.includes('value="15"'));
    assert.ok(html.includes('max="15"') && html.includes('min="1"'));
    assert.ok(texto(html).includes("quantidade OU o tempo"), "a regra fica explícita para o gestor");
  });

  it("não promete rota otimizada em lugar nenhum", () => {
    const conteudo = texto(render()).toLowerCase();
    for (const proibido of ["melhor rota", "rota mais rápida", "menor tempo", "km", "eta"]) {
      assert.equal(conteudo.includes(proibido), false, proibido);
    }
  });
});

describe("pendências fora das zonas", () => {
  it("mostra o pedido que a automação não pode tratar, para o gestor resolver", () => {
    const html = renderToStaticMarkup(
      createElement(PendenciasForaDeZona, {
        painel: painel({
          pedidosForaDeZona: [
            {
              id: uuid(9),
              status: "pronto",
              cliente: { identidadeId: uuid(8), tipo: "pessoal", nomeExibicao: "Bruna Cliente", nomeUsuario: "bruna" },
              conversaId: uuid(7),
              quantidadeItens: 2,
              totalCentavos: 7980,
              formaPagamentoNaEntrega: "dinheiro",
              trocoParaCentavos: null,
              criadoEm: "2026-09-16T12:00:00.000Z",
            },
          ],
        }),
      }),
    );
    assert.ok(texto(html).includes("Pedidos fora das zonas configuradas"));
    assert.ok(texto(html).includes("Bruna Cliente"));
    assert.ok(texto(html).includes("trate manualmente"));
    assert.ok(html.includes(`data-pedido-fora-de-zona="${uuid(9)}"`));
  });

  it("sem zona ativa, avisa que tudo continua manual", () => {
    const html = renderToStaticMarkup(createElement(PendenciasForaDeZona, { painel: painel({ automacaoAtiva: false }) }));
    assert.ok(texto(html).includes("Nenhuma zona ativa"));
  });

  it("com tudo classificado, não inventa pendência", () => {
    assert.ok(texto(renderToStaticMarkup(createElement(PendenciasForaDeZona, { painel: painel() }))).includes("Nenhum pedido fora das zonas"));
  });
});

describe("quadro das saídas", () => {
  const agora = new Date("2026-09-16T12:10:00.000Z");
  const render = (saidas: SaidaEntrega[]) => renderToStaticMarkup(createElement(QuadroDeSaidas, { saidas, agora }));

  it("agrupa por estado: em formação, aguardando entregador, atribuídas e em andamento", () => {
    const html = render([
      saida({ paradas: [parada(1), parada(2)] }),
      saida({ id: uuid(2), status: "aguardando_entregador", fechadaEm: "2026-09-16T12:09:00.000Z", prazoFormacaoEm: null, paradas: [parada(3)] }),
      saida({
        id: uuid(3),
        status: "preparada",
        entregador: { identidadeId: uuid(4), tipo: "pessoal", nomeExibicao: "Paulo Entregador", nomeUsuario: "paulo" },
        fechadaEm: "2026-09-16T12:05:00.000Z",
        atribuidaEm: "2026-09-16T12:06:00.000Z",
        prazoFormacaoEm: null,
        paradas: [parada(4)],
      }),
    ]);
    const conteudo = texto(html);
    assert.ok(conteudo.includes("Em formação"));
    assert.ok(conteudo.includes("Aguardando entregador"));
    assert.ok(conteudo.includes("Atribuídas"));
    assert.ok(conteudo.includes("Em andamento"));
    assert.ok(conteudo.includes("Centro · 2 pedidos"), conteudo);
    assert.ok(conteudo.includes("Paulo Entregador"));
    assert.ok(conteudo.includes("fecha em 5 min"), "o gestor vê quanto falta para fechar");
  });

  it("saída combinada mostra as duas zonas", () => {
    const html = render([saida({ zonasCombinadas: [{ id: uuid(5), nome: "Savassi" }], paradas: [parada(1)] })]);
    assert.ok(texto(html).includes("Centro + Savassi"));
  });

  it("saída montada à mão aparece sem zona, sem inventar nada", () => {
    const html = render([saida({ zonaPrincipal: null, automatica: false, status: "preparada", fechadaEm: "2026-09-16T12:05:00.000Z", prazoFormacaoEm: null, paradas: [parada(1)] })]);
    assert.ok(texto(html).includes("Montada manualmente"));
  });

  it("prazo vencido aparece como fechando (quem fecha é o servidor)", () => {
    assert.equal(formatarEspera({ prazoFormacaoEm: "2026-09-16T12:05:00.000Z" }, agora), "fechando…");
    assert.equal(formatarEspera({ prazoFormacaoEm: "2026-09-16T12:11:00.000Z" }, agora), "fecha em 1 min");
    assert.equal(formatarEspera({ prazoFormacaoEm: null }, agora), "");
  });
});
