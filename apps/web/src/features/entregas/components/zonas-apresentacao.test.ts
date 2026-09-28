import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ZonaEntrega } from "@jaa/contratos";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { interpretarFreteDigitado, rotuloFreteZona } from "../lib/frete.ts";
import { EditorDeZona } from "./area-zonas-empresa.tsx";

const zona: ZonaEntrega = {
  id: "11111111-1111-4111-8111-111111111111",
  nome: "Centro",
  ativa: true,
  vertices: [
    { latitude: -19.91, longitude: -43.95 },
    { latitude: -19.92, longitude: -43.94 },
    { latitude: -19.93, longitude: -43.96 },
  ],
  freteCentavos: 0,
  compativeisCom: [],
  criadoEm: "2026-09-20T12:00:00.000Z",
  atualizadoEm: "2026-09-20T12:00:00.000Z",
};

const render = (abrirMapaInicial: boolean, dados: ZonaEntrega | null = zona) =>
  renderToStaticMarkup(
    createElement(EditorDeZona, {
      zona: dados,
      abrirMapaInicial,
      centroDaEmpresa: null,
      outras: [],
      ocupado: false,
      aoSalvar: () => {},
      aoCancelar: () => {},
    }),
  );

describe("editor de área da zona", () => {
  it("na tela normal mostra o resumo e a ação, sem manter mapa montado", () => {
    const html = render(false);
    assert.ok(html.includes("Editar área no mapa"));
    assert.ok(html.includes("3 pontos marcados"));
    assert.equal(html.includes("data-mapa-zona"), false);
    assert.equal(html.includes("data-editor-mapa-zona"), false);
  });

  it("aberto ocupa o viewport e mantém os quatro controles da sessão", () => {
    const html = render(true);
    assert.ok(html.includes("data-editor-mapa-zona"));
    assert.ok(html.includes("h-dvh") && html.includes("w-screen"));
    assert.ok(html.includes("data-mapa-zona"));
    assert.ok(html.includes("Cancelar"));
    assert.ok(html.includes("Desfazer"));
    assert.ok(html.includes("Limpar área"));
    assert.ok(html.includes("Concluir"));
  });
});

describe("taxa de entrega da zona", () => {
  const valorDoCampo = (html: string) => html.match(/name="freteZona"[^>]*value="([^"]*)"|value="([^"]*)"[^>]*name="freteZona"/)?.slice(1).find(Boolean);

  it("editando, o campo mostra o valor já salvo em reais; R$ 0,00 aparece como frete grátis", () => {
    assert.equal(valorDoCampo(render(false, { ...zona, freteCentavos: 500 })), "5,00");
    const gratis = render(false);
    assert.equal(valorDoCampo(gratis), "0,00");
    assert.ok(gratis.includes("data-frete-gratis"));
    assert.ok(gratis.includes("Taxa de entrega"));
    // Zona nova começa em 0,00 (grátis) e o mapa não é tocado pelo campo.
    assert.equal(valorDoCampo(render(false, null)), "0,00");
    assert.equal(render(false, { ...zona, freteCentavos: 700 }).includes("data-mapa-zona"), false);
  });

  it("reais digitados viram centavos inteiros; zero é grátis e inválido não é aceito", () => {
    for (const [digitado, centavos] of [["0", 0], ["0,00", 0], ["R$ 0,00", 0], ["5", 500], ["5,00", 500], ["7,5", 750], ["1.234,56", 123456]] as const) {
      assert.equal(interpretarFreteDigitado(digitado), centavos, digitado);
    }
    for (const invalido of ["", "  ", "-5", "abc", "5,999", "5,00,00"]) {
      assert.equal(interpretarFreteDigitado(invalido), null, invalido);
    }
  });

  it("rótulo discreto da listagem", () => {
    assert.equal(rotuloFreteZona(0), "Frete grátis");
    assert.equal(rotuloFreteZona(500), "Frete R$ 5,00");
  });
});
