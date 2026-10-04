/// <reference types="node" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { capacidadeDoTipo, interpretarContextoConta, temCapacidade } from "./contexto-conta.ts";

const pessoal = "01a0a394-6225-75f2-b809-b2690993c512";
const empresa = "01a0a394-6225-75f2-b809-b2690993c599";

const base = {
  versao: 1,
  conta: { telefoneMascarado: "(31) •••••-4321", cadastroCompleto: true },
  identidadePessoal: { id: pessoal, nomeExibicao: "Paulo", nomeUsuario: "paulo", criadoEm: "2026-09-15T12:00:00.000Z" },
  identidadesOperaveis: [{ tipo: "pessoal", identidadeId: pessoal, nomeExibicao: "Paulo", nomeUsuario: "paulo" }],
  capacidades: [] as unknown[],
};

const entregador = { tipo: "entregador_empresa", estado: "ativa", resumo: { vinculosAtivos: 2, convitesPendentes: 1 } };
const perfil = { tipo: "perfil_profissional", estado: "pendente", resumo: { pendencias: ["area"] } };
const empresarial = (papel: string) => ({
  tipo: "empresarial",
  identidadeId: empresa,
  nomeExibicao: "Pizzaria",
  nomeUsuario: "pizzaria",
  empresa: { id: empresa, slug: "pizzaria", papel },
});

function interpretar(bruto: unknown) {
  const resultado = interpretarContextoConta(bruto);
  assert.ok(resultado.ok, "contexto deveria ser lido");
  return resultado.contexto;
}

describe("interpretação do contexto da conta no Mobile", () => {
  it("conta sem capacidades: identidade pessoal e nenhuma capacidade", () => {
    const contexto = interpretar(base);
    assert.equal(contexto.identidadePessoal?.nomeUsuario, "paulo");
    assert.deepEqual(contexto.capacidades, []);
    assert.deepEqual(contexto.empresasOperaveis, []);
    assert.equal(temCapacidade(contexto.capacidades, "entregador_empresa"), false);
  });

  it("capacidade conhecida é reconhecida com estado e resumo exatamente como vieram", () => {
    const contexto = interpretar({ ...base, capacidades: [entregador] });
    assert.deepEqual(capacidadeDoTipo(contexto.capacidades, "entregador_empresa"), entregador);
    assert.equal(temCapacidade(contexto.capacidades, "perfil_profissional"), false);
  });

  it("várias capacidades ao mesmo tempo, na ordem do servidor", () => {
    const contexto = interpretar({ ...base, capacidades: [entregador, perfil] });
    assert.deepEqual(contexto.capacidades.map((capacidade) => [capacidade.tipo, capacidade.estado]), [
      ["entregador_empresa", "ativa"],
      ["perfil_profissional", "pendente"],
    ]);
  });

  it("capacidade desconhecida (ou estado desconhecido) é ignorada sem derrubar o contexto", () => {
    const contexto = interpretar({
      ...base,
      capacidades: [entregador, { tipo: "mototaxi_operador", estado: "ativa", resumo: {} }, { ...perfil, estado: "suspensa" }],
    });
    assert.deepEqual(contexto.capacidades, [entregador]);
    assert.equal(contexto.capacidadesIgnoradas, 2);
  });

  it("empresa aparece como identidade operável, nunca como capacidade", () => {
    const contexto = interpretar({ ...base, identidadesOperaveis: [...base.identidadesOperaveis, empresarial("proprietario")] });
    assert.equal(contexto.identidadesOperaveis.length, 2);
    assert.deepEqual(
      contexto.empresasOperaveis.map((item) => [item.nomeExibicao, item.papel, item.papelConhecido]),
      [["Pizzaria", "proprietario", "proprietario"]],
    );
    assert.deepEqual(contexto.capacidades, []);
  });

  it("papel empresarial desconhecido não vira proprietário e não derruba o contexto", () => {
    const contexto = interpretar({ ...base, capacidades: [perfil], identidadesOperaveis: [...base.identidadesOperaveis, empresarial("atendente")] });
    const [loja] = contexto.empresasOperaveis;
    assert.equal(loja?.papel, "atendente");
    assert.equal(loja?.papelConhecido, null);
    assert.deepEqual(contexto.capacidades, [perfil]);
  });

  it("resposta em formato inesperado é erro explícito (nunca contexto inventado)", () => {
    assert.equal(interpretarContextoConta({ ...base, capacidades: { entregador_empresa: true } }).ok, false);
    assert.equal(interpretarContextoConta(null).ok, false);
  });
});
