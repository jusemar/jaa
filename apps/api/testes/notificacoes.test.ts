import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { EVENTO_NOTIFICACAO_NOVA_MENSAGEM, PREVIA_MENSAGEM_RESPONDIDA_TAMANHO_MAXIMO, type EventoNotificacaoNovaMensagem } from "@jaa/contratos";
import { aguardarAte, coletar, criarAmbienteIntegracao, esperar, type Pessoa } from "./apoio/integracao.js";

/*
 * Integração REAL do domínio de notificações de novas mensagens (entrega in-app via realtime).
 */

const ctx = criarAmbienteIntegracao({
  telefones: ["+5531987651101", "+5531987651102", "+5531987651103"],
  prefixoIp: "198.18.6.",
});

let A: Pessoa;
let B: Pessoa;
let C: Pessoa;
let conversaAB = "";

before(async () => {
  await ctx.iniciar();
  A = await ctx.criarPessoa(0, "not_a", "Ana Not");
  B = await ctx.criarPessoa(1, "not_b", "Mateus Not");
  C = await ctx.criarPessoa(2, "not_c", "Carla Not");
  conversaAB = await ctx.abrirConversa(A, "not_b");
});

after(() => ctx.encerrar());

describe("notificação de nova mensagem", () => {
  it("destinatário (todas as conexões) recebe uma notificação com dados públicos; remetente e terceiros não", async () => {
    const [b1, b2, a1, a2, c1] = await Promise.all([ctx.conectar(B), ctx.conectar(B), ctx.conectar(A), ctx.conectar(A), ctx.conectar(C)]);
    const [emB1, emB2, emA1, emA2, emC] = [b1, b2, a1, a2, c1].map((s) => coletar<EventoNotificacaoNovaMensagem>(s, EVENTO_NOTIFICACAO_NOVA_MENSAGEM));

    const mensagem = await ctx.enviar(A, conversaAB, "Chegou a encomenda?");
    await aguardarAte(() => emB1?.length === 1 && emB2?.length === 1);
    const esperado: EventoNotificacaoNovaMensagem = {
      conversaId: conversaAB,
      mensagemId: mensagem.id,
      remetente: { identidadeId: A.identidadeId, tipo: "pessoal", nomeExibicao: "Ana Not", nomeUsuario: "not_a" },
      previaConteudo: "Chegou a encomenda?",
      conteudoTruncado: false,
      criadoEm: mensagem.criadoEm,
    };
    assert.deepEqual(emB1?.[0], esperado);
    assert.deepEqual(emB2?.[0], esperado);
    assert.deepEqual(Object.keys(emB1?.[0]?.remetente ?? {}).sort(), ["identidadeId", "nomeExibicao", "nomeUsuario", "tipo"]);
    await esperar(250);
    assert.deepEqual([emA1?.length, emA2?.length, emC?.length], [0, 0, 0]);
    for (const s of [b1, b2, a1, a2, c1]) s.disconnect();
  });

  it("retry com o mesmo idCliente não duplica; edição, exclusão e leitura não notificam", async () => {
    const b1 = await ctx.conectar(B);
    const notificacoes = coletar<EventoNotificacaoNovaMensagem>(b1, EVENTO_NOTIFICACAO_NOVA_MENSAGEM);
    const idCliente = randomUUID();
    const corpo = { idCliente, conteudo: "uma vez só" };
    const primeira = await ctx.api(A, "POST", `/conversas/${conversaAB}/mensagens`, corpo);
    await Promise.all(Array.from({ length: 5 }, () => ctx.api(A, "POST", `/conversas/${conversaAB}/mensagens`, corpo)));
    await aguardarAte(() => notificacoes.length === 1);

    const id = primeira.json().id;
    assert.equal((await ctx.api(A, "PATCH", `/conversas/${conversaAB}/mensagens/${id}`, { conteudo: "editada" })).statusCode, 200);
    assert.equal((await ctx.api(B, "POST", `/conversas/${conversaAB}/leitura`, { ateMensagemId: id })).statusCode, 200);
    assert.equal((await ctx.api(A, "DELETE", `/conversas/${conversaAB}/mensagens/${id}?escopo=todos`)).statusCode, 200);
    await esperar(300);
    assert.equal(notificacoes.length, 1);
    assert.equal(notificacoes[0]?.mensagemId, id);
    b1.disconnect();
  });

  it("resposta também notifica; conteúdo longo chega como prévia limitada", async () => {
    const b1 = await ctx.conectar(B);
    const notificacoes = coletar<EventoNotificacaoNovaMensagem>(b1, EVENTO_NOTIFICACAO_NOVA_MENSAGEM);
    const deB = await ctx.enviar(B, conversaAB, "pergunta de B");
    const longa = await ctx.enviar(A, conversaAB, "é".repeat(4000), { mensagemRespondidaId: deB.id });
    await aguardarAte(() => notificacoes.length === 1);
    assert.equal(notificacoes[0]?.mensagemId, longa.id, "B não é notificado da própria mensagem");
    assert.equal([...(notificacoes[0]?.previaConteudo ?? "")].length, PREVIA_MENSAGEM_RESPONDIDA_TAMANHO_MAXIMO);
    assert.equal(notificacoes[0]?.conteudoTruncado, true);
    b1.disconnect();
  });

  it("destinatário offline não perde o estado: ao voltar, lista e não lidas refletem a mensagem", async () => {
    const offline = await ctx.enviar(A, conversaAB, "enquanto B estava offline");
    const item = (await ctx.lista(B)).conversas.find((c) => c.id === conversaAB);
    assert.equal(item?.ultimaMensagem.id, offline.id);
    assert.ok((item?.naoLidas ?? 0) >= 1);
  });
});
