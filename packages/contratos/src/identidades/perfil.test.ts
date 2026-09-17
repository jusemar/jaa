import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  atualizarPerfilEntradaSchema,
  atualizarPrivacidadeEntradaSchema,
  fraseStatusSchema,
  perfilPublicoSchema,
  podeVer,
  statusEscolhidoSchema,
} from "./perfil.ts";

describe("regra de visibilidade", () => {
  it("'todos' e 'ninguem' não dependem da agenda", () => {
    assert.equal(podeVer({ visibilidade: "todos", ehContato: false }), true);
    assert.equal(podeVer({ visibilidade: "ninguem", ehContato: true }), false);
  });

  it("'contatos' pergunta à agenda de quem é visto", () => {
    assert.equal(podeVer({ visibilidade: "contatos", ehContato: true }), true);
    assert.equal(podeVer({ visibilidade: "contatos", ehContato: false }), false);
  });

  it("a exceção vence a regra geral nos dois sentidos — é o caso que a pessoa configurou de propósito", () => {
    assert.equal(podeVer({ visibilidade: "ninguem", ehContato: false, excecao: "permitir" }), true);
    assert.equal(podeVer({ visibilidade: "todos", ehContato: true, excecao: "bloquear" }), false);
    // Sem exceção registrada, nada muda.
    assert.equal(podeVer({ visibilidade: "todos", ehContato: false, excecao: null }), true);
  });
});

describe("contrato do perfil", () => {
  it("texto opcional vazio vira null; espaços são normalizados", () => {
    assert.equal(fraseStatusSchema.parse("   "), null);
    assert.equal(fraseStatusSchema.parse("  Respondo   à noite "), "Respondo à noite");
    assert.equal(fraseStatusSchema.safeParse("x".repeat(141)).success, false);
  });

  it("edição exige ao menos um campo e não aceita campo desconhecido como edição", () => {
    assert.equal(atualizarPerfilEntradaSchema.safeParse({}).success, false);
    assert.equal(atualizarPerfilEntradaSchema.safeParse({ cidade: "Belo Horizonte" }).success, true);
    assert.equal(atualizarPrivacidadeEntradaSchema.safeParse({}).success, false);
    assert.equal(atualizarPrivacidadeEntradaSchema.safeParse({ visibilidadeFoto: "quase-todos" }).success, false);
  });

  it("o perfil público não tem espaço para telefone nem para as preferências de quem é visto", () => {
    const campos = Object.keys(perfilPublicoSchema.shape);
    for (const proibido of ["telefone", "phoneNumber", "email", "privacidade"]) assert.equal(campos.includes(proibido), false, proibido);
  });

  it("o status é um conjunto fechado: nada de estado inventado pelo cliente", () => {
    assert.deepEqual(statusEscolhidoSchema.options, ["disponivel", "ocupado", "ausente", "invisivel"]);
    assert.equal(statusEscolhidoSchema.safeParse("em_reuniao").success, false);
  });
});
