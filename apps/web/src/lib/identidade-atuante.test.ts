import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CABECALHO_IDENTIDADE_ATUANTE } from "@jaa/contratos";
import { aoMudarIdentidadeAtuante, cabecalhosIdentidadeAtuante, definirIdentidadeAtuante, obterIdentidadeAtuante } from "./identidade-atuante.ts";

describe("identidade atuante (intenção do cliente)", () => {
  it("pessoal por padrão: sem cabeçalho; empresa escolhida: cabeçalho com a identidade; volta a pessoal remove", () => {
    assert.equal(obterIdentidadeAtuante(), null);
    assert.deepEqual(cabecalhosIdentidadeAtuante(), {});
    definirIdentidadeAtuante("bbbbbbbb-0000-4000-8000-000000000000");
    assert.deepEqual(cabecalhosIdentidadeAtuante(), { [CABECALHO_IDENTIDADE_ATUANTE]: "bbbbbbbb-0000-4000-8000-000000000000" });
    definirIdentidadeAtuante(null);
    assert.deepEqual(cabecalhosIdentidadeAtuante(), {});
  });

  it("avisa ouvintes só quando a identidade realmente muda (ex.: reconectar realtime)", () => {
    const mudancas: Array<string | null> = [];
    const cancelar = aoMudarIdentidadeAtuante((id) => mudancas.push(id));
    definirIdentidadeAtuante("cccccccc-0000-4000-8000-000000000000");
    definirIdentidadeAtuante("cccccccc-0000-4000-8000-000000000000");
    definirIdentidadeAtuante(null);
    cancelar();
    definirIdentidadeAtuante("dddddddd-0000-4000-8000-000000000000");
    assert.deepEqual(mudancas, ["cccccccc-0000-4000-8000-000000000000", null]);
    definirIdentidadeAtuante(null);
  });
});
