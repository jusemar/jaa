import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { centroDoDesenho, segmentosDoDesenho } from "./desenho-area.ts";

describe("desenho da área de atuação na tela", () => {
  it("menos de dois cantos não tem trecho; dois cantos têm um só (ainda não fecha)", () => {
    assert.deepEqual(segmentosDoDesenho([]), []);
    assert.deepEqual(segmentosDoDesenho([{ x: 0, y: 0 }]), []);
    assert.equal(segmentosDoDesenho([{ x: 0, y: 0 }, { x: 10, y: 0 }]).length, 1);
  });

  it("a partir de três cantos o contorno FECHA no primeiro", () => {
    const segmentos = segmentosDoDesenho([{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 40 }]);
    assert.equal(segmentos.length, 3);
    assert.deepEqual(segmentos[0], { centroX: 15, centroY: 0, comprimento: 30, anguloGraus: 0 });
    assert.deepEqual(segmentos[1], { centroX: 30, centroY: 20, comprimento: 40, anguloGraus: 90 });
    // O último volta do terceiro canto ao primeiro (hipotenusa 50).
    assert.equal(segmentos[2]?.comprimento, 50);
    assert.deepEqual([segmentos[2]?.centroX, segmentos[2]?.centroY], [15, 20]);
  });

  it("o mapa reabre no meio do desenho salvo; sem desenho, não há centro", () => {
    assert.equal(centroDoDesenho([]), null);
    assert.deepEqual(centroDoDesenho([{ latitude: -20, longitude: -44 }, { latitude: -19, longitude: -43 }]), { latitude: -19.5, longitude: -43.5 });
  });
});
