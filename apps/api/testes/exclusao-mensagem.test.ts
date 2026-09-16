import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { mensagens, mensagensExcluidasParaIdentidade } from "@jaa/banco/schema";
import {
  EVENTO_MENSAGEM_ATUALIZADA,
  EVENTO_MENSAGEM_EXCLUIDA_PARA_MIM,
  EVENTO_MENSAGEM_NOVA,
  type EventoMensagemAtualizada,
  type EventoMensagemExcluidaParaMim,
  type Mensagem,
} from "@jaa/contratos";
import { eq } from "drizzle-orm";
import { aguardarAte, coletar, criarAmbienteIntegracao, esperar, type Pessoa } from "./apoio/integracao.js";

/*
 * Integração REAL de "excluir para mim" e "excluir para todos" (HTTP + PostgreSQL + Socket.IO).
 */

const ctx = criarAmbienteIntegracao({
  telefones: ["+5531987650801", "+5531987650802", "+5531987650803"],
  prefixoIp: "198.18.4.",
});

let A: Pessoa;
let B: Pessoa;
let C: Pessoa;
let conversaAB = "";
let conversaBC = "";

const excluir = (pessoa: Pessoa, conversaId: string, mensagemId: string, escopo: string) =>
  ctx.api(pessoa, "DELETE", `/conversas/${conversaId}/mensagens/${mensagemId}?escopo=${escopo}`);

before(async () => {
  await ctx.iniciar();
  A = await ctx.criarPessoa(0, "exc_a", "Ana Exc");
  B = await ctx.criarPessoa(1, "exc_b", "Mateus Exc");
  C = await ctx.criarPessoa(2, "exc_c", "Carla Exc");
  conversaAB = await ctx.abrirConversa(A, "exc_b");
  conversaBC = await ctx.abrirConversa(C, "exc_b");
});

after(() => ctx.encerrar());

describe("excluir para mim", () => {
  it("só quem excluiu deixa de ver (histórico, reload); outros continuam vendo; linha global intacta; outras abas avisadas", async () => {
    const [a2, b1] = await Promise.all([ctx.conectar(A), ctx.conectar(B)]);
    const ocultasA2 = coletar<EventoMensagemExcluidaParaMim>(a2, EVENTO_MENSAGEM_EXCLUIDA_PARA_MIM);
    const eventosB = [coletar<unknown>(b1, EVENTO_MENSAGEM_EXCLUIDA_PARA_MIM), coletar<unknown>(b1, EVENTO_MENSAGEM_ATUALIZADA)];

    const antes = await ctx.enviar(B, conversaAB, "Antes");
    const alvo = await ctx.enviar(A, conversaAB, "Some só para A");
    const resposta = await excluir(A, conversaAB, alvo.id, "mim");
    assert.equal(resposta.statusCode, 200, resposta.body);
    assert.equal(resposta.json().mensagemId, alvo.id);
    assert.equal(resposta.json().ultimaMensagem.id, antes.id, "nova última mensagem visível para A");

    await aguardarAte(() => ocultasA2.length === 1);
    assert.deepEqual(ocultasA2[0], resposta.json());
    for (let i = 0; i < 2; i++) assert.equal((await excluir(A, conversaAB, alvo.id, "mim")).statusCode, 200, "idempotente");
    await esperar(200);
    assert.equal(ocultasA2.length, 1, "repetir não reemite");
    assert.deepEqual(eventosB.map((e) => e.length), [0, 0], "B não é avisado");

    assert.equal((await ctx.historico(A, conversaAB)).mensagens.some((m) => m.id === alvo.id), false);
    const deB = (await ctx.historico(B, conversaAB)).mensagens.find((m) => m.id === alvo.id);
    assert.equal(deB?.conteudo, "Some só para A");
    assert.equal(deB?.excluidaEm, null);
    const [linha] = await ctx.banco.select().from(mensagens).where(eq(mensagens.id, alvo.id));
    assert.equal(linha?.conteudo, "Some só para A");

    // Lista: para A a última é a anterior; para B continua a excluída-para-A.
    assert.equal((await ctx.lista(A)).conversas.find((c) => c.id === conversaAB)?.ultimaMensagem.id, antes.id);
    assert.equal((await ctx.lista(B)).conversas.find((c) => c.id === conversaAB)?.ultimaMensagem.id, alvo.id);
    a2.disconnect();
    b1.disconnect();
  });

  it("excluída para mim não pode ser editada nem respondida por quem a excluiu; edição do autor não chega a quem ocultou", async () => {
    const deB = await ctx.enviar(B, conversaAB, "B vai editar depois");
    assert.equal((await excluir(A, conversaAB, deB.id, "mim")).statusCode, 200);
    const a1 = await ctx.conectar(A);
    const atualizadasA = coletar<EventoMensagemAtualizada>(a1, EVENTO_MENSAGEM_ATUALIZADA);

    const resposta = await ctx.api(A, "POST", `/conversas/${conversaAB}/mensagens`, { idCliente: randomUUID(), conteudo: "citando", mensagemRespondidaId: deB.id });
    assert.equal(resposta.statusCode, 404);
    assert.equal(resposta.json().codigo, "MENSAGEM_RESPONDIDA_NAO_ENCONTRADA");
    assert.equal((await ctx.api(B, "PATCH", `/conversas/${conversaAB}/mensagens/${deB.id}`, { conteudo: "B editou" })).statusCode, 200);
    await esperar(300);
    assert.equal(atualizadasA.length, 0, "quem excluiu para si não recebe a edição");
    a1.disconnect();
  });

  it("paginação continua sem buracos nem repetições com mensagens ocultas no meio", async () => {
    const enviadas: Mensagem[] = [];
    for (let i = 0; i < 12; i++) enviadas.push(await ctx.enviar(i % 2 ? A : B, conversaAB, `pag ${i}`));
    const ocultas = enviadas.filter((_, i) => i % 3 === 0);
    for (const m of ocultas) assert.equal((await excluir(A, conversaAB, m.id, "mim")).statusCode, 200);

    const coletadas: string[] = [];
    let cursor: string | null = null;
    do {
      const pagina = await ctx.historico(A, conversaAB, `limite=4${cursor ? `&antesDe=${cursor}` : ""}`);
      assert.ok(pagina.mensagens.length <= 4);
      coletadas.unshift(...pagina.mensagens.map((m) => m.id));
      cursor = pagina.proximoCursor;
    } while (cursor);
    assert.equal(new Set(coletadas).size, coletadas.length);
    assert.deepEqual(coletadas, [...coletadas].sort());
    for (const m of enviadas) assert.equal(coletadas.includes(m.id), !ocultas.includes(m));
  });
});

