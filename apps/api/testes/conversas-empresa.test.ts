import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { mensagens, users } from "@jaa/banco/schema";
import {
  EVENTO_CONVERSA_NAO_LIDAS,
  EVENTO_CONVERSA_OBSERVAR,
  EVENTO_DIGITANDO_ATUALIZADO,
  EVENTO_DIGITANDO_INFORMAR,
  EVENTO_MENSAGEM_ATUALIZADA,
  EVENTO_MENSAGEM_NOVA,
  EVENTO_MENSAGENS_ENTREGUES,
  EVENTO_MENSAGENS_LIDAS,
  EVENTO_NOTIFICACAO_NOVA_MENSAGEM,
  type Empresa,
  type EventoConversaNaoLidas,
  type EventoMensagemNova,
  type EventoNotificacaoNovaMensagem,
  type Mensagem,
  type RespostaObservarConversa,
} from "@jaa/contratos";
import { eq } from "drizzle-orm";
import { aguardarAte, coletar, como, criarAmbienteIntegracao, esperar, type Pessoa } from "./apoio/integracao.js";

/*
 * Integração REAL Pessoa ↔ Empresa sobre o MESMO mensageiro por identidades.
 * A = proprietário da Pizzaria BH; B = cliente; C = terceiro (cliente possível, nunca operador).
 */

const PREFIXO = `cve${randomUUID().slice(0, 4)}`;
const ctx = criarAmbienteIntegracao({
  telefones: ["+5531987651401", "+5531987651402", "+5531987651403"],
  prefixoIp: "198.18.9.",
});

let A: Pessoa;
let B: Pessoa;
let C: Pessoa;
let pizzaria: Empresa;
let comoPizzaria: Pessoa;
let conversaBP = "";
let usuarioIdA = "";

const listar = async (pessoa: Pessoa) => (await ctx.api(pessoa, "GET", "/conversas?limite=50")).json().conversas as Array<{ id: string; outraIdentidade: { identidadeId: string; tipo: string; nomeExibicao: string }; naoLidas: number }>;

before(async () => {
  await ctx.iniciar();
  A = await ctx.criarPessoa(0, `${PREFIXO}_a`, "Junior Rocha");
  B = await ctx.criarPessoa(1, `${PREFIXO}_b`, "Bruna Cliente");
  C = await ctx.criarPessoa(2, `${PREFIXO}_c`, "Carlos Terceiro");
  const criada = await ctx.api(A, "POST", "/empresas", { nome: "Pizzaria BH", nomeUsuario: `${PREFIXO}_pizza`, slug: `${PREFIXO}-pizzaria` });
  assert.equal(criada.statusCode, 201, criada.body);
  pizzaria = criada.json();
  comoPizzaria = como(A, pizzaria.identidadeId);
  const [conta] = await ctx.banco.select({ id: users.id }).from(users).where(eq(users.phoneNumber, "+5531987651401"));
  usuarioIdA = conta?.id ?? "";
});

after(() => ctx.encerrar());

