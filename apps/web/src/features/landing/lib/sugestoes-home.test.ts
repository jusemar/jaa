import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAXIMO_SUGESTOES_HOME, SUGESTOES_HOME_PADRAO, usuariosSugeridosNaHome } from "./sugestoes-home.ts";

describe("sugestões da Home (curadoria de perfis reais)", () => {
  it("sem configuração usa o padrão", () => {
    assert.deepEqual(usuariosSugeridosNaHome(undefined), [...SUGESTOES_HOME_PADRAO]);
    assert.deepEqual(usuariosSugeridosNaHome(""), [...SUGESTOES_HOME_PADRAO]);
  });

  it("normaliza (@, maiúsculas, espaços), tira repetidos e descarta o que não é @usuario", () => {
    assert.deepEqual(usuariosSugeridosNaHome(" @Junior , pizzaria_bh,junior, x, com espaço, 9nove "), ["junior", "pizzaria_bh"]);
  });

  it("só inválidos = padrão; nunca passa do máximo", () => {
    assert.deepEqual(usuariosSugeridosNaHome("x,,@"), [...SUGESTOES_HOME_PADRAO]);
    const muitos = Array.from({ length: 10 }, (_, i) => `perfil${i}`).join(",");
    assert.equal(usuariosSugeridosNaHome(muitos).length, MAXIMO_SUGESTOES_HOME);
  });
});

describe("intenções da Home (pelo dado público real)", () => {
  const pessoa = { nome: "junior", tipo: "pessoal" as const, temCardapio: false };
  const restaurante = { nome: "restaurante", tipo: "empresarial" as const, temCardapio: true };
  const loja = { nome: "loja", tipo: "empresarial" as const, temCardapio: false };

  it("pessoa = conversar; empresa com cardápio = pedir comida; sem cardápio = falar com empresa", async () => {
    const { intencaoDoPerfil } = await import("./sugestoes-home.ts");
    assert.equal(intencaoDoPerfil(pessoa), "conversar");
    assert.equal(intencaoDoPerfil(restaurante), "pedir-comida");
    assert.equal(intencaoDoPerfil(loja), "falar-com-empresa");
  });

  it("ordem fixa das intenções, ordem da curadoria dentro, grupos vazios somem", async () => {
    const { agruparPorIntencao } = await import("./sugestoes-home.ts");
    const segunda = { ...pessoa, nome: "isaque" };
    assert.deepEqual(
      agruparPorIntencao([restaurante, pessoa, segunda]).map((g) => [g.intencao, g.perfis.map((p) => p.nome)]),
      [
        ["conversar", ["junior", "isaque"]],
        ["pedir-comida", ["restaurante"]],
      ],
    );
    assert.deepEqual(agruparPorIntencao([]), []);
  });
});