describe("excluir para todos", () => {
  it("autor exclui: tombstone sem conteúdo em resposta, realtime, histórico e banco; linha e estado preservados", async () => {
    const [b1, a2] = await Promise.all([ctx.conectar(B), ctx.conectar(A)]);
    const atualizadasB = coletar<EventoMensagemAtualizada>(b1, EVENTO_MENSAGEM_ATUALIZADA);
    const atualizadasA2 = coletar<EventoMensagemAtualizada>(a2, EVENTO_MENSAGEM_ATUALIZADA);
    const novasB = coletar<unknown>(b1, EVENTO_MENSAGEM_NOVA);

    const pergunta = await ctx.enviar(B, conversaAB, "Pergunta de B");
    const segredo = await ctx.enviar(A, conversaAB, "Conteúdo que será apagado", { mensagemRespondidaId: pergunta.id });
    await ctx.api(A, "PATCH", `/conversas/${conversaAB}/mensagens/${segredo.id}`, { conteudo: "Conteúdo que será apagado (editado)" });
    await ctx.api(B, "POST", "/mensagens/recebimentos", { mensagemIds: [segredo.id] });
    await aguardarAte(() => novasB.length === 2);

    const resposta = await excluir(A, conversaAB, segredo.id, "todos");
    assert.equal(resposta.statusCode, 200, resposta.body);
    const tombstone: Mensagem = resposta.json();
    assert.equal(tombstone.id, segredo.id);
    assert.equal(tombstone.criadoEm, segredo.criadoEm);
    assert.equal(tombstone.conteudo, "");
    assert.equal(tombstone.mensagemRespondida, null);
    assert.equal(tombstone.editadaEm, null);
    assert.ok(tombstone.excluidaEm);
    assert.equal(tombstone.estado, "entregue", "estado não regride");

    await aguardarAte(() => atualizadasB.length === 2 && atualizadasA2.length === 2);
    assert.deepEqual(atualizadasB.at(-1)?.mensagem, tombstone);
    assert.deepEqual(atualizadasA2.at(-1)?.mensagem, tombstone);
    await esperar(200);
    assert.equal(novasB.length, 2, "exclusão não é mensagem:nova");

    for (const pessoa of [A, B]) {
      const pagina = await ctx.historico(pessoa, conversaAB);
      assert.deepEqual(pagina.mensagens.find((m) => m.id === segredo.id), tombstone);
      assert.ok(!JSON.stringify(pagina).includes("será apagado"));
      assert.ok(!JSON.stringify(await ctx.lista(pessoa)).includes("será apagado"));
    }
    const [linha] = await ctx.banco.select().from(mensagens).where(eq(mensagens.id, segredo.id));
    assert.equal(linha?.conteudo, "", "conteúdo apagado no banco");
    assert.ok(linha?.excluidaParaTodosEm);

    const repetida = await excluir(A, conversaAB, segredo.id, "todos");
    assert.equal(repetida.statusCode, 200);
    assert.deepEqual(repetida.json(), tombstone);
    await esperar(200);
    assert.equal(atualizadasB.length, 2, "repetir não reemite");
    b1.disconnect();
    a2.disconnect();
  });

  it("respostas que citam a excluída continuam válidas, mostram 'excluída' e não vazam conteúdo; não dá para responder, editar ou reenviar para mudá-la", async () => {
    const original = await ctx.enviar(B, conversaAB, "Texto sensível original");
    const resposta = await ctx.enviar(A, conversaAB, "Respondendo", { mensagemRespondidaId: original.id });
    const b1 = await ctx.conectar(B);
    const novas = coletar<unknown>(b1, EVENTO_MENSAGEM_NOVA);
    assert.equal((await excluir(B, conversaAB, original.id, "todos")).statusCode, 200);

    for (const pessoa of [A, B]) {
      const citando = (await ctx.historico(pessoa, conversaAB)).mensagens.find((m) => m.id === resposta.id);
      assert.deepEqual(citando?.mensagemRespondida, {
        id: original.id,
        remetente: { identidadeId: B.identidadeId, nomeExibicao: "Mateus Exc" },
        tipo: "texto",
        previaConteudo: "",
        conteudoTruncado: false,
        excluida: true,
      });
    }
    const [linhaResposta] = await ctx.banco.select().from(mensagens).where(eq(mensagens.id, resposta.id));
    assert.equal(linhaResposta?.mensagemRespondidaId, original.id, "referência estrutural preservada");

    const nova = await ctx.api(A, "POST", `/conversas/${conversaAB}/mensagens`, { idCliente: randomUUID(), conteudo: "cito excluída", mensagemRespondidaId: original.id });
    assert.equal(nova.statusCode, 404);
    assert.ok(!nova.body.includes("sensível"));
    const edicao = await ctx.api(B, "PATCH", `/conversas/${conversaAB}/mensagens/${original.id}`, { conteudo: "ressuscitar" });
    assert.equal(edicao.statusCode, 409);
    assert.equal(edicao.json().codigo, "MENSAGEM_EXCLUIDA");
    await esperar(200);
    assert.equal(novas.length, 0);
    b1.disconnect();
  });

  it("retry do envio de uma mensagem já excluída para todos devolve o tombstone, sem recriar", async () => {
    const idCliente = randomUUID();
    const criada = await ctx.api(A, "POST", `/conversas/${conversaAB}/mensagens`, { idCliente, conteudo: "vai sumir" });
    assert.equal((await excluir(A, conversaAB, criada.json().id, "todos")).statusCode, 200);
    const retry = await ctx.api(A, "POST", `/conversas/${conversaAB}/mensagens`, { idCliente, conteudo: "vai sumir" });
    assert.equal(retry.statusCode, 200);
    assert.equal(retry.json().id, criada.json().id);
    assert.equal(retry.json().conteudo, "");
    assert.ok(retry.json().excluidaEm);
  });

  it("última mensagem excluída para todos aparece como tombstone na lista; excluir para mim um tombstone o esconde", async () => {
    const anterior = await ctx.enviar(B, conversaAB, "Anterior visível");
    const ultima = await ctx.enviar(A, conversaAB, "Última que será apagada");
    assert.equal((await excluir(A, conversaAB, ultima.id, "todos")).statusCode, 200);
    for (const pessoa of [A, B]) {
      const item = (await ctx.lista(pessoa)).conversas.find((c) => c.id === conversaAB);
      assert.equal(item?.ultimaMensagem.id, ultima.id);
      assert.equal(item?.ultimaMensagem.conteudo, "");
      assert.ok(item?.ultimaMensagem.excluidaEm);
    }
    const oculta = await excluir(B, conversaAB, ultima.id, "mim");
    assert.equal(oculta.statusCode, 200);
    assert.equal(oculta.json().ultimaMensagem.id, anterior.id);
    assert.equal((await ctx.lista(B)).conversas.find((c) => c.id === conversaAB)?.ultimaMensagem.id, anterior.id);
  });
});

