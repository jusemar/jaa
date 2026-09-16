import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { eventoMensagensEntreguesSchema, eventoMensagensLidasSchema } from "../realtime/eventos.ts";
import {
  LIMITE_CONFIRMACAO_RECEBIMENTO,
  confirmarLeituraEntradaSchema,
  confirmarRecebimentoEntradaSchema,
  estadoMaisAvancado,
  estadoMensagemSchema,
  type EstadoMensagem,
} from "./estado-mensagem.ts";
import { mensagemSchema } from "./mensagem.ts";

const uuid = "01a0a394-6225-75f2-b809-b2690993c512";

describe("estadoMaisAvancado", () => {
  const estados: EstadoMensagem[] = ["enviada", "entregue", "lida"];

  it("nunca regride, em qualquer ordem de chegada", () => {
    for (const [i, a] of estados.entries()) {
      for (const [j, b] of estados.entries()) {
        const esperado = estados[Math.max(i, j)];
        assert.equal(estadoMaisAvancado(a, b), esperado, `${a} + ${b}`);
        assert.equal(estadoMaisAvancado(b, a), esperado, `${b} + ${a}`);
      }
    }
  });

  it("aceita somente os três estados", () => {
    assert.deepEqual(estadoMensagemSchema.options, estados);
    assert.equal(estadoMensagemSchema.safeParse("recebida").success, false);
  });
});

describe("mensagemSchema", () => {
  it("exige estado", () => {
    const mensagem = { id: uuid, conversaId: uuid, remetenteIdentidadeId: uuid, tipo: "texto", conteudo: "oi", criadoEm: "2026-09-15T12:00:00.000Z" };
    assert.equal(mensagemSchema.safeParse(mensagem).success, false);
    assert.equal(mensagemSchema.safeParse({ ...mensagem, estado: "entregue", mensagemRespondida: null, editadaEm: null, excluidaEm: null, pedido: null }).success, true);
  });
});

describe("confirmarRecebimentoEntradaSchema", () => {
  it("aceita de 1 ao limite de ids válidos", () => {
    assert.equal(confirmarRecebimentoEntradaSchema.safeParse({ mensagemIds: [uuid] }).success, true);
    const noLimite = Array.from({ length: LIMITE_CONFIRMACAO_RECEBIMENTO }, () => uuid);
    assert.equal(confirmarRecebimentoEntradaSchema.safeParse({ mensagemIds: noLimite }).success, true);
  });

  it("recusa lista vazia, acima do limite ou id inválido", () => {
    for (const mensagemIds of [[], Array.from({ length: LIMITE_CONFIRMACAO_RECEBIMENTO + 1 }, () => uuid), ["abc"], "abc"]) {
      assert.equal(confirmarRecebimentoEntradaSchema.safeParse({ mensagemIds }).success, false);
    }
  });

  it("não aceita escolher quem confirma: identidade enviada é descartada", () => {
    const resultado = confirmarRecebimentoEntradaSchema.parse({ mensagemIds: [uuid], identidadeId: uuid, destinatarioIdentidadeId: uuid });
    assert.deepEqual(Object.keys(resultado), ["mensagemIds"]);
  });
});

describe("confirmarLeituraEntradaSchema", () => {
  it("exige ateMensagemId válido e descarta leitor enviado pelo cliente", () => {
    assert.deepEqual(confirmarLeituraEntradaSchema.parse({ ateMensagemId: uuid, leitorIdentidadeId: uuid }), { ateMensagemId: uuid });
    for (const entrada of [{}, { ateMensagemId: "abc" }]) {
      assert.equal(confirmarLeituraEntradaSchema.safeParse(entrada).success, false);
    }
  });
});

describe("eventos de estado", () => {
  it("entregues exige ao menos uma mensagem; lidas exige marcador", () => {
    assert.equal(eventoMensagensEntreguesSchema.safeParse({ conversaId: uuid, destinatarioIdentidadeId: uuid, mensagemIds: [] }).success, false);
    assert.equal(eventoMensagensEntreguesSchema.safeParse({ conversaId: uuid, destinatarioIdentidadeId: uuid, mensagemIds: [uuid] }).success, true);
    assert.equal(eventoMensagensLidasSchema.safeParse({ conversaId: uuid, leitorIdentidadeId: uuid }).success, false);
    assert.equal(eventoMensagensLidasSchema.safeParse({ conversaId: uuid, leitorIdentidadeId: uuid, ateMensagemId: uuid }).success, true);
  });
});
