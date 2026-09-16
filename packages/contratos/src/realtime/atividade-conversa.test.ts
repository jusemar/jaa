import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  INTERVALO_RENOVACAO_DIGITANDO_MS,
  PAUSA_PARA_PARAR_DIGITANDO_MS,
  VALIDADE_DIGITANDO_MS,
  eventoDigitandoAtualizadoSchema,
  informarDigitandoEntradaSchema,
  observarConversaEntradaSchema,
  respostaObservarConversaSchema,
} from "./atividade-conversa.ts";

const uuid = "01a0a394-6225-75f2-b809-b2690993c512";

describe("entradas de atividade da conversa", () => {
  it("observar exige conversaId e descarta identidade enviada pelo cliente", () => {
    assert.deepEqual(observarConversaEntradaSchema.parse({ conversaId: uuid, identidadeId: uuid, sala: "identidade:x" }), { conversaId: uuid });
    for (const entrada of [{}, { conversaId: "abc" }, null, "conversa"]) {
      assert.equal(observarConversaEntradaSchema.safeParse(entrada).success, false);
    }
  });

  it("digitando exige conversaId e booleano; identidade do cliente é descartada", () => {
    assert.deepEqual(informarDigitandoEntradaSchema.parse({ conversaId: uuid, digitando: true, identidadeId: uuid }), { conversaId: uuid, digitando: true });
    for (const entrada of [{ conversaId: uuid }, { conversaId: uuid, digitando: "sim" }, { digitando: true }]) {
      assert.equal(informarDigitandoEntradaSchema.safeParse(entrada).success, false);
    }
  });
});

describe("respostas e eventos", () => {
  it("resposta de observar é sucesso com presenças ou erro com código conhecido", () => {
    assert.equal(respostaObservarConversaSchema.safeParse({ ok: true, presencas: [{ identidadeId: uuid, online: false }] }).success, true);
    assert.equal(respostaObservarConversaSchema.safeParse({ ok: false, codigo: "CONVERSA_NAO_ENCONTRADA" }).success, true);
    assert.equal(respostaObservarConversaSchema.safeParse({ ok: false, codigo: "OUTRO" }).success, false);
  });

  it("evento digitando exige identidade, conversa e estado", () => {
    assert.equal(eventoDigitandoAtualizadoSchema.safeParse({ conversaId: uuid, identidadeId: uuid, digitando: false }).success, true);
    assert.equal(eventoDigitandoAtualizadoSchema.safeParse({ conversaId: uuid, digitando: true }).success, false);
  });

  it("tempos: renovação antes da pausa e validade no receptor maior que ambas", () => {
    assert.ok(INTERVALO_RENOVACAO_DIGITANDO_MS < PAUSA_PARA_PARAR_DIGITANDO_MS);
    assert.ok(VALIDADE_DIGITANDO_MS > PAUSA_PARA_PARAR_DIGITANDO_MS + INTERVALO_RENOVACAO_DIGITANDO_MS);
  });
});
