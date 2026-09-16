import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { mensagens } from "@jaa/banco/schema";
import {
  EVENTO_MENSAGEM_ATUALIZADA,
  EVENTO_MENSAGEM_NOVA,
  type EventoMensagemAtualizada,
  type EventoMensagemNova,
  type Mensagem,
} from "@jaa/contratos";
import { eq } from "drizzle-orm";
import { aguardarAte, coletar, criarAmbienteIntegracao, esperar, type Pessoa } from "./apoio/integracao.js";

/*
 * Integração REAL da edição de mensagens (HTTP + PostgreSQL + Socket.IO).
 */

const ctx = criarAmbienteIntegracao({
  telefones: ["+5531987650701", "+5531987650702", "+5531987650703"],
  prefixoIp: "198.18.3.",
});

let A: Pessoa;
let B: Pessoa;
let C: Pessoa;
let conversaAB = "";
let conversaBC = "";

const editar = (pessoa: Pessoa, conversaId: string, mensagemId: string, corpo: unknown) =>
  ctx.api(pessoa, "PATCH", `/conversas/${conversaId}/mensagens/${mensagemId}`, corpo);

before(async () => {
  await ctx.iniciar();
  A = await ctx.criarPessoa(0, "edit_a", "Ana Edit");
  B = await ctx.criarPessoa(1, "edit_b", "Mateus Edit");
  C = await ctx.criarPessoa(2, "edit_c", "Carla Edit");
  conversaAB = await ctx.abrirConversa(A, "edit_b");
  conversaBC = await ctx.abrirConversa(C, "edit_b");
});

after(() => ctx.encerrar());

describe("editar mensagem", () => {
  it("autor edita: mesmo id, criadoEm, remetente e referência; editadaEm registrado; B e outras abas de A veem em realtime", async () => {
    const [b1, a2] = await Promise.all([ctx.conectar(B), ctx.conectar(A)]);
    const atualizadasB = coletar<EventoMensagemAtualizada>(b1, EVENTO_MENSAGEM_ATUALIZADA);
    const atualizadasA2 = coletar<EventoMensagemAtualizada>(a2, EVENTO_MENSAGEM_ATUALIZADA);
    const novasB = coletar<EventoMensagemNova>(b1, EVENTO_MENSAGEM_NOVA);

    const pergunta = await ctx.enviar(B, conversaAB, "Vai trabalhar amanhã?");
    const original = await ctx.enviar(A, conversaAB, "Sim, pela manha", { mensagemRespondidaId: pergunta.id });
    await aguardarAte(() => novasB.length === 2);

    const resposta = await editar(A, conversaAB, original.id, { conteudo: "  Sim, pela manhã.  " });
    assert.equal(resposta.statusCode, 200, resposta.body);
    const editada: Mensagem = resposta.json();
    assert.equal(editada.id, original.id);
    assert.equal(editada.criadoEm, original.criadoEm);
    assert.equal(editada.remetenteIdentidadeId, A.identidadeId);
    assert.equal(editada.conteudo, "Sim, pela manhã.");
    assert.deepEqual(editada.mensagemRespondida, original.mensagemRespondida);
    assert.ok(editada.editadaEm && editada.editadaEm >= editada.criadoEm);
    assert.equal(original.editadaEm, null);

    await aguardarAte(() => atualizadasB.length === 1 && atualizadasA2.length === 1);
    assert.deepEqual(atualizadasB[0]?.mensagem, editada);
    assert.deepEqual(atualizadasA2[0]?.mensagem, editada);
    await esperar(200);
    assert.equal(novasB.length, 2, "edição não é mensagem:nova");

    const linhas = await ctx.banco.select().from(mensagens).where(eq(mensagens.conversaId, conversaAB));
    assert.equal(linhas.filter((m) => m.conteudo.startsWith("Sim, pela")).length, 1, "nenhuma mensagem nova criada");
    b1.disconnect();
    a2.disconnect();
  });

  it("reload mantém; ordem e lista não mudam como se fosse nova; estado não regride", async () => {
    const antiga = await ctx.enviar(A, conversaAB, "Primeira versão");
    const depois = await ctx.enviar(B, conversaAB, "Mensagem posterior de B");
    assert.equal((await ctx.api(A, "POST", "/mensagens/recebimentos", { mensagemIds: [depois.id] })).statusCode, 200);
    assert.equal((await ctx.api(B, "POST", `/conversas/${conversaAB}/leitura`, { ateMensagemId: antiga.id })).statusCode, 200);
    const listaAntes = await ctx.lista(A);

    const editada: Mensagem = (await editar(A, conversaAB, antiga.id, { conteudo: "Segunda versão" })).json();
    assert.equal(editada.estado, "lida", "edição preserva o estado");

    for (const pessoa of [A, B]) {
      const pagina = await ctx.historico(pessoa, conversaAB);
      const ids = pagina.mensagens.map((m) => m.id);
      assert.equal(ids.at(-1), depois.id, "a editada não vai para o fim");
      const recarregada = pagina.mensagens.find((m) => m.id === antiga.id);
      assert.equal(recarregada?.conteudo, "Segunda versão");
      assert.equal(recarregada?.editadaEm, editada.editadaEm);
      assert.equal(recarregada?.estado, "lida");
    }
    const listaDepois = await ctx.lista(A);
    assert.deepEqual(listaDepois.conversas.map((c) => [c.id, c.ultimaMensagem.id]), listaAntes.conversas.map((c) => [c.id, c.ultimaMensagem.id]));
  });

  it("resposta que cita a mensagem editada passa a mostrar o conteúdo atual (sem cópia)", async () => {
    const citada = await ctx.enviar(B, conversaAB, "Encontro às 9h");
    const resposta = await ctx.enviar(A, conversaAB, "Combinado", { mensagemRespondidaId: citada.id });
    assert.equal(resposta.mensagemRespondida?.previaConteudo, "Encontro às 9h");
    assert.equal((await editar(B, conversaAB, citada.id, { conteudo: "Encontro às 10h" })).statusCode, 200);
    const pagina = await ctx.historico(A, conversaAB);
    assert.equal(pagina.mensagens.find((m) => m.id === resposta.id)?.mensagemRespondida?.previaConteudo, "Encontro às 10h");
  });

  it("mesmo conteúdo é no-op idempotente: não altera editadaEm nem emite evento", async () => {
    const b1 = await ctx.conectar(B);
    const atualizadas = coletar<EventoMensagemAtualizada>(b1, EVENTO_MENSAGEM_ATUALIZADA);
    const mensagem = await ctx.enviar(A, conversaAB, "Texto fixo");
    const primeira: Mensagem = (await editar(A, conversaAB, mensagem.id, { conteudo: "Texto novo" })).json();
    for (let i = 0; i < 3; i++) {
      const repetida = await editar(A, conversaAB, mensagem.id, { conteudo: "Texto novo" });
      assert.equal(repetida.statusCode, 200);
      assert.equal(repetida.json().editadaEm, primeira.editadaEm);
    }
    await aguardarAte(() => atualizadas.length >= 1);
    await esperar(200);
    assert.equal(atualizadas.length, 1);
    b1.disconnect();
  });

  it("retry do envio original depois da edição devolve a mensagem atual, sem duplicar nem reemitir", async () => {
    const b1 = await ctx.conectar(B);
    const novas = coletar<EventoMensagemNova>(b1, EVENTO_MENSAGEM_NOVA);
    const idCliente = randomUUID();
    const criada = await ctx.api(A, "POST", `/conversas/${conversaAB}/mensagens`, { idCliente, conteudo: "versao 1" });
    assert.equal((await editar(A, conversaAB, criada.json().id, { conteudo: "versão 2" })).statusCode, 200);

    const retry = await ctx.api(A, "POST", `/conversas/${conversaAB}/mensagens`, { idCliente, conteudo: "versao 1" });
    assert.equal(retry.statusCode, 200);
    assert.equal(retry.json().id, criada.json().id);
    assert.equal(retry.json().conteudo, "versão 2");
    await esperar(200);
    assert.equal(novas.filter((e) => e.mensagem.id === criada.json().id).length, 1);
    b1.disconnect();
  });

  it("conteúdo inválido é recusado e não altera a mensagem", async () => {
    const mensagem = await ctx.enviar(A, conversaAB, "Válida");
    for (const corpo of [{ conteudo: "" }, { conteudo: "   " }, { conteudo: "x".repeat(4001) }, {}, { conteudo: 42 }]) {
      const resposta = await editar(A, conversaAB, mensagem.id, corpo);
      assert.equal(resposta.statusCode, 400, JSON.stringify(corpo).slice(0, 30));
      assert.equal(resposta.json().codigo, "DADOS_INVALIDOS");
    }
    assert.equal((await editar(A, conversaAB, "nao-e-uuid", { conteudo: "x" })).statusCode, 400);
    const [linha] = await ctx.banco.select().from(mensagens).where(eq(mensagens.id, mensagem.id));
    assert.equal(linha?.conteudo, "Válida");
    assert.equal(linha?.editadaEm, null);
  });
});

