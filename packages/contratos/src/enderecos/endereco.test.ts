import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CAMPOS_ESTRUTURAIS_ENDERECO,
  alteracaoInvalidaLocalizacao,
  confirmarLocalizacaoEntradaSchema,
  criarEnderecoEntradaSchema,
  enderecoTemLocalizacaoConfirmada,
  formatarCep,
  formatarEnderecoResumido,
} from "./endereco.ts";

const base = {
  apelido: "Casa",
  cep: "30123-000",
  logradouro: "Rua das Flores",
  numero: "150",
  complemento: "Apto 302",
  bairro: "Centro",
  cidade: "Belo Horizonte",
  uf: "MG",
  pontoReferencia: "Portão azul",
};

describe("cadastro de endereço", () => {
  it("normaliza CEP para dígitos e mantém o texto do cliente", () => {
    const endereco = criarEnderecoEntradaSchema.parse(base);
    assert.equal(endereco.cep, "30123000");
    assert.equal(endereco.logradouro, "Rua das Flores");
    assert.equal(endereco.numero, "150");
  });

  it("campos opcionais vazios viram null, nunca string vazia", () => {
    const endereco = criarEnderecoEntradaSchema.parse({ ...base, complemento: "  ", pontoReferencia: "" });
    assert.equal(endereco.complemento, null);
    assert.equal(endereco.pontoReferencia, null);
  });

  it("recusa endereço incompleto, CEP inválido e UF inexistente", () => {
    assert.equal(criarEnderecoEntradaSchema.safeParse({ ...base, logradouro: "  " }).success, false);
    assert.equal(criarEnderecoEntradaSchema.safeParse({ ...base, numero: "" }).success, false);
    assert.equal(criarEnderecoEntradaSchema.safeParse({ ...base, cep: "3012" }).success, false);
    assert.equal(criarEnderecoEntradaSchema.safeParse({ ...base, uf: "XX" }).success, false);
  });
});

describe("coordenadas confirmadas", () => {
  it("aceita ponto válido com precisão de navegação", () => {
    const ponto = confirmarLocalizacaoEntradaSchema.parse({ latitude: -19.9191249, longitude: -43.9386015 });
    assert.equal(ponto.latitude, -19.9191249);
  });

  it("recusa latitude, longitude e valores não finitos fora da faixa", () => {
    for (const invalido of [
      { latitude: 91, longitude: 0 },
      { latitude: -91, longitude: 0 },
      { latitude: 0, longitude: 181 },
      { latitude: 0, longitude: -181 },
      { latitude: Number.NaN, longitude: 0 },
      { latitude: Number.POSITIVE_INFINITY, longitude: 0 },
      { latitude: "-19.9", longitude: -43.9 },
    ]) {
      assert.equal(confirmarLocalizacaoEntradaSchema.safeParse(invalido).success, false, JSON.stringify(invalido));
    }
  });

  it("só há localização confirmada com coordenadas E data de confirmação", () => {
    assert.equal(enderecoTemLocalizacaoConfirmada({ latitude: -19.9, longitude: -43.9, localizacaoConfirmadaEm: "2026-09-16T12:00:00.000Z" }), true);
    assert.equal(enderecoTemLocalizacaoConfirmada({ latitude: -19.9, longitude: -43.9, localizacaoConfirmadaEm: null }), false);
    assert.equal(enderecoTemLocalizacaoConfirmada({ latitude: null, longitude: null, localizacaoConfirmadaEm: null }), false);
  });
});

describe("regra central de invalidação da confirmação", () => {
  it("mudar qualquer campo estrutural invalida o ponto confirmado", () => {
    for (const campo of CAMPOS_ESTRUTURAIS_ENDERECO) {
      const novo = { ...base, [campo]: campo === "uf" ? "SP" : `${base[campo] ?? ""} alterado` };
      assert.equal(alteracaoInvalidaLocalizacao(base, novo), true, campo);
    }
  });

  it("apelido é etiqueta pessoal: 'Casa' → 'Minha casa' preserva o ponto", () => {
    assert.equal(alteracaoInvalidaLocalizacao(base, { ...base, apelido: "Minha casa" }), false);
  });

  it("diferença só de caixa ou espaço não invalida", () => {
    assert.equal(alteracaoInvalidaLocalizacao(base, { ...base, logradouro: "  rua   das flores " }), false);
  });

  it("preencher ou apagar complemento invalida (pode ser outra entrada física)", () => {
    assert.equal(alteracaoInvalidaLocalizacao(base, { ...base, complemento: null }), true);
    assert.equal(alteracaoInvalidaLocalizacao({ ...base, complemento: null }, { ...base, complemento: "Casa 2 dos fundos" }), true);
  });
});

describe("exibição", () => {
  it("resume o endereço como o cliente cadastrou e formata o CEP", () => {
    assert.equal(formatarEnderecoResumido(base), "Rua das Flores, 150 — Apto 302");
    assert.equal(formatarEnderecoResumido({ ...base, complemento: null }), "Rua das Flores, 150");
    assert.equal(formatarCep("30123000"), "30123-000");
  });
});
