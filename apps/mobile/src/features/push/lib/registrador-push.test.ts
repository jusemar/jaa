/// <reference types="node" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { criarRegistradorPush, removerInstalacaoDaConta, type DependenciasRegistradorPush } from "./registrador-push.ts";

/*
 * O loop do APK 0.7.0 (versionCode 3): pedir o token ao sistema dispara o evento "token novo"; o ouvinte
 * pedia outro token, que disparava outro evento... Aqui o "Android" falso reproduz isso: cada pedido de
 * token ao sistema emite um evento, que vai direto para o registrador, como faz o `ProvedorPush`.
 */
function aparelhoFalso(opcoes: { aceitar?: () => boolean } = {}) {
  let tokenAtual = "fcm-1";
  let instalacao = "inst-1";
  const pedidosAoSistema: string[] = [];
  const conversoes: string[] = [];
  const puts: { instalacaoId: string; token: string }[] = [];
  let ouvinte: ((token: string) => void) | null = null;
  let liberarPut: (() => void) | null = null;
  let segurarPut = false;

  const dependencias: DependenciasRegistradorPush = {
    tokenDoAparelho: async () => {
      pedidosAoSistema.push(tokenAtual);
      const token = tokenAtual;
      // Como o nativo: depois de resolver, avisa os ouvintes de "token novo".
      queueMicrotask(() => ouvinte?.(token));
      return token;
    },
    tokenExpo: async (nativo) => {
      conversoes.push(nativo);
      return `ExponentPushToken[${nativo}]`;
    },
    instalacaoId: async () => instalacao,
    enviar: async (registro) => {
      puts.push(registro);
      if (segurarPut) await new Promise<void>((pronto) => (liberarPut = pronto));
      return opcoes.aceitar?.() ?? true;
    },
  };
  return {
    dependencias,
    pedidosAoSistema,
    conversoes,
    puts,
    ouvir: (funcao: (token: string) => void) => (ouvinte = funcao),
    renovarToken: (novo: string) => (tokenAtual = novo),
    reinstalar: (nova: string) => (instalacao = nova),
    segurar: () => (segurarPut = true),
    liberar: () => {
      segurarPut = false;
      liberarPut?.();
    },
  };
}

// Deixa microtarefas e timers zero (eventos, ciclos pendentes) acontecerem.
const assentar = () => new Promise((pronto) => setTimeout(pronto, 10));

