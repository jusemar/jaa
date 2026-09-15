import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  criarIdentidadePessoalEntradaSchema,
  ehNomeUsuarioReservado,
  NOMES_USUARIO_RESERVADOS,
  nomeUsuarioSchema,
} from "./identidade-pessoal.ts";

describe("nomeUsuarioSchema", () => {
  it("normaliza @, espaços e maiúsculas para a forma canônica", () => {
    assert.equal(nomeUsuarioSchema.parse("  @Junior_Rocha "), "junior_rocha");
  });

  it("aceita os limites de tamanho", () => {
    assert.equal(nomeUsuarioSchema.parse("abc"), "abc");
    assert.equal(nomeUsuarioSchema.parse("a".repeat(30)), "a".repeat(30));
  });

  for (const invalido of ["ab", "a".repeat(31), "1junior", "_junior", "júnior", "junior.rocha", "junior rocha", ""]) {
    it(`rejeita "${invalido}"`, () => {
      assert.equal(nomeUsuarioSchema.safeParse(invalido).success, false);
    });
  }
});

describe("nomes reservados", () => {
  const reservados = [
    "jaa", "admin", "administrador", "suporte", "sistema", "system",
    "api", "oficial", "ajuda", "seguranca", "security",
  ];

  it("a lista central contém todos os nomes exigidos", () => {
    for (const nome of reservados) {
      assert.ok(NOMES_USUARIO_RESERVADOS.has(nome), nome);
    }
  });

  for (const nome of [...reservados, "@JAA", " Suporte ", "ADMIN", "@Security"]) {
    it(`recusa "${nome}"`, () => {
      const resultado = nomeUsuarioSchema.safeParse(nome);
      assert.equal(resultado.success, false);
      assert.equal(resultado.error?.issues[0]?.message, "Este @usuario não está disponível.");
      assert.equal(ehNomeUsuarioReservado(nome), true);
    });
  }

  it("não bloqueia nomes comuns que apenas contêm um reservado", () => {
    for (const nome of ["junior_admin", "jaanaina", "apiario"]) {
      assert.equal(nomeUsuarioSchema.safeParse(nome).success, true, nome);
    }
  });
});

describe("criarIdentidadePessoalEntradaSchema", () => {
  it("normaliza espaços do nome de exibição", () => {
    const resultado = criarIdentidadePessoalEntradaSchema.parse({
      nomeExibicao: "  Junior   Rocha ",
      nomeUsuario: "junior",
    });
    assert.deepEqual(resultado, { nomeExibicao: "Junior Rocha", nomeUsuario: "junior" });
  });

  it("rejeita nome vazio, longo demais ou com caracteres de controle", () => {
    for (const nomeExibicao of ["   ", "x".repeat(51), "Junior\u0007Rocha"]) {
      assert.equal(
        criarIdentidadePessoalEntradaSchema.safeParse({ nomeExibicao, nomeUsuario: "junior" }).success,
        false,
      );
    }
  });
});