describe("autorização da exclusão", () => {
  it("destinatário não exclui para todos; C não exclui nem descobre A↔B; escopo inválido; sem sessão", async () => {
    const [a1, b1] = await Promise.all([ctx.conectar(A), ctx.conectar(B)]);
    const eventos = [
      coletar<unknown>(a1, EVENTO_MENSAGEM_ATUALIZADA),
      coletar<unknown>(b1, EVENTO_MENSAGEM_ATUALIZADA),
      coletar<unknown>(a1, EVENTO_MENSAGEM_EXCLUIDA_PARA_MIM),
      coletar<unknown>(b1, EVENTO_MENSAGEM_EXCLUIDA_PARA_MIM),
    ];
    const deA = await ctx.enviar(A, conversaAB, "Privada de A↔B");

    const porB = await excluir(B, conversaAB, deA.id, "todos");
    assert.equal(porB.statusCode, 403);
    assert.equal(porB.json().codigo, "MENSAGEM_DE_OUTRA_IDENTIDADE");

    for (const escopo of ["mim", "todos"]) {
      const naAlheia = await excluir(C, conversaAB, deA.id, escopo);
      assert.equal(naAlheia.statusCode, 404);
      assert.equal(naAlheia.json().codigo, "CONVERSA_NAO_ENCONTRADA");
      const cruzada = await excluir(C, conversaBC, deA.id, escopo);
      assert.equal(cruzada.statusCode, 404);
      assert.equal(cruzada.json().codigo, "MENSAGEM_NAO_ENCONTRADA");
      assert.ok(![naAlheia.body, cruzada.body].some((corpo) => corpo.includes("Privada")));
    }
    assert.equal((await excluir(A, conversaAB, randomUUID(), "todos")).statusCode, 404);
    for (const escopo of ["", "geral", "TODOS"]) assert.equal((await excluir(A, conversaAB, deA.id, escopo)).statusCode, 400);
    assert.equal((await ctx.api(A, "DELETE", `/conversas/${conversaAB}/mensagens/${deA.id}`)).statusCode, 400, "escopo obrigatório");
    assert.equal((await ctx.api(null, "DELETE", `/conversas/${conversaAB}/mensagens/${deA.id}?escopo=todos`)).statusCode, 401);

    const [linha] = await ctx.banco.select().from(mensagens).where(eq(mensagens.id, deA.id));
    assert.equal(linha?.conteudo, "Privada de A↔B");
    assert.equal(linha?.excluidaParaTodosEm, null);
    assert.equal((await ctx.banco.select().from(mensagensExcluidasParaIdentidade).where(eq(mensagensExcluidasParaIdentidade.mensagemId, deA.id))).length, 0);
    await esperar(200);
    assert.deepEqual(eventos.map((e) => e.length), [0, 0, 0, 0]);
    a1.disconnect();
    b1.disconnect();
  });

  it("C não recupera conteúdo excluído nem via referência em conversa própria", async () => {
    const segredo = await ctx.enviar(A, conversaAB, "Segredo apagado de A↔B");
    assert.equal((await excluir(A, conversaAB, segredo.id, "todos")).statusCode, 200);
    const tentativa = await ctx.api(C, "POST", `/conversas/${conversaBC}/mensagens`, { idCliente: randomUUID(), conteudo: "cita", mensagemRespondidaId: segredo.id });
    assert.equal(tentativa.statusCode, 404);
    assert.equal((await ctx.api(C, "GET", `/conversas/${conversaAB}/mensagens`)).statusCode, 404);
    assert.ok(!JSON.stringify(await ctx.historico(C, conversaBC)).includes("Segredo"));
  });
});
