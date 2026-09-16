import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatarHorarioMensagem, mesmoDia } from "./horarios.ts";

const FUSO = "America/Sao_Paulo";

describe("formatarHorarioMensagem", () => {
  it("mensagem do mesmo dia mostra só a hora do SEU criadoEm", () => {
    const agora = new Date("2026-09-15T23:00:00.000Z"); // 20:00 em São Paulo
    assert.equal(formatarHorarioMensagem("2026-09-15T21:42:00.000Z", { agora, fusoHorario: FUSO }), "18:42");
    assert.equal(formatarHorarioMensagem("2026-09-15T21:43:59.000Z", { agora, fusoHorario: FUSO }), "18:43");
  });

  it("mensagem de outro dia inclui a data (o dia é o do fuso de quem vê)", () => {
    const agora = new Date("2026-09-16T12:00:00.000Z");
    assert.equal(formatarHorarioMensagem("2026-09-15T21:42:00.000Z", { agora, fusoHorario: FUSO }), "15/09/26 18:42");
    // 02:30 UTC do dia 16 ainda é dia 15 em São Paulo.
    assert.equal(mesmoDia(new Date("2026-09-16T02:30:00.000Z"), new Date("2026-09-15T15:00:00.000Z"), FUSO), true);
  });
});
