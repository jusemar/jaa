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
  inicio: { latitude: -19.9191, longitude: -43.9386 },
  comRetorno: false,
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
  exigeRetornoBase: false,
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
  it("rota que exige retorno diz que o trajeto inclui a volta à base", () => {
    assert.ok(texto(render({ rota: rota({ comRetorno: true }) })).includes("(com retorno à base)"));
    assert.equal(texto(render()).includes("retorno"), false);
  });

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
    assert.ok(texto(html).includes("Sequência sugerida pelo Jaaa"));
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

describe("Logística → Operação: mapa da saída em Mapbox, com o trajeto real", () => {
  it("a Operação usa o MESMO mapa Mapbox da área do entregador (o componente Leaflet saiu)", async () => {
    const { readFileSync, existsSync } = await import("node:fs");
    const operacao = readFileSync(new URL("./area-saidas-empresa.tsx", import.meta.url), "utf8");
    assert.ok(operacao.includes('import { MapaPercursoMapbox } from "./mapa-percurso-mapbox";') && operacao.includes("<MapaPercursoMapbox saida={saida} posicao="));
    assert.ok(!operacao.includes("./mapa-percurso\"") && !existsSync(new URL("./mapa-percurso.tsx", import.meta.url)));
  });

  it("o traçado é a geometria que a API guardou (LineString), só do Mapbox, real e da ordem atual; a base aparece mesmo sem traçado", async () => {
    const { readFileSync } = await import("node:fs");
    const mapa = readFileSync(new URL("./mapa-percurso-mapbox.tsx", import.meta.url), "utf8");
    assert.match(mapa, /rota\?\.provedor === "mapbox" &&\s*rotaTemPercursoReal\(rota\) &&\s*rotaCobreSequenciaAtual\(rota, saida\.versaoSequencia\)/);
    assert.ok(mapa.includes('type: "LineString", coordinates: coordenadas') && mapa.includes("rota.geometria.map("));
    assert.ok(mapa.includes("rota?.inicio ?? rota?.origem") && mapa.includes('elementoMarcador("B")'));
    // Nenhuma chamada de rota no navegador: o Directions fica no servidor.
    assert.ok(!/fetch\(|optimized-trips|api\.mapbox\.com/i.test(mapa));
  });
});
