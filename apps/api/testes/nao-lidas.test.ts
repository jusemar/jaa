import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { EVENTO_CONVERSA_NAO_LIDAS, LIMITE_CONTAGEM_NAO_LIDAS, type EventoConversaNaoLidas, type Mensagem } from "@jaa/contratos";
import { aguardarAte, coletar, criarAmbienteIntegracao, esperar, type Pessoa } from "./apoio/integracao.js";

/*
 * Integração REAL da contagem de não lidas: lista (HTTP) e `conversa:nao-lidas` (realtime), sempre
 * derivadas do marcador de leitura persistido.
 */

const ctx = criarAmbienteIntegracao({
  telefones: ["+5531987651001", "+5531987651002", "+5531987651003"],
  prefixoIp: "198.18.5.",
});

let A: Pessoa;
let B: Pessoa;
let C: Pessoa;
let conversaAB = "";
let conversaBC = "";

async function naoLidas(pessoa: Pessoa, conversaId: string) {
  return (await ctx.lista(pessoa)).conversas.find((c) => c.id === conversaId)?.naoLidas;
}
const ler = (pessoa: Pessoa, conversaId: string, ateMensagemId: string) =>
  ctx.api(pessoa, "POST", `/conversas/${conversaId}/leitura`, { ateMensagemId });
const ultimoValor = (eventos: EventoConversaNaoLidas[], conversaId: string) => eventos.filter((e) => e.conversaId === conversaId).at(-1)?.naoLidas;

before(async () => {
  await ctx.iniciar();
  A = await ctx.criarPessoa(0, "nl_a", "Ana NL");
  B = await ctx.criarPessoa(1, "nl_b", "Mateus NL");
  C = await ctx.criarPessoa(2, "nl_c", "Carla NL");
  conversaAB = await ctx.abrirConversa(A, "nl_b");
  conversaBC = await ctx.abrirConversa(C, "nl_b");
});

after(() => ctx.encerrar());

