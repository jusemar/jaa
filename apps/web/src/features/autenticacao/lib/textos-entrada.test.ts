import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { EXEMPLOS_ENTRADA, TEXTOS_ENTRADA, fraseDoDestino } from "./textos-entrada.ts";

const fonte = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), "utf8");

describe("exemplos (placeholders) da entrada e do cadastro", () => {
  it("são modelos fictícios: DDD 00 (inexistente) e nomes genéricos", () => {
    assert.match(EXEMPLOS_ENTRADA.celular, /^\(00\) 00000-0000$/);
    assert.ok(EXEMPLOS_ENTRADA.identificador.startsWith(EXEMPLOS_ENTRADA.celular));
    assert.ok(EXEMPLOS_ENTRADA.identificador.endsWith(`@${EXEMPLOS_ENTRADA.usuario}`));
    assert.equal(EXEMPLOS_ENTRADA.codigo, "000000");
    assert.equal(EXEMPLOS_ENTRADA.usuario, "seunome");
  });

  it("todo placeholder da tela vem destas constantes — nunca de conta, sessão ou resposta da API", () => {
    const tela = fonte("../components/fluxo-autenticacao.tsx");
    const placeholders = [...tela.matchAll(/placeholder=(\{[^}]*\}|"[^"]*")/g)].map((achado) => achado[1]);
    assert.ok(placeholders.length >= 5);
    for (const valor of placeholders) assert.match(valor as string, /^\{EXEMPLOS_ENTRADA\.[a-z]+\}$/, valor);
    // Nenhum número de celular ou @usuario escrito direto na tela.
    assert.ok(!/\(\d{2}\) ?9\d{4}-\d{4}/.test(tela), "sem telefone na tela");
    assert.ok(!/placeholder="/.test(tela));
  });
});

describe("textos da entrada", () => {
  it("separam quem já tem conta de quem é novo, sem jargão", () => {
    assert.equal(TEXTOS_ENTRADA.entrar.titulo, "Entrar");
    assert.equal(TEXTOS_ENTRADA.novo.titulo, "Novo no Jaaa?");
    assert.equal(TEXTOS_ENTRADA.novo.acao, "Criar conta");
    const todos = JSON.stringify(TEXTOS_ENTRADA) + TEXTOS_ENTRADA.codigo.descricao("(00) 00000-0000");
    for (const jargao of ["OTP", "token", "SMS", "autentica", "credencia"]) assert.ok(!todos.toLowerCase().includes(jargao.toLowerCase()), jargao);
  });

  it("não prometem o que o servidor não faz: nada de redefinir/recuperar senha", () => {
    const todos = JSON.stringify(TEXTOS_ENTRADA).toLowerCase();
    for (const promessa of ["redefin", "recuper", "nova senha", "e-mail", "email"]) assert.ok(!todos.includes(promessa), promessa);
  });

  it("frase de quem chegou por link é curta e diz com quem a pessoa continua", () => {
    const frase = fraseDoDestino("Pizzaria Oasis");
    assert.equal(frase, "É rápido: entre e continue com Pizzaria Oasis.");
    assert.ok(frase.length < 60);
  });
});
