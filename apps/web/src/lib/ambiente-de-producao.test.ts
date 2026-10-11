import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { exigirAmbienteDeProducao, problemasDoAmbienteDeProducao } from "./ambiente-de-producao";

const completo = { NEXT_PUBLIC_API_URL: "https://api.exemplo.com.br", NEXT_PUBLIC_MAPBOX_TOKEN: "pk.exemplo" };

describe("ambiente do build de produção da Web", () => {
  it("aceita a configuração completa", () => {
    assert.deepEqual(problemasDoAmbienteDeProducao(completo), []);
  });

  it("aponta o token do Mapbox ausente, vazio ou secreto", () => {
    for (const token of [undefined, "", "  ", "sk.segredo"]) {
      const problemas = problemasDoAmbienteDeProducao({ ...completo, NEXT_PUBLIC_MAPBOX_TOKEN: token });
      assert.equal(problemas.length, 1);
      assert.match(problemas[0] ?? "", /^NEXT_PUBLIC_MAPBOX_TOKEN/);
    }
  });

  it("aponta a API ausente, local ou sem HTTPS", () => {
    for (const api of [undefined, "", "http://localhost:3333", "https://localhost:3333", "http://api.exemplo.com.br", "nao-e-url"]) {
      const problemas = problemasDoAmbienteDeProducao({ ...completo, NEXT_PUBLIC_API_URL: api });
      assert.equal(problemas.length, 1);
      assert.match(problemas[0] ?? "", /^NEXT_PUBLIC_API_URL/);
    }
  });

  it("nunca escreve o valor das variáveis na mensagem", () => {
    const problemas = problemasDoAmbienteDeProducao({ NEXT_PUBLIC_API_URL: "http://interno.exemplo", NEXT_PUBLIC_MAPBOX_TOKEN: "sk.segredo-real" });
    assert.equal(problemas.join(" ").includes("sk.segredo-real"), false);
    assert.equal(problemas.join(" ").includes("interno.exemplo"), false);
  });

  it("só recusa o build de produção da hospedagem", () => {
    assert.doesNotThrow(() => exigirAmbienteDeProducao({}));
    assert.doesNotThrow(() => exigirAmbienteDeProducao({ VERCEL_ENV: "preview" }));
    assert.doesNotThrow(() => exigirAmbienteDeProducao({ VERCEL_ENV: "production", ...completo }));
    assert.throws(() => exigirAmbienteDeProducao({ VERCEL_ENV: "production", NEXT_PUBLIC_API_URL: completo.NEXT_PUBLIC_API_URL }), /NEXT_PUBLIC_MAPBOX_TOKEN/);
  });
});
