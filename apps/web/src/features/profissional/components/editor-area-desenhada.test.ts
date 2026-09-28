import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EditorAreaDesenhada, problemaDoDesenho } from "./editor-area-desenhada.tsx";

const QUADRADO = [
  { latitude: -19.92, longitude: -43.95 },
  { latitude: -19.92, longitude: -43.93 },
  { latitude: -19.9, longitude: -43.93 },
  { latitude: -19.9, longitude: -43.95 },
];

describe("Desenhar no mapa (Perfil Profissional)", () => {
  it("só conclui com 3+ pontos e linhas que não se cruzam", () => {
    assert.equal(problemaDoDesenho([]), "Marque ao menos 3 pontos.");
    assert.equal(problemaDoDesenho(QUADRADO.slice(0, 2)), "Marque ao menos 3 pontos.");
    assert.equal(problemaDoDesenho([QUADRADO[0], QUADRADO[2], QUADRADO[1], QUADRADO[3]].filter((v) => v !== undefined)), "As linhas da área não podem se cruzar.");
    assert.equal(problemaDoDesenho(QUADRADO), null);
  });

  it("reabrir uma área salva parte do desenho salvo (os mesmos vértices)", () => {
    const html = renderToStaticMarkup(
      createElement(EditorAreaDesenhada, { titulo: "Editar área desenhada", centro: QUADRADO[0] ?? { latitude: 0, longitude: 0 }, verticesIniciais: QUADRADO, aoConcluir: () => {}, aoCancelar: () => {} }),
    );
    assert.ok(html.includes("data-mapa-area-desenhada"));
    assert.ok(html.includes("4 pontos"));
    assert.ok(html.includes('aria-label="Editar área desenhada"'));
  });

  it("usa o editor de área compartilhado (Mapbox), sem outro editor nem Leaflet direto", () => {
    const editor = readFileSync(new URL("./editor-area-desenhada.tsx", import.meta.url), "utf8");
    assert.match(editor, /criarMapaZonaPreferido\(/);
    assert.doesNotMatch(editor, /criarMapaZonaLeaflet|from "leaflet"|import\("leaflet"\)|mapbox-gl/);
    const areas = readFileSync(new URL("./secao-areas.tsx", import.meta.url), "utf8");
    assert.doesNotMatch(areas, /em breve/i);
    assert.match(areas, /EditorAreaDesenhada/);
  });
});
