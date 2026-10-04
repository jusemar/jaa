import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { identidadeOperavelRecebidaSchema, identidadeOperavelSchema, papelEmpresaConhecido } from "../identidades/identidade-operavel.ts";
import { capacidadesConhecidas, contextoContaRespostaSchema, contextoContaSchema } from "./contexto-conta.ts";

const pessoal = "01a0a394-6225-75f2-b809-b2690993c512";
const empresa = "01a0a394-6225-75f2-b809-b2690993c599";

const contexto = {
  versao: 1,
  conta: { telefoneMascarado: "(31) •••••-4321", cadastroCompleto: true },
  identidadePessoal: { id: pessoal, nomeExibicao: "Paulo", nomeUsuario: "paulo", criadoEm: "2026-09-15T12:00:00.000Z" },
  identidadesOperaveis: [{ tipo: "pessoal", identidadeId: pessoal, nomeExibicao: "Paulo", nomeUsuario: "paulo", fotoUrl: null }],
  capacidades: [
    { tipo: "entregador_empresa", estado: "ativa", resumo: { vinculosAtivos: 2, convitesPendentes: 0 } },
    { tipo: "perfil_profissional", estado: "pendente", resumo: { pendencias: ["area"] } },
  ],
};

// O que uma API FUTURA poderia devolver: capacidade que esta versão não conhece e campo novo.
const contextoDoFuturo = {
  ...contexto,
  novidade: { qualquer: true },
  capacidades: [
    ...contexto.capacidades,
    { tipo: "mototaxi_operador", estado: "ativa", resumo: { corridasHoje: 3 } },
    { tipo: "entregador_empresa", estado: "suspensa", resumo: { vinculosAtivos: 0, convitesPendentes: 0 } },
  ],
};

describe("contexto da conta", () => {
  it("a resposta da API valida com as capacidades conhecidas", () => {
    const lido = contextoContaRespostaSchema.parse(contexto);
    assert.deepEqual(
      lido.capacidades.map((capacidade) => capacidade.tipo),
      ["entregador_empresa", "perfil_profissional"],
    );
  });

  it("a leitura do CLIENTE não quebra com capacidade, estado ou campo desconhecidos", () => {
    const lido = contextoContaSchema.parse(contextoDoFuturo);
    assert.equal(lido.capacidades.length, 4);
    // O cliente só usa o que conhece; o resto é ignorado, nunca erro.
    assert.deepEqual(capacidadesConhecidas(lido.capacidades), contexto.capacidades);
  });

  it("pendência nova do Perfil Profissional não faz o cliente perder a capacidade", () => {
    const [perfil] = capacidadesConhecidas([{ tipo: "perfil_profissional", estado: "pendente", resumo: { pendencias: ["documento"] } }]);
    assert.deepEqual(perfil, { tipo: "perfil_profissional", estado: "pendente", resumo: { pendencias: ["documento"] } });
  });

  it("não existe mapa de booleanos: capacidades é sempre uma lista", () => {
    assert.equal(contextoContaSchema.safeParse({ ...contexto, capacidades: { entregador_empresa: true } }).success, false);
  });
});

describe("identidades operáveis no contexto: papel empresarial futuro", () => {
  const empresarial = (papel: string) => ({
    tipo: "empresarial",
    identidadeId: empresa,
    nomeExibicao: "Pizzaria",
    nomeUsuario: "pizzaria",
    fotoUrl: null,
    empresa: { id: empresa, slug: "pizzaria", papel },
  });
  const comEmpresa = (papel: string) => ({ ...contexto, identidadesOperaveis: [...contexto.identidadesOperaveis, empresarial(papel)] });

  it("papel conhecido (proprietario) continua válido na resposta da API e na leitura do cliente", () => {
    assert.equal(contextoContaRespostaSchema.safeParse(comEmpresa("proprietario")).success, true);
    const lido = contextoContaSchema.parse(comEmpresa("proprietario"));
    const [, loja] = lido.identidadesOperaveis;
    assert.equal(loja?.tipo === "empresarial" && papelEmpresaConhecido(loja.empresa.papel), "proprietario");
  });

  it("papel desconhecido NÃO derruba a leitura: o resto do contexto e a identidade empresarial continuam", () => {
    const lido = contextoContaSchema.parse(comEmpresa("atendente"));
    assert.equal(lido.identidadePessoal?.id, pessoal);
    assert.equal(lido.capacidades.length, 2);
    const [, loja] = lido.identidadesOperaveis;
    assert.equal(loja?.tipo, "empresarial");
    assert.equal(loja?.identidadeId, empresa);
  });

  it("papel desconhecido nunca vira proprietário: fica como veio e não é reconhecido", () => {
    const [, loja] = contextoContaSchema.parse(comEmpresa("atendente")).identidadesOperaveis;
    assert.equal(loja?.tipo === "empresarial" && loja.empresa.papel, "atendente");
    assert.equal(papelEmpresaConhecido("atendente"), null);
    assert.equal(papelEmpresaConhecido(""), null);
  });

  it("o schema AUTORITATIVO continua recusando papel que o servidor atual não conhece", () => {
    assert.equal(contextoContaRespostaSchema.safeParse(comEmpresa("atendente")).success, false);
    assert.equal(identidadeOperavelSchema.safeParse(empresarial("atendente")).success, false);
  });

  it("o TIPO da identidade continua fechado também na leitura (decisão estrutural: pessoal × empresarial)", () => {
    const tipoNovo = { ...contexto, identidadesOperaveis: [...contexto.identidadesOperaveis, { ...empresarial("proprietario"), tipo: "grupo" }] };
    assert.equal(contextoContaSchema.safeParse(tipoNovo).success, false);
    assert.equal(identidadeOperavelRecebidaSchema.safeParse({ tipo: "grupo", identidadeId: empresa, nomeExibicao: "X", nomeUsuario: "x" }).success, false);
  });

  it("identidade empresarial sem empresa continua inválida mesmo na leitura tolerante", () => {
    const { empresa: _removida, ...semEmpresa } = empresarial("proprietario");
    assert.equal(identidadeOperavelRecebidaSchema.safeParse(semEmpresa).success, false);
  });
});

describe("foto das identidades operáveis", () => {
  const base = { tipo: "pessoal", identidadeId: pessoal, nomeExibicao: "Paulo", nomeUsuario: "paulo" };

  it("a resposta da API exige fotoUrl (URL ou null)", () => {
    assert.equal(identidadeOperavelSchema.safeParse({ ...base, fotoUrl: "https://pub-exemplo.r2.dev/avatar/x.webp" }).success, true);
    assert.equal(identidadeOperavelSchema.safeParse({ ...base, fotoUrl: null }).success, true);
    assert.equal(identidadeOperavelSchema.safeParse(base).success, false);
  });

  it("a leitura do cliente é tolerante: foto ausente ou inválida vira null, sem derrubar o contexto", () => {
    assert.equal(identidadeOperavelRecebidaSchema.parse(base).fotoUrl, null);
    assert.equal(identidadeOperavelRecebidaSchema.parse({ ...base, fotoUrl: "não é url" }).fotoUrl, null);
    assert.equal(identidadeOperavelRecebidaSchema.parse({ ...base, fotoUrl: "https://pub-exemplo.r2.dev/a.webp" }).fotoUrl, "https://pub-exemplo.r2.dev/a.webp");
  });
});
