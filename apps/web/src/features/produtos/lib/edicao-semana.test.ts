import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DiaSemana, GrupoOpcoesProduto, ProgramacaoSemanalGrupo } from "@jaa/contratos";
import { alternarOpcao, aplicarAOutrosDias, destinosPossiveis, diaDeHojeNoNavegador, mensagemDaAplicacao, naOrdemDoGrupo, opcoesSalvasDoDia, rascunhoAlterado, resumoDoGrupo } from "./edicao-semana.ts";

const grupo = (extra: Partial<GrupoOpcoesProduto> = {}): GrupoOpcoesProduto => ({
  id: "g",
  nome: "Guarnições",
  instrucao: null,
  minimoEscolhas: 0,
  maximoEscolhas: 5,
  posicao: 0,
  programacaoSemanal: true,
  opcoes: ["arroz", "feijao", "salada"].map((id, posicao) => ({ id, nome: id, precoAdicionalCentavos: 0, disponibilidade: "disponivel" as const, posicao })),
  ...extra,
});
const programacao = (porDia: Partial<Record<DiaSemana, string[]>>): ProgramacaoSemanalGrupo => ({
  grupoId: "g",
  programacaoSemanal: true,
  dias: ([1, 2, 3, 4, 5, 6, 7] as const).map((diaSemana) => ({ diaSemana, opcaoIds: porDia[diaSemana] ?? [] })),
});

describe("alterações não salvas do dia", () => {
  it("igual ao salvo (em qualquer ordem) não é alteração; marcar ou desmarcar é", () => {
    assert.equal(rascunhoAlterado(["arroz", "feijao"], ["feijao", "arroz"]), false);
    assert.equal(rascunhoAlterado([], []), false);
    assert.equal(rascunhoAlterado(["arroz"], ["arroz", "feijao"]), true);
    assert.equal(rascunhoAlterado(["arroz", "feijao"], ["arroz"]), true);
    assert.equal(rascunhoAlterado(["arroz"], ["feijao"]), true);
  });

  it("desfazer a marcação volta ao estado sem alteração", () => {
    const salvas = ["arroz"];
    const marcou = alternarOpcao(salvas, "feijao", true);
    assert.equal(rascunhoAlterado(salvas, marcou), true);
    assert.equal(rascunhoAlterado(salvas, alternarOpcao(marcou, "feijao", false)), false);
  });

  it("o que vai ao servidor segue a ordem do grupo, sem repetição e sem id de fora", () => {
    assert.deepEqual(naOrdemDoGrupo(grupo(), ["salada", "arroz", "arroz", "de-outro-grupo"]), ["arroz", "salada"]);
  });

  it("lê o que está salvo no dia; sem programação carregada, nada", () => {
    assert.deepEqual(opcoesSalvasDoDia(programacao({ 2: ["arroz"] }), 2), ["arroz"]);
    assert.deepEqual(opcoesSalvasDoDia(programacao({ 2: ["arroz"] }), 3), []);
    assert.deepEqual(opcoesSalvasDoDia(null, 1), []);
  });
});

describe("aplicar a outros dias", () => {
  it("destinos nunca incluem o próprio dia; 'dias úteis' é segunda a sexta", () => {
    assert.deepEqual(destinosPossiveis(2), { todos: [1, 3, 4, 5, 6, 7], diasUteis: [1, 3, 4, 5] });
    assert.deepEqual(destinosPossiveis(7).diasUteis, [1, 2, 3, 4, 5]);
  });

  it("grava um dia por vez com a MESMA seleção e devolve o estado do servidor", async () => {
    const chamadas: Array<[DiaSemana, string[]]> = [];
    const resultado = await aplicarAOutrosDias([3, 4], ["arroz", "salada"], async (dia, ids) => {
      chamadas.push([dia, ids]);
      return { ok: true, dados: programacao({ [dia]: ids }) };
    });
    assert.deepEqual(chamadas, [[3, ["arroz", "salada"]], [4, ["arroz", "salada"]]]);
    assert.deepEqual([resultado.aplicados, resultado.falhas], [[3, 4], []]);
    assert.deepEqual(opcoesSalvasDoDia(resultado.programacao, 4), ["arroz", "salada"]);
    assert.deepEqual(mensagemDaAplicacao(resultado), { tom: "sucesso", texto: "Aplicado a 2 dias." });
  });

  it("falha PARCIAL: continua nos demais, não anuncia sucesso total e diz quais dias ficaram de fora", async () => {
    const resultado = await aplicarAOutrosDias([3, 4, 5], ["arroz"], async (dia, ids) => {
      if (dia === 4) return { ok: false };
      if (dia === 5) throw new Error("rede caiu");
      return { ok: true, dados: programacao({ [dia]: ids }) };
    });
    assert.deepEqual([resultado.aplicados, resultado.falhas], [[3], [4, 5]]);
    const mensagem = mensagemDaAplicacao(resultado);
    assert.equal(mensagem.tom, "erro");
    assert.equal(mensagem.texto, "Aplicado a quarta. NÃO foi aplicado a quinta, sexta — tente de novo nesses dias.");
    // A tela adota o que o servidor realmente gravou (o dia 3), não o que ela pretendia gravar.
    assert.deepEqual(opcoesSalvasDoDia(resultado.programacao, 3), ["arroz"]);
  });

  it("falha TOTAL: nada aplicado, e a mensagem diz isso", async () => {
    const resultado = await aplicarAOutrosDias([1, 2], ["arroz"], async () => ({ ok: false }));
    assert.equal(resultado.programacao, null);
    assert.deepEqual(mensagemDaAplicacao(resultado), { tom: "erro", texto: "Nada foi aplicado. Não foi possível salvar: segunda, terça. Tente novamente." });
  });
});

describe("resumo do grupo na lista (só com dados já carregados)", () => {
  it("conta opções e indisponíveis e sinaliza programação semanal", () => {
    const opcoes = grupo().opcoes.map((opcao, indice) => (indice === 2 ? { ...opcao, disponibilidade: "indisponivel" as const } : opcao));
    assert.deepEqual(resumoDoGrupo(grupo({ opcoes })), { total: 3, indisponiveis: 1, semanal: true, problema: null });
    assert.equal(resumoDoGrupo(grupo({ programacaoSemanal: false })).semanal, false);
  });

  it("aponta problema de configuração pelas regras genéricas (sem nome de grupo)", () => {
    assert.equal(resumoDoGrupo(grupo({ opcoes: [] })).problema, "Sem opções");
    const todasFora = grupo().opcoes.map((opcao) => ({ ...opcao, disponibilidade: "indisponivel" as const }));
    assert.equal(resumoDoGrupo(grupo({ opcoes: todasFora })).problema, "Nenhuma disponível");
    assert.equal(resumoDoGrupo(grupo({ minimoEscolhas: 4, maximoEscolhas: 5 })).problema, "Exige 4, há 3");
    assert.equal(resumoDoGrupo(grupo({ minimoEscolhas: 0 })).problema, null, "mínimo 0 nunca é problema");
  });
});

describe("dia de hoje (conveniência do gestor)", () => {
  it("converte o dia do navegador para ISO: domingo é 7", () => {
    assert.equal(diaDeHojeNoNavegador(new Date(2026, 9, 5)), 1);
    assert.equal(diaDeHojeNoNavegador(new Date(2026, 9, 11)), 7);
  });
});