describe("contagem de não lidas", () => {
  it("0, 1 e várias; próprias nunca contam; B offline vê a contagem ao voltar (reload)", async () => {
    await ctx.enviar(A, conversaAB, "primeira");
    assert.equal(await naoLidas(A, conversaAB), 0, "remetente não tem não lidas");
    assert.equal(await naoLidas(B, conversaAB), 1);
    await ctx.enviar(A, conversaAB, "segunda");
    await ctx.enviar(A, conversaAB, "terceira");
    await ctx.enviar(B, conversaAB, "B responde (própria não conta)");
    assert.equal(await naoLidas(B, conversaAB), 3);
    assert.equal(await naoLidas(A, conversaAB), 1);
    assert.equal(await naoLidas(B, conversaAB), 3, "reload: mesma contagem");
  });

  it("várias conversas independentes; leitura parcial reduz e leitura até a última zera", async () => {
    const deC = [await ctx.enviar(C, conversaBC, "c1"), await ctx.enviar(C, conversaBC, "c2")];
    assert.equal(await naoLidas(B, conversaBC), 2);
    assert.equal(await naoLidas(B, conversaAB), 3);

    assert.equal((await ler(B, conversaBC, (deC[0] as Mensagem).id)).statusCode, 200);
    assert.equal(await naoLidas(B, conversaBC), 1);
    assert.equal((await ler(B, conversaBC, (deC[1] as Mensagem).id)).statusCode, 200);
    assert.equal(await naoLidas(B, conversaBC), 0);
    assert.equal(await naoLidas(B, conversaAB), 3, "outra conversa não é afetada");
  });

  it("realtime: todas as conexões de B recebem o valor absoluto (sobe ao receber, zera ao ler); A e C não recebem", async () => {
    const [b1, b2, a1, c1] = await Promise.all([ctx.conectar(B), ctx.conectar(B), ctx.conectar(A), ctx.conectar(C)]);
    const [emB1, emB2, emA, emC] = [b1, b2, a1, c1].map((s) => coletar<EventoConversaNaoLidas>(s, EVENTO_CONVERSA_NAO_LIDAS));

    const nova = await ctx.enviar(A, conversaAB, "quarta");
    await aguardarAte(() => ultimoValor(emB1 ?? [], conversaAB) === 4 && ultimoValor(emB2 ?? [], conversaAB) === 4);

    assert.equal((await ler(B, conversaAB, nova.id)).statusCode, 200);
    await aguardarAte(() => ultimoValor(emB1 ?? [], conversaAB) === 0 && ultimoValor(emB2 ?? [], conversaAB) === 0);
    assert.equal(await naoLidas(B, conversaAB), 0);

    // Leitura repetida não muda nada: sem novo evento.
    const antes = emB1?.length;
    assert.equal((await ler(B, conversaAB, nova.id)).statusCode, 200);
    await esperar(250);
    assert.equal(emB1?.length, antes);
    assert.deepEqual(emA, [], "remetente não recebe contagem por enviar");
    assert.deepEqual(emC, [], "terceiro não recebe nada de A↔B");
    for (const s of [b1, b2, a1, c1]) s.disconnect();
  });

  it("edição não incrementa nem emite; exclusão para todos e para mim reconciliam a contagem", async () => {
    const b1 = await ctx.conectar(B);
    const eventos = coletar<EventoConversaNaoLidas>(b1, EVENTO_CONVERSA_NAO_LIDAS);
    const m1 = await ctx.enviar(A, conversaAB, "n1");
    const m2 = await ctx.enviar(A, conversaAB, "n2");
    const m3 = await ctx.enviar(A, conversaAB, "n3");
    await aguardarAte(() => ultimoValor(eventos, conversaAB) === 3);
    const quantidade = eventos.length;

    assert.equal((await ctx.api(A, "PATCH", `/conversas/${conversaAB}/mensagens/${m1.id}`, { conteudo: "n1 editada" })).statusCode, 200);
    await esperar(250);
    assert.equal(eventos.length, quantidade, "edição não gera evento de contagem");
    assert.equal(await naoLidas(B, conversaAB), 3);

    assert.equal((await ctx.api(A, "DELETE", `/conversas/${conversaAB}/mensagens/${m2.id}?escopo=todos`)).statusCode, 200);
    await aguardarAte(() => ultimoValor(eventos, conversaAB) === 2);
    assert.equal(await naoLidas(B, conversaAB), 2);

    assert.equal((await ctx.api(B, "DELETE", `/conversas/${conversaAB}/mensagens/${m3.id}?escopo=mim`)).statusCode, 200);
    await aguardarAte(() => ultimoValor(eventos, conversaAB) === 1);
    assert.equal(await naoLidas(B, conversaAB), 1);

    assert.equal((await ler(B, conversaAB, m3.id)).statusCode, 200, "marcador pode apontar para mensagem oculta");
    await aguardarAte(() => ultimoValor(eventos, conversaAB) === 0);
    b1.disconnect();
  });

  it("envios simultâneos: o último valor emitido é a contagem real", async () => {
    const b1 = await ctx.conectar(B);
    const eventos = coletar<EventoConversaNaoLidas>(b1, EVENTO_CONVERSA_NAO_LIDAS);
    await Promise.all(Array.from({ length: 12 }, (_, i) => ctx.enviar(A, conversaAB, `simultânea ${i}`)));
    await aguardarAte(() => ultimoValor(eventos, conversaAB) === 12);
    await esperar(300);
    assert.equal(ultimoValor(eventos, conversaAB), 12);
    assert.ok(eventos.length <= 12, `coalescência: ${eventos.length} eventos para 12 mensagens`);
    assert.equal(await naoLidas(B, conversaAB), 12);
    b1.disconnect();
  });

  it("contagem limitada: acima do limite a lista devolve o próprio limite", async () => {
    let ultima: Mensagem | undefined;
    for (let i = 0; i < LIMITE_CONTAGEM_NAO_LIDAS + 5; i++) ultima = await ctx.enviar(C, conversaBC, `muitas ${i}`);
    assert.equal(await naoLidas(B, conversaBC), LIMITE_CONTAGEM_NAO_LIDAS);
    assert.equal((await ler(B, conversaBC, (ultima as Mensagem).id)).statusCode, 200);
    assert.equal(await naoLidas(B, conversaBC), 0);
  });

  it("C não manipula a leitura de A↔B nem enxerga a contagem dela", async () => {
    const m = await ctx.enviar(A, conversaAB, "para B");
    const antes = await naoLidas(B, conversaAB);
    const tentativa = await ler(C, conversaAB, m.id);
    assert.equal(tentativa.statusCode, 404);
    assert.equal((await ctx.lista(C)).conversas.some((c) => c.id === conversaAB), false);
    assert.equal(await naoLidas(B, conversaAB), antes);
  });
});
