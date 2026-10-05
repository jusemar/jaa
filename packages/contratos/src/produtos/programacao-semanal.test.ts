import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DIAS_SEMANA } from "../profissionais/horarios-atendimento.ts";
import {
  ROTULO_DIA_SEMANA,
  definirOpcoesDoDiaEntradaSchema,
  definirProgramacaoSemanalEntradaSchema,
  diaOperacionalDaEmpresa,
  grupoOpcoesProdutoSchema,
  programacaoSemanalGrupoSchema,
} from "./personalizacao.ts";

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("dia operacional da empresa", () => {
  it("é o dia ISO (1 = segunda … 7 = domingo) no fuso da EMPRESA", () => {
    // 2026-10-05 é uma segunda-feira.
    assert.equal(diaOperacionalDaEmpresa(new Date("2026-10-05T15:00:00Z"), "America/Sao_Paulo"), 1);
    assert.equal(diaOperacionalDaEmpresa(new Date("2026-10-11T15:00:00Z"), "America/Sao_Paulo"), 7);
  });

  it("vira à meia-noite LOCAL da empresa, não à meia-noite UTC nem à de quem compra", () => {
    assert.equal(diaOperacionalDaEmpresa(new Date("2026-10-06T02:59:59Z"), "America/Sao_Paulo"), 1, "23:59 de segunda em São Paulo");
    assert.equal(diaOperacionalDaEmpresa(new Date("2026-10-06T03:00:00Z"), "America/Sao_Paulo"), 2, "00:00 de terça em São Paulo");
    assert.equal(diaOperacionalDaEmpresa(new Date("2026-10-06T03:30:00Z"), "America/Manaus"), 1, "em Manaus ainda é segunda");
    assert.equal(diaOperacionalDaEmpresa(new Date("2026-10-06T02:30:00Z"), "Asia/Tokyo"), 2);
  });

  it("todo dia tem rótulo, na ordem segunda → domingo", () => {
    assert.deepEqual(DIAS_SEMANA.map((dia) => ROTULO_DIA_SEMANA[dia]), ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"]);
  });
});

describe("contratos da programação semanal", () => {
  it("o grupo administrativo informa se a programação está ligada", () => {
    const grupo = { id: ID(1), nome: "Guarnições", instrucao: null, minimoEscolhas: 0, maximoEscolhas: 5, posicao: 0, opcoes: [] };
    assert.equal(grupoOpcoesProdutoSchema.parse({ ...grupo, programacaoSemanal: true }).programacaoSemanal, true);
    assert.equal(grupoOpcoesProdutoSchema.safeParse(grupo).success, false, "o campo é sempre informado pelo servidor");
  });

  it("opções de um dia: lista vazia vale (grupo de mínimo 0 sem nada no dia); repetição não", () => {
    assert.deepEqual(definirOpcoesDoDiaEntradaSchema.parse({ opcaoIds: [] }), { opcaoIds: [] });
    assert.equal(definirOpcoesDoDiaEntradaSchema.safeParse({ opcaoIds: [ID(1), ID(2)] }).success, true);
    assert.equal(definirOpcoesDoDiaEntradaSchema.safeParse({ opcaoIds: [ID(1), ID(1)] }).success, false);
    assert.equal(definirOpcoesDoDiaEntradaSchema.safeParse({ opcaoIds: ["arroz"] }).success, false);
  });

  it("ligar/desligar é só um booleano; a programação completa tem exatamente os sete dias", () => {
    assert.equal(definirProgramacaoSemanalEntradaSchema.safeParse({ programacaoSemanal: "sim" }).success, false);
    const dias = DIAS_SEMANA.map((diaSemana) => ({ diaSemana, opcaoIds: diaSemana === 1 ? [ID(1)] : [] }));
    assert.equal(programacaoSemanalGrupoSchema.safeParse({ grupoId: ID(9), programacaoSemanal: true, dias }).success, true);
    assert.equal(programacaoSemanalGrupoSchema.safeParse({ grupoId: ID(9), programacaoSemanal: true, dias: dias.slice(0, 6) }).success, false);
    assert.equal(programacaoSemanalGrupoSchema.safeParse({ grupoId: ID(9), programacaoSemanal: true, dias: [...dias.slice(0, 6), { diaSemana: 8, opcaoIds: [] }] }).success, false);
  });
});
