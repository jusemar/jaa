import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { PoligonoZona } from "@jaa/contratos";
import { criarEditorVerticesZona } from "./editor-vertices-zona.ts";
import { centroDoRotulo, geojsonDasReferencias, geojsonDoContorno } from "./mapa-zona-mapbox.ts";

const A = { latitude: -19.9, longitude: -43.9 };
const B = { latitude: -19.9, longitude: -43.8 };
const C = { latitude: -19.8, longitude: -43.8 };
const D = { latitude: -19.8, longitude: -43.9 };

function montar(iniciais: PoligonoZona = []) {
  const publicados: PoligonoZona[] = [];
  const podeDesfazer: boolean[] = [];
  const redesenhos: PoligonoZona[] = [];
  const provisorios: PoligonoZona[] = [];
  let bloqueios = 0;
  const editor = criarEditorVerticesZona({
    verticesIniciais: iniciais,
    aoRedesenhar: (v) => redesenhos.push(v),
    aoMoverProvisorio: (v) => provisorios.push(v),
    aoMudarVertices: (v) => publicados.push(v),
    aoMudarPodeDesfazer: (p) => podeDesfazer.push(p),
    aoBloquearExclusao: () => bloqueios++,
  });
  return { editor, publicados, podeDesfazer, redesenhos, provisorios, bloqueios: () => bloqueios };
}

describe("editor de vértices da área (sem biblioteca de mapa)", () => {
  it("publica o estado inicial sem histórico", () => {
    const { editor, publicados, podeDesfazer } = montar([A, B, C]);
    editor.publicar();
    assert.deepEqual(publicados.at(-1), [A, B, C]);
    assert.equal(podeDesfazer.at(-1), false);
  });

  it("tocar adiciona vértice arredondado no mesmo formato { latitude, longitude }", () => {
    const { editor, publicados, podeDesfazer } = montar();
    editor.adicionar({ latitude: -19.123456789, longitude: -43.987654321 });
    assert.deepEqual(publicados.at(-1), [{ latitude: -19.123457, longitude: -43.987654 }]);
    assert.deepEqual(Object.keys(publicados.at(-1)?.[0] ?? {}).sort(), ["latitude", "longitude"]);
    assert.equal(podeDesfazer.at(-1), true);
  });

  it("desfazer volta um passo por vez e avisa quando não há mais o que desfazer", () => {
    const { editor, publicados, podeDesfazer } = montar();
    editor.adicionar(A);
    editor.adicionar(B);
    editor.desfazer();
    assert.deepEqual(publicados.at(-1), [A]);
    editor.desfazer();
    assert.deepEqual(publicados.at(-1), []);
    assert.equal(podeDesfazer.at(-1), false);
  });

  it("arrastar redesenha só o contorno durante o gesto e grava um passo de histórico no fim", () => {
    const { editor, publicados, provisorios } = montar([A, B, C]);
    editor.iniciarArraste();
    editor.moverDuranteArraste(1, { latitude: -19.95, longitude: -43.75 });
    assert.equal(publicados.length, 0);
    assert.deepEqual(provisorios.at(-1)?.[1], { latitude: -19.95, longitude: -43.75 });
    editor.concluirArraste(1, { latitude: -19.95, longitude: -43.75 });
    assert.deepEqual(publicados.at(-1), [A, { latitude: -19.95, longitude: -43.75 }, C]);
    editor.desfazer();
    assert.deepEqual(publicados.at(-1), [A, B, C]);
  });

  it("arraste que termina no mesmo lugar não vira histórico", () => {
    const { editor, podeDesfazer } = montar([A, B, C]);
    editor.iniciarArraste();
    editor.concluirArraste(0, A);
    assert.equal(podeDesfazer.at(-1), false);
  });

  it("excluir nunca deixa a área com menos de 3 pontos", () => {
    const tres = montar([A, B, C]);
    tres.editor.excluir(0);
    assert.equal(tres.bloqueios(), 1);
    assert.equal(tres.publicados.length, 0);

    const quatro = montar([A, B, C, D]);
    quatro.editor.excluir(1);
    assert.deepEqual(quatro.publicados.at(-1), [A, C, D]);
  });

  it("substituir zera o histórico; limpar é desfazível", () => {
    const { editor, publicados, podeDesfazer } = montar([A]);
    editor.substituir([A, B, C]);
    assert.equal(podeDesfazer.at(-1), false);
    editor.limpar();
    assert.deepEqual(publicados.at(-1), []);
    editor.desfazer();
    assert.deepEqual(publicados.at(-1), [A, B, C]);
  });
});

describe("GeoJSON do desenho no Mapbox", () => {
  it("3+ pontos viram polígono fechado sem mudar a lista de vértices", () => {
    const vertices = [A, B, C];
    const colecao = geojsonDoContorno(vertices);
    assert.deepEqual(colecao.features[0]?.geometry, {
      type: "Polygon",
      coordinates: [[[-43.9, -19.9], [-43.8, -19.9], [-43.8, -19.8], [-43.9, -19.9]]],
    });
    assert.deepEqual(vertices, [A, B, C]);
  });

  it("2 pontos viram linha; menos, nada", () => {
    assert.equal(geojsonDoContorno([A, B]).features[0]?.geometry.type, "LineString");
    assert.equal(geojsonDoContorno([A]).features.length, 0);
  });

  it("áreas de referência incompletas são ignoradas e o rótulo fica no meio", () => {
    assert.equal(geojsonDasReferencias([{ vertices: [A, B] }, { vertices: [A, B, C, D] }]).features.length, 1);
    const centro = centroDoRotulo([A, B, C, D]);
    assert.ok(centro && Math.abs(centro.latitude - -19.85) < 1e-9 && Math.abs(centro.longitude - -43.85) < 1e-9);
  });
});

describe("editor de zonas migrado para Mapbox", () => {
  it("a tela de zonas usa criarMapaZonaPreferido e não chama o Leaflet direto", () => {
    const fonte = readFileSync(new URL("../components/area-zonas-empresa.tsx", import.meta.url), "utf8");
    assert.match(fonte, /criarMapaZonaPreferido\(/);
    assert.doesNotMatch(fonte, /criarMapaZonaLeaflet/);
  });
});
