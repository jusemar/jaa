import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { RotaDaSaida, SaidaEntrega } from "@jaa/contratos";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ResumoPercurso, podeDesenharPercurso } from "./percurso-saida.tsx";

const texto = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/ /g, " ")
    .replace(/\s+/g, " ");
const uuid = (n: number) =>
  `${String(n).repeat(8)}-0000-4000-8000-000000000000`;

const rota = (dados: Partial<RotaDaSaida> = {}): RotaDaSaida => ({
  estado: "percurso_real",
  motivoFallback: null,
  provedor: "mapbox",
  origem: { latitude: -19.9191, longitude: -43.9386 },
  sequenciaDoProvedor: true,
  geometria: [
    { latitude: -19.9191, longitude: -43.9386 },
    { latitude: -19.93, longitude: -43.93 },
  ],
  distanciaMetros: 5300,
  duracaoSegundos: 840,
  calculadaEm: "2026-09-16T12:00:00.000Z",
  versaoSequencia: 2,
  ...dados,
});

const saida = (dados: Partial<SaidaEntrega> = {}): SaidaEntrega => ({
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
  status: "preparada",
  versaoSequencia: 2,
  paradas: [],
  rota: rota(),
  zonaPrincipal: null,
  zonasCombinadas: [],
  automatica: true,
  criadoEm: "2026-09-16T12:00:00.000Z",
  formacaoIniciadaEm: null,
  prazoFormacaoEm: null,
  fechadaEm: "2026-09-16T11:59:00.000Z",
  atribuidaEm: "2026-09-16T12:00:00.000Z",
  liberadaEm: null,
  iniciadaEm: null,
  concluidaEm: null,
  ...dados,
});

const render = (dados: Partial<SaidaEntrega> = {}) =>
  renderToStaticMarkup(createElement(ResumoPercurso, { saida: saida(dados) }));

describe("resumo do percurso", () => {
  it("com percurso real mostra distância e tempo de TRAJETO, nunca previsão de entrega", () => {
    const conteudo = texto(render());
    assert.ok(conteudo.includes("aprox. 14 min de trajeto"));
    assert.ok(conteudo.includes("5,3 km"));
    assert.ok(conteudo.includes("14 min"));
    assert.ok(conteudo.includes("não é previsão de entrega"));
    assert.equal(conteudo.toLowerCase().includes("chega às"), false);
  });

  it("nunca promete melhor rota", () => {
    const conteudo = texto(render()).toLowerCase();
    for (const proibido of [
      "melhor rota",
      "rota mais rápida",
      "rota perfeita",
      "menor caminho",
      "eta",
    ]) {
      assert.equal(conteudo.includes(proibido), false, proibido);
    }
  });

  it("em fallback não aparece número nenhum — só o motivo", () => {
    const html = render({
      rota: rota({
        estado: "aproximacao_local",
        motivoFallback: "provedor_indisponivel",
        provedor: null,
        geometria: null,
        distanciaMetros: null,
        duracaoSegundos: null,
        sequenciaDoProvedor: false,
      }),
    });
    const conteudo = texto(html);
    assert.ok(html.includes('data-percurso="aproximacao_local"'));
    assert.ok(conteudo.includes("sem cálculo de percurso"));
    assert.ok(conteudo.includes("O serviço de rotas não respondeu."));
    assert.equal(
      conteudo.includes("km"),
      false,
      "fallback não inventa distância",
    );
  });

  it("sequência alterada depois do cálculo avisa que o percurso será recalculado", () => {
    assert.ok(
      texto(render({ versaoSequencia: 3 })).includes("Sequência alterada"),
    );
  });

  it("saída sem rota calculada continua mostrando a sequência sugerida", () => {
    const html = render({ rota: null });
    assert.ok(html.includes('data-percurso="sem_rota"'));
    assert.ok(texto(html).includes("Sequência sugerida pelo Jaa"));
  });
});

describe("respeito aos termos do provedor", () => {
  it("o traçado só é desenhado sobre o mapa do MESMO provedor que calculou a rota", () => {
    assert.equal(
      podeDesenharPercurso("mapbox", "© Mapbox © OpenStreetMap"),
      true,
    );
    assert.equal(
      podeDesenharPercurso("mapbox", "© OpenStreetMap"),
      false,
      "não mistura traçado de um fornecedor com tiles de outro",
    );
    assert.equal(
      podeDesenharPercurso(null, "© Mapbox"),
      false,
      "sem provedor não há traçado real para desenhar",
    );
  });
});
