import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/*
 * Migração Leaflet → Mapbox por blocos: as telas já migradas usam a MESMA implementação aprovada
 * (`criarMapaPontoPreferido`, Mapbox com token e Leaflet só como fallback sem token), nunca uma
 * chamada direta ao Leaflet. O mapa só roda no navegador, então a garantia aqui é pela importação.
 */
const TELAS_MIGRADAS = [
  "../components/confirmar-ponto-entrega.tsx",
  "../../entregas/components/confirmar-ponto-base.tsx",
  "../../profissional/components/secao-base.tsx",
];

describe("telas de confirmação de ponto migradas para Mapbox", () => {
  for (const tela of TELAS_MIGRADAS) {
    it(`${tela.split("/").pop()} usa criarMapaPontoPreferido e não chama o Leaflet direto`, () => {
      const fonte = readFileSync(new URL(tela, import.meta.url), "utf8");
      assert.match(fonte, /criarMapaPontoPreferido\(/);
      assert.doesNotMatch(fonte, /criarMapaLeaflet/);
    });
  }
});