describe("autorização da edição", () => {
  it("B não edita mensagem de A (403); C não edita nem descobre A↔B (404); spoof de remetente ignorado", async () => {
    const b1 = await ctx.conectar(B);
    const atualizadas = coletar<EventoMensagemAtualizada>(b1, EVENTO_MENSAGEM_ATUALIZADA);
    const deA = await ctx.enviar(A, conversaAB, "Só A pode mudar");

    const porB = await editar(B, conversaAB, deA.id, { conteudo: "B mudou", remetenteIdentidadeId: A.identidadeId });
    assert.equal(porB.statusCode, 403);
    assert.equal(porB.json().codigo, "MENSAGEM_DE_OUTRA_IDENTIDADE");

    const porC = await editar(C, conversaAB, deA.id, { conteudo: "C mudou" });
    assert.equal(porC.statusCode, 404);
    assert.equal(porC.json().codigo, "CONVERSA_NAO_ENCONTRADA");

    // C na própria conversa (B↔C) usando id de A↔B; inexistente; A em conversa alheia.
    const cruzada = await editar(C, conversaBC, deA.id, { conteudo: "cruzada" });
    assert.equal(cruzada.statusCode, 404);
    assert.equal(cruzada.json().codigo, "MENSAGEM_NAO_ENCONTRADA");
    assert.equal((await editar(A, conversaAB, randomUUID(), { conteudo: "fantasma" })).statusCode, 404);
    assert.equal((await editar(A, conversaBC, deA.id, { conteudo: "fora" })).statusCode, 404);
    assert.equal((await ctx.api(null, "PATCH", `/conversas/${conversaAB}/mensagens/${deA.id}`, { conteudo: "anônimo" })).statusCode, 401);
    for (const resposta of [porB, porC, cruzada]) assert.ok(!resposta.body.includes("Só A pode"), "conteúdo não vaza no erro");

    const [linha] = await ctx.banco.select().from(mensagens).where(eq(mensagens.id, deA.id));
    assert.equal(linha?.conteudo, "Só A pode mudar");
    assert.equal(linha?.editadaEm, null);
    await esperar(200);
    assert.equal(atualizadas.length, 0);
    b1.disconnect();
  });
});