describe("conversa Pessoa ↔ Empresa", () => {
  it("B inicia com a Pizzaria pelo @usuario; a Pizzaria (operada por A) abrindo com B reutiliza a mesma conversa", async () => {
    const porB = await ctx.api(B, "POST", "/conversas/diretas", { nomeUsuario: `@${PREFIXO}_pizza` });
    assert.equal(porB.statusCode, 201, porB.body);
    conversaBP = porB.json().id;
    const tipos = (porB.json().participantes as Array<{ identidadeId: string; tipo: string }>).map((p) => [p.identidadeId, p.tipo] as const);
    assert.deepEqual(new Map(tipos), new Map([[B.identidadeId, "pessoal"], [pizzaria.identidadeId, "empresarial"]]));

    const pelaPizzaria = await ctx.api(comoPizzaria, "POST", "/conversas/diretas", { nomeUsuario: `${PREFIXO}_b` });
    assert.equal(pelaPizzaria.statusCode, 200);
    assert.equal(pelaPizzaria.json().id, conversaBP, "mesmo par canônico de identidades");
  });

  it("B envia; inbox da Pizzaria mostra B; inbox pessoal de A não mistura; B vê a empresa", async () => {
    const [pizzaSocket, pessoalASocket] = await Promise.all([ctx.conectar(comoPizzaria), ctx.conectar(A)]);
    const [naPizzaria, noPessoal] = [coletar<EventoMensagemNova>(pizzaSocket, EVENTO_MENSAGEM_NOVA), coletar<EventoMensagemNova>(pessoalASocket, EVENTO_MENSAGEM_NOVA)];
    const notificacoesPizzaria = coletar<EventoNotificacaoNovaMensagem>(pizzaSocket, EVENTO_NOTIFICACAO_NOVA_MENSAGEM);
    const naoLidasPizzaria = coletar<EventoConversaNaoLidas>(pizzaSocket, EVENTO_CONVERSA_NAO_LIDAS);

    const mensagem = await ctx.enviar(B, conversaBP, "Oi, vocês entregam hoje?");
    await aguardarAte(() => naPizzaria.length === 1 && notificacoesPizzaria.length === 1 && naoLidasPizzaria.at(-1)?.naoLidas === 1);
    await esperar(200);
    assert.equal(noPessoal.length, 0, "conexão pessoal de A não recebe mensagens da empresa");
    assert.equal(notificacoesPizzaria[0]?.remetente.identidadeId, B.identidadeId);

    const inboxPizzaria = await listar(comoPizzaria);
    assert.deepEqual(inboxPizzaria.map((c) => [c.id, c.outraIdentidade.identidadeId, c.outraIdentidade.tipo, c.naoLidas]), [[conversaBP, B.identidadeId, "pessoal", 1]]);
    assert.ok(!(await listar(A)).some((c) => c.id === conversaBP), "inbox pessoal isolada");
    const inboxB = await listar(B);
    assert.deepEqual(inboxB.find((c) => c.id === conversaBP)?.outraIdentidade, { identidadeId: pizzaria.identidadeId, tipo: "empresarial", nomeExibicao: "Pizzaria BH", nomeUsuario: `${PREFIXO}_pizza` });
    assert.equal((await ctx.historico(comoPizzaria, conversaBP)).mensagens.at(-1)?.id, mensagem.id);
    assert.equal((await ctx.api(A, "GET", `/conversas/${conversaBP}/mensagens`)).statusCode, 404, "A pessoal não lê a conversa da empresa");
    pizzaSocket.disconnect();
    pessoalASocket.disconnect();
  });

  it("A responde COMO Pizzaria: remetente é a empresa, nada revela A; auditoria interna guarda a conta", async () => {
    const socketB = await ctx.conectar(B);
    const recebidas = coletar<EventoMensagemNova>(socketB, EVENTO_MENSAGEM_NOVA);
    const notificacoesB = coletar<EventoNotificacaoNovaMensagem>(socketB, EVENTO_NOTIFICACAO_NOVA_MENSAGEM);
    const resposta = await ctx.enviar(comoPizzaria, conversaBP, "Entregamos sim! Até 23h.");
    assert.equal(resposta.remetenteIdentidadeId, pizzaria.identidadeId);
    await aguardarAte(() => recebidas.length === 1 && notificacoesB.length === 1);
    assert.deepEqual(recebidas[0]?.mensagem, resposta);
    assert.deepEqual(notificacoesB[0]?.remetente, { identidadeId: pizzaria.identidadeId, tipo: "empresarial", nomeExibicao: "Pizzaria BH", nomeUsuario: `${PREFIXO}_pizza` });

    const vistoPorB = JSON.stringify([recebidas, notificacoesB, await ctx.historico(B, conversaBP), await listar(B)]);
    for (const privado of [A.identidadeId, "Junior Rocha", `${PREFIXO}_a`, usuarioIdA, "operador", "+5531987651401"]) {
      assert.ok(!vistoPorB.includes(privado), `cliente não recebe: ${privado}`);
    }
    const [linha] = await ctx.banco.select().from(mensagens).where(eq(mensagens.id, resposta.id));
    assert.equal(linha?.operadorUsuarioId, usuarioIdA);
    socketB.disconnect();
  });

  it("estados, não lidas, responder, editar e excluir respeitam a identidade atuante", async () => {
    const [socketB, pizzaSocket] = await Promise.all([ctx.conectar(B), ctx.conectar(comoPizzaria)]);
    const [entregues, lidas, atualizadas] = [coletar<unknown>(socketB, EVENTO_MENSAGENS_ENTREGUES), coletar<unknown>(socketB, EVENTO_MENSAGENS_LIDAS), coletar<unknown>(socketB, EVENTO_MENSAGEM_ATUALIZADA)];
    const naoLidasPizzaria = coletar<EventoConversaNaoLidas>(pizzaSocket, EVENTO_CONVERSA_NAO_LIDAS);
    const pergunta = await ctx.enviar(B, conversaBP, "Tem pizza de calabresa?");

    // Empresa confirma recebimento e leitura (como Pizzaria) → B vê Entregue/Lida; não lidas da empresa zera.
    assert.equal((await ctx.api(comoPizzaria, "POST", "/mensagens/recebimentos", { mensagemIds: [pergunta.id] })).statusCode, 200);
    assert.equal((await ctx.api(comoPizzaria, "POST", `/conversas/${conversaBP}/leitura`, { ateMensagemId: pergunta.id })).statusCode, 200);
    await aguardarAte(() => entregues.length === 1 && lidas.length === 1 && naoLidasPizzaria.at(-1)?.naoLidas === 0);
    assert.equal((await ctx.historico(B, conversaBP)).mensagens.find((m) => m.id === pergunta.id)?.estado, "lida");
    // A pessoal não confirma pela empresa (não participa).
    assert.equal((await ctx.api(A, "POST", `/conversas/${conversaBP}/leitura`, { ateMensagemId: pergunta.id })).statusCode, 404);

    const respostaPizza: Mensagem = await ctx.enviar(comoPizzaria, conversaBP, "Tem sim", { mensagemRespondidaId: pergunta.id });
    assert.equal(respostaPizza.mensagemRespondida?.remetente.identidadeId, B.identidadeId);

    assert.equal((await ctx.api(A, "PATCH", `/conversas/${conversaBP}/mensagens/${respostaPizza.id}`, { conteudo: "A pessoal" })).statusCode, 404);
    assert.equal((await ctx.api(B, "PATCH", `/conversas/${conversaBP}/mensagens/${respostaPizza.id}`, { conteudo: "B edita" })).statusCode, 403);
    const editada = await ctx.api(comoPizzaria, "PATCH", `/conversas/${conversaBP}/mensagens/${respostaPizza.id}`, { conteudo: "Tem sim, R$ 39,90" });
    assert.equal(editada.statusCode, 200);
    await aguardarAte(() => atualizadas.length === 1);

    assert.equal((await ctx.api(B, "DELETE", `/conversas/${conversaBP}/mensagens/${respostaPizza.id}?escopo=todos`)).statusCode, 403);
    assert.equal((await ctx.api(comoPizzaria, "DELETE", `/conversas/${conversaBP}/mensagens/${respostaPizza.id}?escopo=todos`)).statusCode, 200);
    const [linha] = await ctx.banco.select().from(mensagens).where(eq(mensagens.id, respostaPizza.id));
    assert.deepEqual([linha?.editadaPorUsuarioId, linha?.excluidaPorUsuarioId, linha?.conteudo], [usuarioIdA, usuarioIdA, ""]);
    socketB.disconnect();
    pizzaSocket.disconnect();
  });

  it("presença e digitando da empresa: conexão de A COMO Pizzaria deixa a empresa online e digitando para B; conexão pessoal não", async () => {
    const socketB = await ctx.conectar(B);
    const pessoalA = await ctx.conectar(A);
    const observar = (socket: typeof socketB): Promise<RespostaObservarConversa> => socket.timeout(2000).emitWithAck(EVENTO_CONVERSA_OBSERVAR, { conversaId: conversaBP });
    // Espera a tolerância de offline das conexões da Pizzaria de testes anteriores: só a conexão PESSOAL de A segue aberta.
    let semOperador = await observar(socketB);
    for (let i = 0; i < 40 && semOperador.ok && semOperador.presencas[0]?.online; i++) {
      await esperar(250);
      semOperador = await observar(socketB);
    }
    assert.deepEqual(semOperador, { ok: true, presencas: [{ identidadeId: pizzaria.identidadeId, online: false }] }, "conexão pessoal de A não conta como empresa online");
    assert.deepEqual(await observar(pessoalA), { ok: false, codigo: "CONVERSA_NAO_ENCONTRADA" });

    const pizzaSocket = await ctx.conectar(comoPizzaria);
    assert.deepEqual(await observar(socketB), { ok: true, presencas: [{ identidadeId: pizzaria.identidadeId, online: true }] });
    assert.equal((await observar(pizzaSocket)).ok, true);
    const digitando = coletar<{ identidadeId: string; digitando: boolean }>(socketB, EVENTO_DIGITANDO_ATUALIZADO);
    await pizzaSocket.timeout(2000).emitWithAck(EVENTO_DIGITANDO_INFORMAR, { conversaId: conversaBP, digitando: true });
    await aguardarAte(() => digitando.length === 1);
    assert.deepEqual(digitando[0], { conversaId: conversaBP, identidadeId: pizzaria.identidadeId, digitando: true });
    for (const s of [socketB, pessoalA, pizzaSocket]) s.disconnect();
  });
});

