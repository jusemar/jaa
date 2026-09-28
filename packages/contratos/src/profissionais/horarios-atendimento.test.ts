import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  HORARIOS_ATENDIMENTO_PADRAO,
  atendeNoInstante,
  fusoHorarioSchema,
  horarioLocal,
  horariosAtendimentoEntradaSchema,
  periodoAtendimentoSchema,
} from "./horarios-atendimento.ts";

describe("grade semanal de atendimento", () => {
  it("padrão: segunda a sexta 08:00–18:00; sábado e domingo sem período", () => {
    assert.deepEqual(
      HORARIOS_ATENDIMENTO_PADRAO.map((periodo) => periodo.diaSemana),
      [1, 2, 3, 4, 5],
    );
    assert.ok(HORARIOS_ATENDIMENTO_PADRAO.every((periodo) => periodo.inicio === "08:00" && periodo.fim === "18:00"));
  });

  it("aceita vários períodos no mesmo dia e períodos que só se encostam", () => {
    const almoco = [
      { diaSemana: 1, inicio: "08:00", fim: "12:00" },
      { diaSemana: 1, inicio: "14:00", fim: "18:00" },
      { diaSemana: 1, inicio: "18:00", fim: "22:00" },
    ];
    assert.equal(horariosAtendimentoEntradaSchema.safeParse({ periodos: almoco }).success, true);
  });

  it("recusa períodos sobrepostos no mesmo dia (mas aceita o mesmo horário em dias diferentes)", () => {
    const sobrepostos = [
      { diaSemana: 1, inicio: "08:00", fim: "12:00" },
      { diaSemana: 1, inicio: "11:00", fim: "15:00" },
    ];
    assert.equal(horariosAtendimentoEntradaSchema.safeParse({ periodos: sobrepostos }).success, false);
    const diasDiferentes = [sobrepostos[0], { ...sobrepostos[1], diaSemana: 2 }];
    assert.equal(horariosAtendimentoEntradaSchema.safeParse({ periodos: diasDiferentes }).success, true);
    const duplicados = [sobrepostos[0], sobrepostos[0]];
    assert.equal(horariosAtendimentoEntradaSchema.safeParse({ periodos: duplicados }).success, false);
  });

  it("início precisa ser antes do fim; 24h é só 00:00–24:00; dia de 1 a 7", () => {
    assert.equal(periodoAtendimentoSchema.safeParse({ diaSemana: 1, inicio: "18:00", fim: "08:00" }).success, false);
    assert.equal(periodoAtendimentoSchema.safeParse({ diaSemana: 1, inicio: "10:00", fim: "10:00" }).success, false);
    assert.equal(periodoAtendimentoSchema.safeParse({ diaSemana: 1, inicio: "00:00", fim: "24:00" }).success, true);
    assert.equal(periodoAtendimentoSchema.safeParse({ diaSemana: 1, inicio: "24:00", fim: "24:00" }).success, false);
    assert.equal(periodoAtendimentoSchema.safeParse({ diaSemana: 0, inicio: "08:00", fim: "09:00" }).success, false);
    assert.equal(periodoAtendimentoSchema.safeParse({ diaSemana: 8, inicio: "08:00", fim: "09:00" }).success, false);
    assert.equal(periodoAtendimentoSchema.safeParse({ diaSemana: 1, inicio: "8:00", fim: "09:00" }).success, false);
  });

  it("lista vazia = não atende em dia nenhum", () => {
    assert.equal(horariosAtendimentoEntradaSchema.safeParse({ periodos: [] }).success, true);
  });
});

describe("horário LOCAL do profissional", () => {
  // Segunda-feira, 28/09/2026, 22:30 UTC = 19:30 em São Paulo e 18:30 em Manaus.
  const instante = new Date("2026-09-28T22:30:00.000Z");
  const entrega = [{ diaSemana: 1, inicio: "18:00", fim: "22:00" }];
  const eletricista = [{ diaSemana: 1, inicio: "08:00", fim: "18:00" }];

  it("converte o instante pelo fuso do perfil, não por UTC", () => {
    assert.deepEqual(horarioLocal(instante, "America/Sao_Paulo"), { diaSemana: 1, hora: "19:30" });
    assert.deepEqual(horarioLocal(instante, "America/Manaus"), { diaSemana: 1, hora: "18:30" });
    // Em UTC já seria 22:30 e a entrega (até 22:00) estaria fechada — o bug que o fuso evita.
    assert.equal(atendeNoInstante(entrega, instante, "UTC"), false);
    assert.equal(atendeNoInstante(entrega, instante, "America/Sao_Paulo"), true);
  });

  it("a virada do dia também é local", () => {
    // 02:00 UTC de terça = 23:00 de segunda em São Paulo.
    assert.deepEqual(horarioLocal(new Date("2026-09-29T02:00:00.000Z"), "America/Sao_Paulo"), { diaSemana: 1, hora: "23:00" });
  });

  it("serviços do mesmo profissional respondem diferente no mesmo instante", () => {
    assert.equal(atendeNoInstante(entrega, instante, "America/Sao_Paulo"), true);
    assert.equal(atendeNoInstante(eletricista, instante, "America/Sao_Paulo"), false);
  });

  it("fim é exclusivo: 18:00 já está fora de 08:00–18:00", () => {
    const seisDaTarde = new Date("2026-09-28T21:00:00.000Z");
    assert.equal(atendeNoInstante(eletricista, seisDaTarde, "America/Sao_Paulo"), false);
  });

  it("fuso precisa ser nome IANA válido", () => {
    assert.equal(fusoHorarioSchema.safeParse("America/Sao_Paulo").success, true);
    assert.equal(fusoHorarioSchema.safeParse("Brasil/Hora").success, false);
    assert.equal(fusoHorarioSchema.safeParse("GMT-3").success, false);
  });
});
