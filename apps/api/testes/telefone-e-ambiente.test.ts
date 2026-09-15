import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { criarEntregadorOtpDesenvolvimento } from "../src/features/autenticacao/entrega-otp/entregador-otp-desenvolvimento.js";
import { parsePhoneNumberFromString } from "libphonenumber-js/max";
import {
  derivarEmailTecnico,
  DOMINIO_EMAIL_TECNICO,
  NOME_TECNICO_CONTA,
} from "../src/features/autenticacao/lib/conta-tecnica.js";
import { mascararTelefone, normalizarCelularBrasileiro } from "../src/features/autenticacao/lib/telefone.js";
import { carregarAmbiente } from "../src/lib/ambiente.js";

describe("normalizarCelularBrasileiro", () => {
  const casosValidos: Array<[string, string]> = [
    ["(31) 98765-4321", "máscara brasileira"],
    ["31987654321", "somente dígitos"],
    ["+55 31 98765-4321", "brasileiro colado com +55"],
    ["+5531987654321", "já em E.164"],
    ["+55 (31) 98765-4321", "+55 com máscara"],
  ];

  for (const [entrada, descricao] of casosValidos) {
    it(`${descricao}: "${entrada}" → +5531987654321`, () => {
      assert.equal(normalizarCelularBrasileiro(entrada), "+5531987654321");
    });
  }

  const celularesBrasileirosInvalidos: Array<[string, string]> = [
    ["(31) 3222-4399", "telefone fixo"],
    ["(31) 88765-4321", "celular sem o 9 inicial"],
    ["(20) 98765-4321", "DDD inexistente"],
    ["(31) 98765-432", "dígitos a menos"],
    ["(31) 98765-43210", "dígitos a mais"],
    ["", "vazio"],
    ["abc", "texto"],
    ["+".repeat(40), "entrada longa demais"],
  ];

  for (const [entrada, descricao] of celularesBrasileirosInvalidos) {
    it(`recusa ${descricao}: "${entrada.slice(0, 20)}"`, () => {
      assert.equal(normalizarCelularBrasileiro(entrada), null);
    });
  }

  for (const estrangeiro of ["+351 912 345 678", "+1 415 555 2671", "+54 9 11 2345-6789", "+44 7400 123456"]) {
    it(`recusa celular estrangeiro válido no país de origem: "${estrangeiro}"`, () => {
      // Garante que a recusa é por não ser brasileiro, e não por o número ser inválido.
      assert.equal(parsePhoneNumberFromString(estrangeiro)?.isValid(), true);
      assert.equal(normalizarCelularBrasileiro(estrangeiro), null);
    });
  }
});

describe("mascararTelefone", () => {
  it("mostra DDD e 4 últimos dígitos, sem +55", () => {
    assert.equal(mascararTelefone("+5531987654321"), "(31) •••••-4321");
  });
});

describe("dados técnicos da conta (exigidos pelo Better Auth)", () => {
  const segredo = "s".repeat(32);
  const telefone = "+5531987654321";

  it("e-mail técnico é estável para o mesmo telefone", () => {
    assert.equal(derivarEmailTecnico(telefone, segredo), derivarEmailTecnico(telefone, segredo));
  });

  it("e-mail técnico difere entre telefones e depende do segredo do servidor", () => {
    assert.notEqual(derivarEmailTecnico(telefone, segredo), derivarEmailTecnico("+5531987654322", segredo));
    assert.notEqual(derivarEmailTecnico(telefone, segredo), derivarEmailTecnico(telefone, "o".repeat(32)));
  });

  it("e-mail técnico não contém o telefone e usa domínio técnico reservado", () => {
    const email = derivarEmailTecnico(telefone, segredo);
    const [local, dominio] = email.split("@");
    assert.equal(dominio, DOMINIO_EMAIL_TECNICO);
    assert.match(dominio ?? "", /\.invalid$/);
    assert.match(local ?? "", /^[0-9a-f]{64}$/);
    for (const trecho of ["5531987654321", "31987654321", "987654321"]) {
      assert.ok(!email.includes(trecho), `e-mail contém "${trecho}"`);
    }
  });

  it("nome técnico é genérico e não contém dígitos", () => {
    assert.equal(NOME_TECNICO_CONTA, "Conta Jaa");
    assert.doesNotMatch(NOME_TECNICO_CONTA, /\d/);
  });
});

describe("entrega de OTP de desenvolvimento", () => {
  const variaveisValidas = {
    NODE_ENV: "development",
    DATABASE_URL: "postgres://localhost/jaa",
    BETTER_AUTH_SECRET: "x".repeat(32),
    BETTER_AUTH_URL: "http://localhost:3333",
    ORIGENS_WEB_PERMITIDAS: "http://localhost:3000",
    OTP_ENTREGA: "desenvolvimento",
  };

  it("é aceita em desenvolvimento", () => {
    assert.equal(carregarAmbiente(variaveisValidas).OTP_ENTREGA, "desenvolvimento");
  });

  it("é recusada pela validação de ambiente em produção", () => {
    assert.throws(() => carregarAmbiente({ ...variaveisValidas, NODE_ENV: "production" }), /OTP_ENTREGA/);
  });

  it("recusa ser criada em produção mesmo se chamada diretamente", () => {
    assert.throws(() => criarEntregadorOtpDesenvolvimento("production"));
  });

  it("não expõe o segredo ao reportar ambiente inválido", () => {
    const segredo = "segredo-curto";
    assert.throws(
      () => carregarAmbiente({ ...variaveisValidas, BETTER_AUTH_SECRET: segredo }),
      (erro: Error) => !erro.message.includes(segredo),
    );
  });
});
