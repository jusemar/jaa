import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DiaSemana, PeriodoFuncionamento } from "@jaa/contratos";
import { adicionarPeriodo, copiarParaTodosOsDias, fecharDia, funcionamentoAlterado, mudarPeriodo, periodosDoRascunho, rascunhoDoFuncionamento, removerPeriodo, validarRascunho } from "./rascunho-funcionamento.ts";

const p = (diaSemana: number, inicio: string, fim: string): PeriodoFuncionamento => ({ diaSemana: diaSemana as DiaSemana, inicio, fim });
const SALVO = { ativo: true, periodos: [p(1, "08:00", "14:00"), p(1, "18:00", "24:00"), p(5, "18:00", "02:00")] };

describe("rascunho dos horários de funcionamento", () => {
  it("espelha o que está salvo, por dia, e mostra a meia-noite como 00:00 (o campo de hora não conhece 24:00)", () => {
    const rascunho = rascunhoDoFuncionamento(SALVO.ativo, SALVO.periodos);
    assert.deepEqual(rascunho.semana[1].map((x) => [x.inicio, x.fim]), [["08:00", "14:00"], ["18:00", "00:00"]]);
    assert.deepEqual(rascunho.semana[3], []);
    assert.equal(funcionamentoAlterado(SALVO, rascunho), false, "00:00 e 24:00 são o mesmo fechamento");
  });

  it("abrir um dia fechado cria 08:00–18:00; num dia já aberto, o novo período vem vazio para preencher", () => {
    let rascunho = adicionarPeriodo(rascunhoDoFuncionamento(true, []), 2);
    assert.deepEqual(rascunho.semana[2].map((x) => [x.inicio, x.fim]), [["08:00", "18:00"]]);
    rascunho = adicionarPeriodo(rascunho, 2);
    assert.deepEqual(rascunho.semana[2].map((x) => [x.inicio, x.fim]), [["08:00", "18:00"], ["", ""]]);
    assert.deepEqual(validarRascunho(rascunho), { ok: false, erro: "Preencha a abertura e o fechamento de todos os períodos." });
  });

  it("no máximo 4 períodos por dia", () => {
    let rascunho = rascunhoDoFuncionamento(true, []);
    for (let i = 0; i < 6; i++) rascunho = adicionarPeriodo(rascunho, 1);
    assert.equal(rascunho.semana[1].length, 4);
  });

  it("mudar, remover e fechar mexem só no dia e no período certos", () => {
    const inicial = rascunhoDoFuncionamento(SALVO.ativo, SALVO.periodos);
    const chave = inicial.semana[1][0]!.chave;
    const mudado = mudarPeriodo(inicial, 1, chave, { fim: "13:00" });
    assert.deepEqual(mudado.semana[1].map((x) => x.fim), ["13:00", "00:00"]);
    assert.equal(funcionamentoAlterado(SALVO, mudado), true);
    assert.equal(removerPeriodo(inicial, 1, chave).semana[1].length, 1);
    assert.deepEqual(fecharDia(inicial, 5).semana[5], []);
    assert.equal(inicial.semana[5].length, 1, "o rascunho anterior não é alterado");
  });

  it("ligar ou desligar o controle conta como alteração", () => {
    const rascunho = rascunhoDoFuncionamento(SALVO.ativo, SALVO.periodos);
    assert.equal(funcionamentoAlterado(SALVO, { ...rascunho, ativo: false }), true);
  });

  it("copiar um dia para todos: sete dias iguais, cada um com as próprias linhas", () => {
    const copiado = copiarParaTodosOsDias(rascunhoDoFuncionamento(SALVO.ativo, SALVO.periodos), 1);
    for (const dia of [1, 2, 3, 4, 5, 6, 7] as const) assert.deepEqual(copiado.semana[dia].map((x) => [x.inicio, x.fim]), [["08:00", "14:00"], ["18:00", "00:00"]]);
    assert.equal(new Set(periodosDoRascunho(copiado.semana).length ? Object.values(copiado.semana).flat().map((x) => x.chave) : []).size, 14);
  });

  it("valida com a regra do CONTRATO: 00:00 vira 24:00, sobreposição e horário igual são recusados", () => {
    const valido = validarRascunho(rascunhoDoFuncionamento(SALVO.ativo, SALVO.periodos));
    assert.ok(valido.ok);
    assert.deepEqual(valido.entrada.periodos, SALVO.periodos);

    const sobreposto = mudarPeriodo(rascunhoDoFuncionamento(true, [p(1, "08:00", "14:00"), p(1, "18:00", "23:00")]), 1, rascunhoDoFuncionamento(true, []).semana[1][0]?.chave ?? "", {});
    const base = rascunhoDoFuncionamento(true, [p(1, "08:00", "14:00"), p(1, "18:00", "23:00")]);
    const cruzado = mudarPeriodo(base, 1, base.semana[1][1]!.chave, { inicio: "13:00" });
    assert.equal(validarRascunho(sobreposto).ok, true);
    const recusado = validarRascunho(cruzado);
    assert.ok(!recusado.ok && /sobrep/.test(recusado.erro));

    const madrugada = rascunhoDoFuncionamento(true, [p(6, "18:00", "02:00"), p(7, "01:00", "09:00")]);
    assert.equal(validarRascunho(madrugada).ok, false, "o período que passa da meia-noite invade o dia seguinte");
    const igual = mudarPeriodo(base, 1, base.semana[1][0]!.chave, { fim: "08:00" });
    assert.equal(validarRascunho(igual).ok, false);
  });
});
