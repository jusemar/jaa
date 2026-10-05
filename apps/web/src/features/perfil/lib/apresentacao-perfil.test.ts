import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { blocosDoPerfil } from "./apresentacao-perfil.ts";

describe("perfil de outra identidade", () => {
  it("frase de status (recado curto) e sobre (descrição) aparecem quando existem", () => {
    assert.deepEqual(blocosDoPerfil({ tipo: "pessoal", fraseStatus: "Respondo à noite", sobre: "Eletricista em BH." }), [
      { id: "frase", titulo: "Recado", texto: "Respondo à noite" },
      { id: "sobre", titulo: "Sobre", texto: "Eletricista em BH." },
    ]);
  });

  it("empresa: o sobre é a apresentação do negócio", () => {
    assert.deepEqual(blocosDoPerfil({ tipo: "empresarial", fraseStatus: null, sobre: "Pizza de forno a lenha." }), [{ id: "sobre", titulo: "Sobre a empresa", texto: "Pizza de forno a lenha." }]);
  });

  it("campo escondido pela privacidade ou não preenchido (null, vazio, só espaços) não vira bloco", () => {
    assert.deepEqual(blocosDoPerfil({ tipo: "pessoal", fraseStatus: null, sobre: null }), []);
    assert.deepEqual(blocosDoPerfil({ tipo: "pessoal", fraseStatus: "", sobre: "   " }), []);
    assert.deepEqual(
      blocosDoPerfil({ tipo: "pessoal", fraseStatus: null, sobre: "Oi" }).map((bloco) => bloco.id),
      ["sobre"],
    );
  });
});
