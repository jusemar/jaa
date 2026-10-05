import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calcularFuncionamento,
  definirFuncionamentoEntradaSchema,
  horariosDoDiaEmTexto,
  periodoAtravessaMeiaNoite,
  periodosDeFuncionamentoSeSobrepoem,
  type PeriodoFuncionamento,
} from "./funcionamento.ts";
import { diaOperacionalDaEmpresa } from "../produtos/personalizacao.ts";
import type { DiaSemana } from "../profissionais/horarios-atendimento.ts";

const SP = "America/Sao_Paulo";
// Semana de 05/10/2026 (segunda) a 11/10/2026 (domingo). São Paulo = UTC−3.
const emSP = (dia: number, hora: string) => new Date(`2026-10-${String(dia).padStart(2, "0")}T${hora}:00-03:00`);
const SEG = 5, TER = 6, QUA = 7, SAB = 10, DOM = 11;
const p = (diaSemana: number, inicio: string, fim: string): PeriodoFuncionamento => ({ diaSemana: diaSemana as DiaSemana, inicio, fim });
const estado = (periodos: PeriodoFuncionamento[], instante: Date, fuso = SP, ativo = true) => calcularFuncionamento({ ativo, periodos }, instante, fuso).estado;

// Segunda em dois períodos, terça direto, quarta fechada, quinta a sábado à noite passando da meia-noite.
const SEMANA = [p(1, "08:00", "14:00"), p(1, "18:00", "23:00"), p(2, "08:00", "23:00"), p(4, "18:00", "02:00"), p(5, "18:00", "02:00"), p(6, "18:00", "02:00")];

describe("compatibilidade: empresa que não controla horário", () => {
  it("sem configuração (ativo falso) está sempre aberta, sem texto nenhum para exibir", () => {
    for (const instante of [emSP(SEG, "03:00"), emSP(QUA, "12:00"), emSP(DOM, "23:59")]) {
      assert.deepEqual(estado([], instante, SP, false), { controlado: false, abertoAgora: true, fechaAs: null, proximaAbertura: null, reabreHoje: false, resumo: null, aviso: null });
    }
  });

  it("desligar o controle ignora os períodos guardados", () => {
    assert.equal(estado(SEMANA, emSP(QUA, "12:00"), SP, false).abertoAgora, true);
  });

  it("controle ligado sem período nenhum = sempre fechada, sem próxima abertura", () => {
    const fechada = estado([], emSP(SEG, "12:00"));
    assert.equal(fechada.abertoAgora, false);
    assert.equal(fechada.proximaAbertura, null);
    assert.equal(fechada.resumo, "Fechado");
    assert.match(fechada.aviso ?? "", /fechada agora/);
  });
});

describe("aberta ou fechada agora", () => {
  it("segunda dentro do período: aberta, com a hora de fechar", () => {
    const aberta = estado(SEMANA, emSP(SEG, "10:30"));
    assert.equal(aberta.abertoAgora, true);
    assert.equal(aberta.fechaAs, "14:00");
    assert.equal(aberta.resumo, "Aberto agora · até 14:00");
    assert.equal(aberta.aviso, null);
  });

  it("limites: a abertura já conta (08:00) e o fechamento não (14:00)", () => {
    assert.equal(estado(SEMANA, emSP(SEG, "08:00")).abertoAgora, true);
    assert.equal(estado(SEMANA, emSP(SEG, "13:59")).abertoAgora, true);
    assert.equal(estado(SEMANA, emSP(SEG, "14:00")).abertoAgora, false);
  });

  it("segunda antes da abertura: fechada, abre hoje às 08:00 (não é 'novamente')", () => {
    const fechada = estado(SEMANA, emSP(SEG, "06:15"));
    assert.equal(fechada.abertoAgora, false);
    assert.deepEqual(fechada.proximaAbertura, { diaSemana: 1, hora: "08:00", diasAFrente: 0 });
    assert.equal(fechada.reabreHoje, false);
    assert.equal(fechada.resumo, "Fechado · abre hoje às 08:00");
    assert.equal(fechada.aviso, "Esta empresa está fechada agora. Abre hoje às 08:00.");
  });

  it("intervalo entre dois períodos: fechada, 'abre novamente hoje às 18:00'", () => {
    const intervalo = estado(SEMANA, emSP(SEG, "15:00"));
    assert.equal(intervalo.abertoAgora, false);
    assert.deepEqual(intervalo.proximaAbertura, { diaSemana: 1, hora: "18:00", diasAFrente: 0 });
    assert.equal(intervalo.reabreHoje, true);
    assert.equal(intervalo.aviso, "Esta empresa está fechada agora. Abre novamente hoje às 18:00.");
  });

  it("segundo período do mesmo dia: aberta até 23:00", () => {
    assert.equal(estado(SEMANA, emSP(SEG, "19:00")).resumo, "Aberto agora · até 23:00");
  });

  it("segunda depois do fechamento: abre amanhã às 08:00", () => {
    const fechada = estado(SEMANA, emSP(SEG, "23:30"));
    assert.deepEqual(fechada.proximaAbertura, { diaSemana: 2, hora: "08:00", diasAFrente: 1 });
    assert.equal(fechada.resumo, "Fechado · abre amanhã às 08:00");
    assert.equal(fechada.aviso, "Esta empresa está fechada agora. Abre amanhã às 08:00.");
  });

  it("dia fechado (quarta): pula para o próximo dia com período, dito pelo nome", () => {
    const quarta = estado(SEMANA, emSP(QUA, "12:00"));
    assert.equal(quarta.abertoAgora, false);
    assert.deepEqual(quarta.proximaAbertura, { diaSemana: 4, hora: "18:00", diasAFrente: 1 });
    const terca = estado(SEMANA, emSP(TER, "23:30"));
    assert.deepEqual(terca.proximaAbertura, { diaSemana: 4, hora: "18:00", diasAFrente: 2 });
    assert.equal(terca.resumo, "Fechado · abre quinta às 18:00");
  });

  it("domingo para segunda: a semana dá a volta", () => {
    const domingo = estado(SEMANA, emSP(DOM, "12:00"));
    assert.deepEqual(domingo.proximaAbertura, { diaSemana: 1, hora: "08:00", diasAFrente: 1 });
    assert.equal(domingo.resumo, "Fechado · abre amanhã às 08:00");
  });

  it("um único período na semana, já passado: a próxima abertura é daqui a sete dias", () => {
    const fechada = estado([p(1, "08:00", "12:00")], emSP(SEG, "13:00"));
    assert.deepEqual(fechada.proximaAbertura, { diaSemana: 1, hora: "08:00", diasAFrente: 7 });
    assert.equal(fechada.reabreHoje, false);
    assert.equal(fechada.resumo, "Fechado · abre segunda às 08:00");
  });
});

