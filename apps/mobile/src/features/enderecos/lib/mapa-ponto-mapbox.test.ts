import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ESTILO_DO_MAPA_DE_PONTO, ZOOM_DO_MAPA_DE_PONTO, ZOOM_MAXIMO_DO_MAPA_DE_PONTO, ZOOM_MINIMO_DO_MAPA_DE_PONTO, orientacaoDoMapaDePonto, pontoDoEvento, posicaoNoMapa, proximoZoom } from "./mapa-ponto-mapbox";

describe("mapa de ponto com Mapbox (app)", () => {
  it("usa a mesma cartografia e o mesmo zoom do mapa de ponto da Web", () => {
    assert.equal(ESTILO_DO_MAPA_DE_PONTO, "mapbox://styles/mapbox/streets-v12");
    assert.equal(ZOOM_DO_MAPA_DE_PONTO, 16);
  });

  it("entrega a posição ao mapa com a longitude antes da latitude", () => {
    assert.deepEqual(posicaoNoMapa({ latitude: -19.9191, longitude: -43.9386 }), [-43.9386, -19.9191]);
  });

  it("lê o ponto do toque ou do arraste, com a precisão que o servidor guarda", () => {
    assert.deepEqual(pontoDoEvento({ geometry: { coordinates: [-43.93861234567, -19.91912345678] } }), { latitude: -19.919123, longitude: -43.938612 });
  });

  it("evento sem coordenada válida não vira ponto", () => {
    for (const evento of [null, undefined, {}, { geometry: null }, { geometry: { coordinates: [] } }, { geometry: { coordinates: ["-43", "-19"] } }, { geometry: { coordinates: [Number.NaN, 1] } }, { geometry: { coordinates: [-43, 91] } }, { geometry: { coordinates: [181, -19] } }]) {
      assert.equal(pontoDoEvento(evento), null);
    }
  });

  it("aproximar e afastar respeitam os limites", () => {
    assert.equal(proximoZoom(16, 1), 17);
    assert.equal(proximoZoom(15.6, -1), 15);
    assert.equal(proximoZoom(ZOOM_MAXIMO_DO_MAPA_DE_PONTO, 1), ZOOM_MAXIMO_DO_MAPA_DE_PONTO);
    assert.equal(proximoZoom(ZOOM_MINIMO_DO_MAPA_DE_PONTO, -1), ZOOM_MINIMO_DO_MAPA_DE_PONTO);
  });

  it("orienta como a Web: sem palpite pede o toque; com marcador, conferir e ajustar", () => {
    assert.match(orientacaoDoMapaDePonto({ semSugestao: true }), /Toque no local exato/);
    assert.match(orientacaoDoMapaDePonto({ semSugestao: false }), /Arraste ou toque no mapa/);
  });
});
