/// <reference types="node" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CAMINHO_ENTRAR_COM_SENHA, mensagemFalhaEntrar, montarEntradaComSenha } from "./entrar-com-senha.ts";

const SENHA = "Segredo#2026 ";

describe("entrar com usuário e senha (Mobile)", () => {
  it("usa a rota real do backend", () => {
    assert.equal(CAMINHO_ENTRAR_COM_SENHA, "/autenticacao/entrar");
  });

  it("monta o corpo do contrato: identificador aparado, senha intacta (inclusive espaços)", () => {
    assert.deepEqual(montarEntradaComSenha("  @paulo  ", SENHA), { ok: true, corpo: { identificador: "@paulo", senha: SENHA } });
    // Celular também é identificador válido: quem interpreta é o servidor.
    assert.deepEqual(montarEntradaComSenha("(31) 98765-4321", SENHA), { ok: true, corpo: { identificador: "(31) 98765-4321", senha: SENHA } });
  });

  it("recusa identificador ou senha vazios sem chamar o servidor", () => {
    assert.equal(montarEntradaComSenha("   ", SENHA).ok, false);
    assert.equal(montarEntradaComSenha("@paulo", "").ok, false);
  });

  it("credenciais inválidas mostram a mensagem do servidor", () => {
    const mensagem = mensagemFalhaEntrar({ status: 401, codigo: "CREDENCIAIS_INVALIDAS", mensagem: "Celular/@usuario ou senha incorretos." });
    assert.equal(mensagem, "Celular/@usuario ou senha incorretos.");
    assert.equal(mensagemFalhaEntrar({ status: 401 }), "Celular/@usuario ou senha incorretos.");
  });

  it("sem rede, limite de tentativas e erro desconhecido têm texto próprio", () => {
    assert.equal(mensagemFalhaEntrar(undefined), "Sem conexão com o Jaa.");
    assert.equal(mensagemFalhaEntrar({ status: 429, message: "Too many requests" }), "Muitas tentativas. Aguarde um pouco e tente de novo.");
    assert.equal(mensagemFalhaEntrar({ status: 500 }), "Não foi possível entrar agora.");
  });

  it("a senha nunca aparece na mensagem de erro, mesmo que venha em outros campos", () => {
    for (const erro of [{ status: 401, senha: SENHA }, { status: 400, corpo: { senha: SENHA } }, { status: 0, senha: SENHA }]) {
      assert.equal(mensagemFalhaEntrar(erro).includes(SENHA.trim()), false);
    }
  });
});