describe("participar ≠ operar", () => {
  it("C pode conversar COM a Pizzaria como cliente, em outra conversa", async () => {
    const conversaCP = await ctx.abrirConversa(C, `${PREFIXO}_pizza`);
    assert.notEqual(conversaCP, conversaBP);
    await ctx.enviar(C, conversaCP, "Olá, sou o Carlos");
    assert.deepEqual(new Set((await listar(comoPizzaria)).map((c) => c.id)), new Set([conversaBP, conversaCP]));
    assert.ok(!(await listar(C)).some((c) => c.id === conversaBP), "C não vê a conversa de B com a empresa");
  });

  it("C não opera a Pizzaria: identidade atuante recusada em HTTP e realtime, sem inbox, envio, edição ou leitura", async () => {
    const cComoPizzaria = como(C, pizzaria.identidadeId);
    const [ultima] = (await ctx.historico(comoPizzaria, conversaBP)).mensagens.filter((m) => m.remetenteIdentidadeId === pizzaria.identidadeId && !m.excluidaEm).slice(-1);
    const tentativas = [
      await ctx.api(cComoPizzaria, "GET", "/conversas"),
      await ctx.api(cComoPizzaria, "GET", `/conversas/${conversaBP}/mensagens`),
      await ctx.api(cComoPizzaria, "POST", `/conversas/${conversaBP}/mensagens`, { idCliente: randomUUID(), conteudo: "Sou a Pizzaria (falso)" }),
      await ctx.api(cComoPizzaria, "PATCH", `/conversas/${conversaBP}/mensagens/${ultima?.id ?? randomUUID()}`, { conteudo: "adulterada" }),
      await ctx.api(cComoPizzaria, "POST", "/conversas/diretas", { nomeUsuario: `${PREFIXO}_b` }),
      await ctx.api(como(C, B.identidadeId), "GET", "/conversas"),
      await ctx.api(como(C, "nao-e-uuid"), "GET", "/conversas"),
    ];
    for (const resposta of tentativas) {
      assert.equal(resposta.statusCode, 403, resposta.body);
      assert.equal(resposta.json().codigo, "IDENTIDADE_NAO_AUTORIZADA");
      assert.ok(!resposta.body.includes("entregam"));
    }
    await assert.rejects(ctx.conectar(cComoPizzaria), (erro: Error) => erro.message === "IDENTIDADE_NAO_AUTORIZADA");
    assert.equal((await ctx.banco.select().from(mensagens).where(eq(mensagens.conteudo, "Sou a Pizzaria (falso)"))).length, 0);

    // Corpo/params não escolhem remetente nem empresa.
    const forjado = await ctx.api(C, "POST", "/conversas/diretas", { nomeUsuario: `${PREFIXO}_b`, identidadeId: pizzaria.identidadeId, empresaId: pizzaria.id });
    assert.ok([200, 201].includes(forjado.statusCode));
    assert.ok((forjado.json().participantes as Array<{ identidadeId: string }>).some((p) => p.identidadeId === C.identidadeId));
    assert.ok(!(forjado.json().participantes as Array<{ identidadeId: string }>).some((p) => p.identidadeId === pizzaria.identidadeId));

    // Administração da empresa continua exclusiva do proprietário.
    assert.equal((await ctx.api(C, "GET", `/empresas/${pizzaria.id}/produtos`)).statusCode, 404);
    assert.equal((await ctx.api(cComoPizzaria, "GET", `/empresas/${pizzaria.id}/produtos`)).statusCode, 404);
    assert.equal((await ctx.api(B, "POST", `/empresas/${pizzaria.id}/produtos`, { nome: "Intruso", precoCentavos: 100 })).statusCode, 404);
  });

  it("cabeçalho repetido é recusado; sem cabeçalho a conta age como pessoal (A↔B pessoal continua)", async () => {
    const repetido = await ctx.api(como(A, [pizzaria.identidadeId, A.identidadeId]), "GET", "/conversas");
    assert.equal(repetido.statusCode, 403);
    assert.equal(repetido.json().codigo, "IDENTIDADE_NAO_AUTORIZADA");
    const conversaAB = await ctx.abrirConversa(A, `${PREFIXO}_b`);
    const pessoal = await ctx.enviar(A, conversaAB, "Oi Bruna, aqui é o Junior");
    assert.equal(pessoal.remetenteIdentidadeId, A.identidadeId);
    assert.ok((await listar(A)).some((c) => c.id === conversaAB));
    assert.ok(!(await listar(comoPizzaria)).some((c) => c.id === conversaAB), "conversa pessoal não aparece na empresa");
  });
});