describe("período que atravessa a meia-noite", () => {
  it("fim menor ou igual ao início fecha no dia seguinte", () => {
    assert.equal(periodoAtravessaMeiaNoite(p(6, "18:00", "02:00")), true);
    assert.equal(periodoAtravessaMeiaNoite(p(6, "18:00", "24:00")), false);
    assert.equal(periodoAtravessaMeiaNoite(p(6, "08:00", "14:00")), false);
  });

  it("sábado 18:00–02:00: aberta sábado à noite e no domingo de madrugada, até 02:00", () => {
    assert.equal(estado(SEMANA, emSP(SAB, "23:30")).resumo, "Aberto agora · até 02:00");
    const madrugada = estado(SEMANA, emSP(DOM, "01:30"));
    assert.equal(madrugada.abertoAgora, true);
    assert.equal(madrugada.fechaAs, "02:00");
    assert.equal(estado(SEMANA, emSP(DOM, "02:00")).abertoAgora, false, "02:00 já fechou");
  });

  it("a madrugada só vale se o período de ONTEM passou da meia-noite", () => {
    // Segunda 01:00: domingo não tem período — fechada, e ainda não abriu hoje.
    const segunda = estado(SEMANA, emSP(SEG, "01:00"));
    assert.equal(segunda.abertoAgora, false);
    assert.equal(segunda.reabreHoje, false);
  });

  it("depois de fechar de madrugada, a abertura do mesmo dia é 'novamente'", () => {
    // Sexta 03:00: a noite de quinta acabou às 02:00; sexta abre às 18:00.
    const sexta = estado(SEMANA, emSP(9, "03:00"));
    assert.deepEqual(sexta.proximaAbertura, { diaSemana: 5, hora: "18:00", diasAFrente: 0 });
    assert.equal(sexta.reabreHoje, true);
  });

  it("fechar à meia-noite é 24:00, mostrado como 00:00; períodos emendados contam como um só", () => {
    assert.equal(estado([p(1, "18:00", "24:00")], emSP(SEG, "20:00")).resumo, "Aberto agora · até 00:00");
    assert.equal(estado([p(1, "18:00", "24:00"), p(2, "00:00", "03:00")], emSP(SEG, "20:00")).fechaAs, "03:00");
  });

  it("aberta todos os dias, o dia inteiro: 24 horas, sem hora de fechar", () => {
    const sempre = [1, 2, 3, 4, 5, 6, 7].map((dia) => p(dia, "00:00", "24:00"));
    const aberta = estado(sempre, emSP(QUA, "04:00"));
    assert.equal(aberta.abertoAgora, true);
    assert.equal(aberta.fechaAs, null);
    assert.equal(aberta.resumo, "Aberto agora · 24 horas");
    assert.equal(estado([p(3, "00:00", "24:00")], emSP(QUA, "04:00")).fechaAs, "00:00", "um dia inteiro sozinho fecha à meia-noite");
  });
});

