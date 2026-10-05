import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Fastify from "fastify";
import { criarEntregadorOtpDesenvolvimento } from "../src/features/autenticacao/entrega-otp/entregador-otp-desenvolvimento.js";
import { carregarAmbiente, confiancaNoProxy } from "../src/lib/ambiente.js";

// O IP resolvido aqui é o que alimenta o limite de tentativas de login e de OTP (rotas-better-auth.ts).
async function ipVisto(proxies: number | undefined, encaminhado: string): Promise<string> {
  const servidor = Fastify({ trustProxy: confiancaNoProxy({ PROXIES_CONFIAVEIS: proxies }) });
  servidor.get("/ip", async (requisicao) => requisicao.ip);
  const resposta = await servidor.inject({ method: "GET", url: "/ip", headers: { "x-forwarded-for": encaminhado }, remoteAddress: "10.0.0.9" });
  await servidor.close();
  return resposta.body;
}

describe("IP do cliente atrás do proxy da hospedagem", () => {
  it("sem proxy configurado (local), X-Forwarded-For é ignorado", async () => {
    assert.equal(confiancaNoProxy({ PROXIES_CONFIAVEIS: undefined }), false);
    assert.equal(confiancaNoProxy({ PROXIES_CONFIAVEIS: 0 }), false);
    assert.equal(await ipVisto(undefined, "203.0.113.7"), "10.0.0.9");
    assert.equal(await ipVisto(0, "203.0.113.7"), "10.0.0.9");
  });

  it("com 1 proxy, vale o endereço que o proxy escreveu — não o que o cliente inventou antes dele", async () => {
    assert.equal(await ipVisto(1, "203.0.113.7"), "203.0.113.7");
    assert.equal(await ipVisto(1, "1.2.3.4, 203.0.113.7"), "203.0.113.7");
  });
});

describe("OTP de desenvolvimento nunca existe em produção", () => {
  const base = {
    DATABASE_URL: "postgres://usuario:senha@127.0.0.1:5432/banco",
    BETTER_AUTH_SECRET: "x".repeat(32),
    BETTER_AUTH_URL: "https://api.exemplo.com",
    ORIGENS_WEB_PERMITIDAS: "https://api.exemplo.com",
    OTP_ENTREGA: "desenvolvimento",
  };

  it("a API de Development sobe com o código no log; a de produção nem sobe", () => {
    assert.equal(carregarAmbiente({ ...base, NODE_ENV: "development" }).OTP_ENTREGA, "desenvolvimento");
    assert.throws(() => carregarAmbiente({ ...base, NODE_ENV: "production" }), /OTP_ENTREGA=desenvolvimento é proibido/);
  });

  it("segunda barreira: o entregador de desenvolvimento recusa ser criado em produção", () => {
    assert.throws(() => criarEntregadorOtpDesenvolvimento("production"), /não pode ser usado em produção/);
  });

  it("PORT e PROXIES_CONFIAVEIS da hospedagem são lidos como números; ausentes ficam indefinidos", () => {
    const hospedado = carregarAmbiente({ ...base, NODE_ENV: "development", PORT: "8080", PROXIES_CONFIAVEIS: "1" });
    assert.deepEqual([hospedado.PORT, hospedado.PROXIES_CONFIAVEIS], [8080, 1]);
    const local = carregarAmbiente({ ...base, NODE_ENV: "development" });
    assert.deepEqual([local.PORT, local.PROXIES_CONFIAVEIS], [undefined, undefined]);
  });
});
