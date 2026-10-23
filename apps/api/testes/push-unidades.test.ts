import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CANAL_PUSH_MENSAGENS, dadosPushSchema, registrarDispositivoPushEntradaSchema } from "@jaa/contratos";
import { criarProvedorExpo } from "../src/features/push/lib/provedor-expo.js";
import { carregarAmbiente } from "../src/lib/ambiente.js";

/* Peças puras do push: ambiente, contrato e o adaptador HTTP do Expo (sem rede: fetch falso). */

const variaveisValidas = {
  NODE_ENV: "development",
  DATABASE_URL: "postgres://localhost/jaa",
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3333",
  ORIGENS_WEB_PERMITIDAS: "http://localhost:3000",
  OTP_ENTREGA: "desenvolvimento",
};

describe("ambiente do push", () => {
  it("ausente = desativado (nenhuma chamada externa); só 'desativado' e 'expo' são aceitos", () => {
    assert.equal(carregarAmbiente(variaveisValidas).PUSH_ENTREGA, "desativado");
    assert.equal(carregarAmbiente({ ...variaveisValidas, PUSH_ENTREGA: "expo" }).PUSH_ENTREGA, "expo");
    assert.throws(() => carregarAmbiente({ ...variaveisValidas, PUSH_ENTREGA: "firebase" }), /PUSH_ENTREGA/);
  });

  it("EXPO_ACCESS_TOKEN é opcional, mesmo com o push ligado", () => {
    assert.equal(carregarAmbiente({ ...variaveisValidas, PUSH_ENTREGA: "expo" }).EXPO_ACCESS_TOKEN, undefined);
  });
});

describe("contrato do registro do aparelho", () => {
  const valido = { instalacaoId: "0199b000-0000-7000-8000-0000000000c1", token: "ExponentPushToken[abc_-1]", plataforma: "android" };

  it("aceita Expo Push Token; recusa outro formato, campo a mais e plataforma desconhecida", () => {
    assert.ok(registrarDispositivoPushEntradaSchema.safeParse(valido).success);
    assert.ok(registrarDispositivoPushEntradaSchema.safeParse({ ...valido, token: "ExpoPushToken[x]" }).success);
    for (const invalido of [{ ...valido, token: "fcm-token-cru" }, { ...valido, usuarioId: "u" }, { ...valido, plataforma: "web" }, { ...valido, instalacaoId: "1" }]) {
      assert.equal(registrarDispositivoPushEntradaSchema.safeParse(invalido).success, false, JSON.stringify(invalido));
    }
  });
});

describe("provedor Expo (HTTP)", () => {
  const dados = { v: 1 as const, evento: "nova-mensagem" as const, identidadeId: "0199b000-0000-7000-8000-0000000000c4", conversaId: "0199b000-0000-7000-8000-0000000000c5" };
  const mensagem = (indice: number) => ({ token: `ExponentPushToken[t${indice}]`, titulo: "x", texto: "y", dados, canal: CANAL_PUSH_MENSAGENS });

  it("envia em lotes de 100, com o token de acesso no cabeçalho, e devolve os tickets na ordem", async () => {
    const chamadas: { url: string; corpo: unknown[]; autorizacao: string | null }[] = [];
    const buscar: typeof fetch = async (url, init) => {
      const corpo = JSON.parse(String(init?.body)) as { to: string }[];
      chamadas.push({ url: String(url), corpo, autorizacao: new Headers(init?.headers).get("authorization") });
      const data = corpo.map((item) => (item.to === "ExponentPushToken[t3]" ? { status: "error", message: "x", details: { error: "DeviceNotRegistered" } } : { status: "ok", id: `id-${item.to}` }));
      return new Response(JSON.stringify({ data }), { status: 200 });
    };
    const tickets = await criarProvedorExpo({ tokenDeAcesso: "segredo", buscar }).enviar(Array.from({ length: 150 }, (_, i) => mensagem(i)));
    assert.deepEqual(chamadas.map((chamada) => chamada.corpo.length), [100, 50]);
    assert.equal(chamadas[0]?.autorizacao, "Bearer segredo");
    assert.equal(tickets.length, 150);
    assert.deepEqual(tickets[3], { status: "erro", erro: "DeviceNotRegistered" });
    assert.deepEqual(tickets[4], { status: "ok", id: "id-ExponentPushToken[t4]" });
    assert.deepEqual(chamadas[0]?.corpo[0], { to: "ExponentPushToken[t0]", title: "x", body: "y", data: dados, channelId: CANAL_PUSH_MENSAGENS, priority: "high", sound: "default" });
    assert.ok(dadosPushSchema.safeParse(dados).success);
  });

  it("sem token de acesso: nenhum cabeçalho de autorização", async () => {
    let autorizacao: string | null = "x";
    const buscar: typeof fetch = async (_url, init) => {
      autorizacao = new Headers(init?.headers).get("authorization");
      return new Response(JSON.stringify({ data: [{ status: "ok", id: "a" }] }), { status: 200 });
    };
    await criarProvedorExpo({ buscar }).enviar([mensagem(0)]);
    assert.equal(autorizacao, null);
  });

  it("resposta de erro HTTP ou fora do formato vira exceção sem o token na mensagem (quem chama só registra)", async () => {
    const quebrado: typeof fetch = async () => new Response("{}", { status: 500 });
    await assert.rejects(criarProvedorExpo({ tokenDeAcesso: "segredo", buscar: quebrado }).enviar([mensagem(1)]), (erro: Error) => !erro.message.includes("segredo") && !erro.message.includes("ExponentPushToken"));
    const estranho: typeof fetch = async () => new Response(JSON.stringify({ errors: [{ code: "X" }] }), { status: 200 });
    await assert.rejects(criarProvedorExpo({ buscar: estranho }).enviar([mensagem(1)]));
  });

  it("recibos: devolve o estado de cada id consultado", async () => {
    const buscar: typeof fetch = async () => new Response(JSON.stringify({ data: { a: { status: "ok" }, b: { status: "error", message: "m", details: { error: "DeviceNotRegistered" } } } }), { status: 200 });
    const recibos = await criarProvedorExpo({ buscar }).consultarRecibos(["a", "b"]);
    assert.deepEqual([...recibos], [["a", { status: "ok" }], ["b", { status: "erro", erro: "DeviceNotRegistered" }]]);
  });
});