describe("fuso da empresa e mudança de dia", () => {
  const instante = new Date("2026-10-06T02:30:00Z"); // 23:30 de segunda em São Paulo; 22:30 em Manaus; 02:30 de terça em UTC.

  it("o mesmo instante dá estados diferentes conforme o fuso da EMPRESA", () => {
    const noturno = [p(1, "18:00", "23:00")];
    assert.equal(estado(noturno, instante, SP).abertoAgora, false, "23:30 em São Paulo: já fechou");
    assert.equal(estado(noturno, instante, "America/Manaus").abertoAgora, true, "22:30 em Manaus: aberta");
    assert.equal(estado(noturno, instante, "UTC").abertoAgora, false, "terça 02:30 em UTC");
  });

  it("'hoje' é o dia local da empresa, o mesmo que escolhe a programação semanal dos produtos", () => {
    for (const fuso of [SP, "America/Manaus", "UTC"]) {
      assert.equal(calcularFuncionamento({ ativo: true, periodos: [] }, instante, fuso).hoje, diaOperacionalDaEmpresa(instante, fuso), fuso);
    }
    assert.equal(calcularFuncionamento({ ativo: true, periodos: [] }, instante, SP).hoje, 1);
    assert.equal(calcularFuncionamento({ ativo: true, periodos: [] }, instante, "UTC").hoje, 2);
  });

  it("virada do dia: 23:59 é segunda, 00:00 já é terça", () => {
    assert.deepEqual(estado(SEMANA, emSP(SEG, "23:59")).proximaAbertura, { diaSemana: 2, hora: "08:00", diasAFrente: 1 });
    assert.deepEqual(estado(SEMANA, emSP(TER, "00:00")).proximaAbertura, { diaSemana: 2, hora: "08:00", diasAFrente: 0 });
  });
});

describe("validação da semana", () => {
  const validar = (periodos: unknown[]) => definirFuncionamentoEntradaSchema.safeParse({ ativo: true, periodos });

  it("aceita vários períodos no dia, dia sem período e período que passa da meia-noite", () => {
    assert.equal(validar(SEMANA).success, true);
    assert.equal(validar([]).success, true);
  });

  it("00:00 como fechamento vira 24:00 (meia-noite)", () => {
    const resultado = validar([{ diaSemana: 1, inicio: "18:00", fim: "00:00" }]);
    assert.ok(resultado.success);
    assert.equal(resultado.data.periodos[0]?.fim, "24:00");
  });

  it("recusa formato inválido, dia fora de 1–7 e abertura igual ao fechamento", () => {
    assert.equal(validar([{ diaSemana: 1, inicio: "8:00", fim: "12:00" }]).success, false);
    assert.equal(validar([{ diaSemana: 1, inicio: "24:00", fim: "02:00" }]).success, false);
    assert.equal(validar([{ diaSemana: 8, inicio: "08:00", fim: "12:00" }]).success, false);
    assert.equal(validar([{ diaSemana: 1, inicio: "08:00", fim: "08:00" }]).success, false);
  });

  it("recusa sobreposição no mesmo dia; encostar é permitido", () => {
    assert.equal(periodosDeFuncionamentoSeSobrepoem([p(1, "08:00", "14:00"), p(1, "13:00", "18:00")]), true);
    assert.equal(periodosDeFuncionamentoSeSobrepoem([p(1, "08:00", "14:00"), p(1, "14:00", "18:00")]), false);
    assert.equal(validar([p(1, "08:00", "14:00"), p(1, "13:00", "18:00")]).success, false);
  });

  it("recusa sobreposição com o dia seguinte quando o período passa da meia-noite — inclusive domingo → segunda", () => {
    assert.equal(periodosDeFuncionamentoSeSobrepoem([p(5, "18:00", "02:00"), p(6, "01:00", "10:00")]), true);
    assert.equal(periodosDeFuncionamentoSeSobrepoem([p(5, "18:00", "02:00"), p(6, "02:00", "10:00")]), false);
    assert.equal(periodosDeFuncionamentoSeSobrepoem([p(7, "22:00", "03:00"), p(1, "02:00", "10:00")]), true);
    assert.equal(periodosDeFuncionamentoSeSobrepoem([p(7, "22:00", "03:00"), p(1, "03:00", "10:00")]), false);
  });

  it("no máximo 4 períodos por dia", () => {
    const cinco = ["00:00", "02:00", "04:00", "06:00", "08:00"].map((inicio) => ({ diaSemana: 1, inicio, fim: `${inicio.slice(0, 2)}:30` }));
    assert.equal(validar(cinco).success, false);
    assert.equal(validar(cinco.slice(0, 4)).success, true);
  });
});

describe("horários de um dia em texto", () => {
  it("lista os períodos na ordem do dia, ou diz 'Fechado'", () => {
    assert.equal(horariosDoDiaEmTexto([p(1, "18:00", "23:00"), p(1, "08:00", "14:00")], 1), "08:00–14:00 · 18:00–23:00");
    assert.equal(horariosDoDiaEmTexto(SEMANA, 3), "Fechado");
    assert.equal(horariosDoDiaEmTexto(SEMANA, 6), "18:00–02:00");
    assert.equal(horariosDoDiaEmTexto([p(1, "18:00", "24:00")], 1), "18:00–00:00");
  });
});
