/// <reference types="node" />
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { formatarHorarioMensagem, mesmoDia, rotuloDoDia } from "./horarios.ts";

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

describe("separador de dia da conversa", () => {
  const agora = new Date("2026-09-17T15:00:00.000Z");
  const fusoHorario = "UTC";

  it("hoje e ontem são ditos por extenso; antes disso, a data", () => {
    assert.equal(rotuloDoDia("2026-09-17T09:00:00.000Z", { agora, fusoHorario }), "Hoje");
    assert.equal(rotuloDoDia("2026-09-16T23:59:00.000Z", { agora, fusoHorario }), "Ontem");
    assert.equal(rotuloDoDia("2026-09-10T12:00:00.000Z", { agora, fusoHorario }), "10 de setembro de 2026");
  });

  it("a virada do dia não depende da hora, e sim do dia no fuso de quem lê", () => {
    // 23:30 de ontem e 00:10 de hoje são dias diferentes, mesmo com 40 minutos entre eles.
    assert.equal(rotuloDoDia("2026-09-16T23:30:00.000Z", { agora, fusoHorario }), "Ontem");
    assert.equal(rotuloDoDia("2026-09-17T00:10:00.000Z", { agora, fusoHorario }), "Hoje");
  });
});

describe("instante absoluto da API → horário LOCAL de quem vê (sem deslocamento manual)", () => {
  const agora = new Date("2026-10-04T18:00:00.000Z");

  it("UTC (Z) e o mesmo instante com fuso explícito dão o MESMO horário", () => {
    for (const fusoHorario of ["America/Sao_Paulo", "UTC", "Asia/Tokyo"]) {
      const emUtc = formatarHorarioMensagem("2026-10-04T16:17:00.000Z", { agora, fusoHorario });
      assert.equal(formatarHorarioMensagem("2026-10-04T13:17:00.000-03:00", { agora, fusoHorario }), emUtc);
      assert.equal(formatarHorarioMensagem("2026-10-04T18:17:00.000+02:00", { agora, fusoHorario }), emUtc);
    }
  });

  it("o mesmo instante aparece conforme o fuso DO APARELHO: 13:17 em São Paulo, 16:17 em GMT", () => {
    const criadoEm = "2026-10-04T16:17:00.000Z";
    assert.equal(formatarHorarioMensagem(criadoEm, { agora, fusoHorario: "America/Sao_Paulo" }), "13:17");
    // Aparelho configurado em GMT (era o caso do emulador) mostra 16:17 — correto PARA aquele fuso.
    assert.equal(formatarHorarioMensagem(criadoEm, { agora, fusoHorario: "GMT" }), "16:17");
    assert.equal(formatarHorarioMensagem(criadoEm, { agora, fusoHorario: "America/Manaus" }), "12:17");
  });

  it("sem fuso informado usa o do aparelho — o código não fixa fuso nem soma horas", () => {
    const criadoEm = "2026-10-04T16:17:00.000Z";
    const doAparelho = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(criadoEm));
    assert.equal(formatarHorarioMensagem(criadoEm, { agora }), doAparelho);
    const fonte = readFileSync(new URL("./horarios.ts", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    assert.ok(!/America\/|Sao_Paulo|[-+]0?3:00|3 \* 60|getTimezoneOffset|10800/.test(fonte));
  });

  it("separador de dia segue o mesmo fuso do balão", () => {
    // 01:30 UTC do dia 5 ainda é dia 4 em São Paulo.
    assert.equal(rotuloDoDia("2026-10-05T01:30:00.000Z", { agora: new Date("2026-10-05T02:00:00.000Z"), fusoHorario: "America/Sao_Paulo" }), "Hoje");
    assert.equal(rotuloDoDia("2026-10-04T23:30:00.000Z", { agora: new Date("2026-10-05T04:00:00.000Z"), fusoHorario: "America/Sao_Paulo" }), "Ontem");
  });

  it("a lista de conversas não congela o fuso: cria o formatador a cada uso, como o balão", () => {
    const lista = readFileSync(new URL("../components/lista-conversas.tsx", import.meta.url), "utf8");
    assert.ok(!/^const formato\w+ = new Intl\.DateTimeFormat/m.test(lista), "nenhum Intl.DateTimeFormat criado no carregamento do módulo");
    assert.ok(lista.includes("formatoHora().format(data)"));
  });
});