describe("registrador do push (sem loop)", () => {
  it("1. token inicial → exatamente um registro, mesmo com o evento que o próprio pedido dispara", async () => {
    const aparelho = aparelhoFalso();
    const registrador = criarRegistradorPush("conta-a", aparelho.dependencias);
    aparelho.ouvir((token) => void registrador.registrar(token));
    assert.equal(await registrador.registrar(), true);
    await assentar();
    assert.deepEqual(aparelho.puts, [{ instalacaoId: "inst-1", token: "ExponentPushToken[fcm-1]" }]);
    assert.equal(aparelho.pedidosAoSistema.length, 1);
  });

  it("2 e 3. evento de token renovado: usa o token DO EVENTO e não pede outro ao sistema", async () => {
    const aparelho = aparelhoFalso();
    const registrador = criarRegistradorPush("conta-a", aparelho.dependencias);
    await registrador.registrar();
    await assentar();
    const pedidosAntes = aparelho.pedidosAoSistema.length;
    await registrador.registrar("fcm-renovado");
    assert.equal(aparelho.pedidosAoSistema.length, pedidosAntes, "nenhum pedido novo ao sistema");
    assert.deepEqual(aparelho.puts.at(-1), { instalacaoId: "inst-1", token: "ExponentPushToken[fcm-renovado]" });
  });

  it("4. eventos repetidos com o mesmo token não repetem o PUT (nem a conversão)", async () => {
    const aparelho = aparelhoFalso();
    const registrador = criarRegistradorPush("conta-a", aparelho.dependencias);
    for (let i = 0; i < 50; i += 1) await registrador.registrar("fcm-1");
    await registrador.registrar(); // volta ao app: pede ao sistema, mesmo token
    await assentar();
    assert.equal(aparelho.puts.length, 1);
    assert.equal(aparelho.conversoes.length, 1);
  });

  it("5. chamadas simultâneas viram um registro só", async () => {
    const aparelho = aparelhoFalso();
    const registrador = criarRegistradorPush("conta-a", aparelho.dependencias);
    aparelho.segurar();
    const chamadas = [registrador.registrar(), registrador.registrar(), registrador.registrar("fcm-1"), registrador.registrar()];
    await assentar();
    aparelho.liberar();
    assert.deepEqual(await Promise.all(chamadas), [true, true, true, true]);
    await assentar();
    assert.equal(aparelho.puts.length, 1);
    assert.equal(aparelho.pedidosAoSistema.length, 1);
  });

  it("6. troca de token (ou de instalação) → exatamente um PUT novo", async () => {
    const aparelho = aparelhoFalso();
    const registrador = criarRegistradorPush("conta-a", aparelho.dependencias);
    await registrador.registrar();
    aparelho.renovarToken("fcm-2");
    await registrador.registrar("fcm-2");
    await registrador.registrar("fcm-2");
    await registrador.registrar();
    await assentar();
    assert.deepEqual(aparelho.puts.map((put) => put.token), ["ExponentPushToken[fcm-1]", "ExponentPushToken[fcm-2]"]);
    aparelho.reinstalar("inst-2");
    await registrador.registrar("fcm-2");
    assert.equal(aparelho.puts.length, 3);
    assert.equal(aparelho.puts.at(-1)?.instalacaoId, "inst-2");
  });

  it("token que muda DURANTE um registro: conferido logo depois, uma vez", async () => {
    const aparelho = aparelhoFalso();
    const registrador = criarRegistradorPush("conta-a", aparelho.dependencias);
    aparelho.segurar();
    const primeira = registrador.registrar("fcm-1");
    await assentar();
    void registrador.registrar("fcm-2");
    void registrador.registrar("fcm-3");
    aparelho.liberar();
    await primeira;
    await assentar();
    assert.deepEqual(aparelho.puts.map((put) => put.token), ["ExponentPushToken[fcm-1]", "ExponentPushToken[fcm-3]"]);
  });

  it("7. troca de conta no aparelho: o registrador da conta nova reassocia (um PUT), mesmo token e instalação", async () => {
    const aparelho = aparelhoFalso();
    await criarRegistradorPush("conta-a", aparelho.dependencias).registrar();
    const daNova = criarRegistradorPush("conta-b", aparelho.dependencias);
    await daNova.registrar();
    await daNova.registrar("fcm-1");
    await assentar();
    assert.equal(aparelho.puts.length, 2);
    assert.deepEqual(aparelho.puts[0], aparelho.puts[1]);
  });

  it("falha do PUT não é lembrada: a próxima vez tenta de novo — e não vira loop sozinha", async () => {
    let aceitar = false;
    const aparelho = aparelhoFalso({ aceitar: () => aceitar });
    const registrador = criarRegistradorPush("conta-a", aparelho.dependencias);
    aparelho.ouvir((token) => void registrador.registrar(token));
    assert.equal(await registrador.registrar(), false);
    await assentar();
    assert.ok(aparelho.puts.length <= 2, `tentativas: ${aparelho.puts.length}`);
    aceitar = true;
    const antes = aparelho.puts.length;
    assert.equal(await registrador.registrar("fcm-1"), true);
    assert.equal(aparelho.puts.length, antes + 1);
  });

  it("sem token (sem Firebase/rede): devolve false e não lança", async () => {
    const aparelho = aparelhoFalso();
    const registrador = criarRegistradorPush("conta-a", { ...aparelho.dependencias, tokenDoAparelho: async () => Promise.reject(new Error("sem firebase")) });
    assert.equal(await registrador.registrar(), false);
    assert.equal(aparelho.puts.length, 0);
  });
});

describe("8. logout tira o aparelho da conta", () => {
  it("apaga a instalação guardada", async () => {
    const apagadas: string[] = [];
    const avisos: string[] = [];
    await removerInstalacaoDaConta({ instalacaoGuardada: async () => "inst-1", apagar: async (id) => (apagadas.push(id), true), avisar: (texto) => avisos.push(texto) });
    assert.deepEqual(apagadas, ["inst-1"]);
    assert.deepEqual(avisos, []);
  });

  it("sem instalação guardada: não chama a API", async () => {
    let chamou = false;
    await removerInstalacaoDaConta({ instalacaoGuardada: async () => null, apagar: async () => (chamou = true), avisar: () => undefined });
    assert.equal(chamou, false);
  });

  it("falha ou demora: só avisa (sem ids) e nunca prende o sair", async () => {
    const avisos: string[] = [];
    await removerInstalacaoDaConta({ instalacaoGuardada: async () => "inst-1", apagar: async () => Promise.reject(new Error("rede")), avisar: (texto) => avisos.push(texto) });
    await removerInstalacaoDaConta({ instalacaoGuardada: async () => "inst-1", apagar: () => new Promise<boolean>(() => undefined), avisar: (texto) => avisos.push(texto), limiteMs: 20 });
    assert.equal(avisos.length, 2);
    assert.ok(avisos.every((texto) => !texto.includes("inst-1")));
  });
});
