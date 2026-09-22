import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ZonaEntrega } from "@jaa/contratos";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
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
  compativeisCom: [],
  criadoEm: "2026-09-20T12:00:00.000Z",
  atualizadoEm: "2026-09-20T12:00:00.000Z",
};

const render = (abrirMapaInicial: boolean) =>
  renderToStaticMarkup(
    createElement(EditorDeZona, {
      zona,
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
