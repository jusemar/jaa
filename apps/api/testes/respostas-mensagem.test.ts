import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { criarConexaoBanco } from "@jaa/banco";
import { conversas, identidades, mensagens, participantesConversa, rateLimits, users, verifications } from "@jaa/banco/schema";
import {
  EVENTO_CONVERSA_NAO_LIDAS,
  EVENTO_CONVERSA_OBSERVAR,
  EVENTO_DIGITANDO_ATUALIZADO,
  EVENTO_DIGITANDO_INFORMAR,
  EVENTO_MENSAGEM_NOVA,
  EVENTO_MENSAGENS_ENTREGUES,
  EVENTO_MENSAGENS_LIDAS,
  EVENTO_NOTIFICACAO_NOVA_MENSAGEM,
  PREVIA_MENSAGEM_RESPONDIDA_TAMANHO_MAXIMO,
  type EventoMensagemNova,
  type Mensagem,
  type MensagemRespondida,
  type PaginaConversas,
  type PaginaMensagens,
} from "@jaa/contratos";
import { betterAuth } from "better-auth";
import { testUtils } from "better-auth/plugins";
import { and, count, eq, inArray, like } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { io, type Socket } from "socket.io-client";
import { criarAplicacao } from "../src/aplicacao.js";
import { criarOpcoesAutenticacao } from "../src/features/autenticacao/autenticacao.js";
import { criarAvisoSessoesEncerradas } from "../src/features/autenticacao/lib/sessoes-encerradas.js";
import { criarCanalEventosMensagens } from "../src/features/mensagens/lib/eventos-mensagens.js";
import { carregarAmbiente } from "../src/lib/ambiente.js";
import { configurarRealtime } from "../src/realtime/configurar-realtime.js";

/*
 * Integração REAL de respostas a mensagens: HTTP (Fastify), Better Auth, PostgreSQL local e Socket.IO.
 * Telefones e IPs reservados; todos os dados criados são removidos ao final.
 */

const ORIGEM_WEB = "http://localhost:3000";
const PREFIXO_IP_TESTE = "198.18.2."; // RFC 2544 (reservado para testes)
const TELEFONES_TESTE = ["+5531987650601", "+5531987650602", "+5531987650603"];

const ambiente = carregarAmbiente();
const conexao = criarConexaoBanco(ambiente.DATABASE_URL);
const { banco } = conexao;
const eventosMensagens = criarCanalEventosMensagens();
const sessoesEncerradas = criarAvisoSessoesEncerradas();
const opcoes = criarOpcoesAutenticacao({ banco, ambiente, entregadorOtp: { enviar: async () => {} }, sessoesEncerradas });
const autenticacao = betterAuth({ ...opcoes, plugins: [...opcoes.plugins, testUtils({ captureOTP: true })] });

let app: FastifyInstance;
let porta = 0;
const clientes: Socket[] = [];

interface Pessoa {
  cookie: string;
  identidadeId: string;
  nomeExibicao: string;
  ip: string;
}
let A: Pessoa;
let B: Pessoa;
let C: Pessoa;
let conversaAB = "";
let conversaBC = "";

function api(pessoa: Pessoa | null, metodo: "GET" | "POST", url: string, corpo?: unknown) {
  return app.inject({
    method: metodo,
    url,
    remoteAddress: pessoa?.ip ?? `${PREFIXO_IP_TESTE}99`,
    headers: {
      origin: ORIGEM_WEB,
      ...(corpo !== undefined ? { "content-type": "application/json" } : {}),
      ...(pessoa ? { cookie: pessoa.cookie } : {}),
    },
    ...(corpo !== undefined ? { payload: JSON.stringify(corpo) } : {}),
  });
}

async function criarPessoa(telefone: string, nomeUsuario: string, nomeExibicao: string, ip: string): Promise<Pessoa> {
  const semSessao: Pessoa = { cookie: "", identidadeId: "", nomeExibicao, ip };
  assert.equal((await api(semSessao, "POST", "/api/auth/phone-number/send-otp", { phoneNumber: telefone })).statusCode, 200);
  const codigo = (await autenticacao.$context).test.getOTP?.(telefone);
  assert.ok(codigo);
  const verificacao = await api(semSessao, "POST", "/api/auth/phone-number/verify", { phoneNumber: telefone, code: codigo });
  const cookieSessao = verificacao.cookies.find((c) => c.name === "better-auth.session_token");
  assert.ok(cookieSessao);
  const pessoa: Pessoa = { ...semSessao, cookie: `${cookieSessao.name}=${cookieSessao.value}` };
  const identidade = await api(pessoa, "POST", "/identidades/pessoal", { nomeExibicao, nomeUsuario });
  assert.equal(identidade.statusCode, 201, identidade.body);
  return { ...pessoa, identidadeId: identidade.json().id };
}

const postar = (pessoa: Pessoa, conversaId: string, corpo: Record<string, unknown>) =>
  api(pessoa, "POST", `/conversas/${conversaId}/mensagens`, { idCliente: randomUUID(), ...corpo });

async function enviar(pessoa: Pessoa, conversaId: string, conteudo: string, mensagemRespondidaId?: string): Promise<Mensagem> {
  const resposta = await postar(pessoa, conversaId, { conteudo, ...(mensagemRespondidaId ? { mensagemRespondidaId } : {}) });
  assert.equal(resposta.statusCode, 201, resposta.body);
  return resposta.json();
}

async function historico(pessoa: Pessoa, conversaId: string, consulta = "limite=100"): Promise<PaginaMensagens> {
  const resposta = await api(pessoa, "GET", `/conversas/${conversaId}/mensagens?${consulta}`);
  assert.equal(resposta.statusCode, 200, resposta.body);
  return resposta.json();
}

const referenciaEsperada = (original: Mensagem, autor: Pessoa): MensagemRespondida => ({
  id: original.id,
  remetente: { identidadeId: autor.identidadeId, nomeExibicao: autor.nomeExibicao },
  tipo: "texto",
  previaConteudo: original.conteudo,
  conteudoTruncado: false,
  excluida: false,
});

async function conectar(pessoa: Pessoa): Promise<Socket> {
  const socket = io(`http://127.0.0.1:${porta}`, { forceNew: true, reconnection: false, extraHeaders: { origin: ORIGEM_WEB, cookie: pessoa.cookie } });
  clientes.push(socket);
  await new Promise<void>((resolver, rejeitar) => {
    socket.once("connect", () => resolver());
    socket.once("connect_error", rejeitar);
  });
  return socket;
}

function coletar<T>(socket: Socket, evento: string): T[] {
  const recebidos: T[] = [];
  socket.on(evento, (dados: T) => recebidos.push(dados));
  return recebidos;
}

async function aguardarAte(condicao: () => boolean, limiteMs = 3000) {
  const inicio = Date.now();
  while (!condicao()) {
    if (Date.now() - inicio > limiteMs) throw new Error("condição não atingida a tempo");
    await new Promise((r) => setTimeout(r, 20));
  }
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function contarMensagens(conversaId: string) {
  const [linha] = await banco.select({ total: count() }).from(mensagens).where(eq(mensagens.conversaId, conversaId));
  return linha?.total ?? 0;
}

async function limparDadosDeTeste() {
  const usuariosTeste = banco.select({ id: users.id }).from(users).where(inArray(users.phoneNumber, TELEFONES_TESTE));
  const identidadesTeste = banco.select({ id: identidades.id }).from(identidades).where(inArray(identidades.usuarioId, usuariosTeste));
  const conversasTeste = banco
    .select({ id: participantesConversa.conversaId })
    .from(participantesConversa)
    .where(inArray(participantesConversa.identidadeId, identidadesTeste));
  // Uma única instrução apaga originais e respostas juntas (FK de resposta é NO ACTION).
  await banco.delete(mensagens).where(inArray(mensagens.conversaId, conversasTeste));
  await banco.delete(conversas).where(inArray(conversas.id, conversasTeste));
  await banco.delete(identidades).where(inArray(identidades.usuarioId, usuariosTeste));
  await banco.delete(users).where(inArray(users.phoneNumber, TELEFONES_TESTE));
  await banco.delete(verifications).where(inArray(verifications.identifier, TELEFONES_TESTE));
  await banco.delete(rateLimits).where(like(rateLimits.key, `${PREFIXO_IP_TESTE}%`));
}

before(async () => {
  await limparDadosDeTeste();
  app = await criarAplicacao({ ambiente, banco, autenticacao, eventosMensagens, logger: false });
  configurarRealtime(app, { autenticacao, banco, sessoesEncerradas, eventosMensagens, origensPermitidas: ambiente.ORIGENS_WEB_PERMITIDAS });
  await app.listen({ port: 0, host: "127.0.0.1" });
  porta = (app.server.address() as AddressInfo).port;

  A = await criarPessoa(TELEFONES_TESTE[0] as string, "resp_a", "Ana Resp", `${PREFIXO_IP_TESTE}1`);
  B = await criarPessoa(TELEFONES_TESTE[1] as string, "resp_b", "Mateus Resp", `${PREFIXO_IP_TESTE}2`);
  C = await criarPessoa(TELEFONES_TESTE[2] as string, "resp_c", "Carla Resp", `${PREFIXO_IP_TESTE}3`);
  conversaAB = (await api(A, "POST", "/conversas/diretas", { nomeUsuario: "resp_b" })).json().id;
  conversaBC = (await api(C, "POST", "/conversas/diretas", { nomeUsuario: "resp_b" })).json().id;
});

after(async () => {
  for (const cliente of clientes) cliente.disconnect();
  await app.close();
  await limparDadosDeTeste();
  const [restantes] = await banco.select({ total: count() }).from(users).where(inArray(users.phoneNumber, TELEFONES_TESTE));
  assert.equal(restantes?.total, 0, "dados de teste não foram limpos");
  await conexao.encerrar();
});

describe("responder uma mensagem", () => {
  it("A responde B e B responde A (e a própria mensagem): referência persistida com autor e prévia", async () => {
    const pergunta = await enviar(B, conversaAB, "Você vai trabalhar amanhã?");
    assert.equal(pergunta.mensagemRespondida, null);

    const resposta = await enviar(A, conversaAB, "Sim, pela manhã.", pergunta.id);
    assert.deepEqual(resposta.mensagemRespondida, referenciaEsperada(pergunta, B));
    assert.equal(resposta.remetenteIdentidadeId, A.identidadeId);
    const [linha] = await banco.select().from(mensagens).where(eq(mensagens.id, resposta.id));
    assert.equal(linha?.mensagemRespondidaId, pergunta.id);

    const replica = await enviar(B, conversaAB, "Ótimo!", resposta.id);
    assert.deepEqual(replica.mensagemRespondida, referenciaEsperada(resposta, A));

    const complemento = await enviar(A, conversaAB, "Complementando o que eu disse", resposta.id);
    assert.deepEqual(complemento.mensagemRespondida?.remetente, { identidadeId: A.identidadeId, nomeExibicao: "Ana Resp" });
  });

  it("realtime entrega a resposta completa (com referência) a B e às outras abas de A, sem evento extra", async () => {
    const [b1, a2] = await Promise.all([conectar(B), conectar(A)]);
    const novasB = coletar<EventoMensagemNova>(b1, EVENTO_MENSAGEM_NOVA);
    const novasA2 = coletar<EventoMensagemNova>(a2, EVENTO_MENSAGEM_NOVA);
    const recebidosB: string[] = [];
    b1.onAny((evento: string) => recebidosB.push(evento));
    const original = await enviar(B, conversaAB, "Pode me ligar?");
    await aguardarAte(() => novasB.length === 1);

    const resposta = await enviar(A, conversaAB, "Ligo às 10h.", original.id);
    await aguardarAte(() => novasB.length === 2 && novasA2.length === 2);
    assert.deepEqual(novasB[1]?.mensagem, resposta);
    assert.deepEqual(novasA2[1]?.mensagem, resposta);
    await esperar(200);
    // Contagem de não lidas e notificação de nova mensagem são independentes de ser resposta.
    assert.deepEqual(
      recebidosB.filter((evento) => evento !== EVENTO_CONVERSA_NAO_LIDAS && evento !== EVENTO_NOTIFICACAO_NOVA_MENSAGEM),
      [EVENTO_MENSAGEM_NOVA, EVENTO_MENSAGEM_NOVA],
      "resposta é mensagem:nova normal, sem evento próprio",
    );
    b1.disconnect();
    a2.disconnect();
  });

  it("histórico e 'reload' mostram a mesma referência para os dois lados", async () => {
    const original = await enviar(A, conversaAB, "Reunião às 15h?");
    const resposta = await enviar(B, conversaAB, "Confirmado.", original.id);
    for (const pessoa of [A, B, A]) {
      const pagina = await historico(pessoa, conversaAB);
      const naPagina = pagina.mensagens.find((m) => m.id === resposta.id);
      assert.deepEqual(naPagina?.mensagemRespondida, referenciaEsperada(original, A));
      assert.equal(pagina.mensagens.find((m) => m.id === original.id)?.mensagemRespondida, null);
    }
  });

  it("original fora da página atual: a resposta traz a referência sem carregar a original; paginação intacta", async () => {
    const antiga = await enviar(B, conversaAB, "Mensagem bem antiga");
    for (let i = 0; i < 35; i++) await enviar(i % 2 ? A : B, conversaAB, `enchimento ${i}`);
    const resposta = await enviar(A, conversaAB, "Respondendo a antiga", antiga.id);

    const recente = await historico(B, conversaAB, "limite=10");
    assert.equal(recente.mensagens.length, 10);
    assert.equal(recente.mensagens.some((m) => m.id === antiga.id), false, "original não está na página");
    assert.deepEqual(recente.mensagens.at(-1)?.mensagemRespondida, referenciaEsperada(antiga, B));
    assert.equal(recente.mensagens.at(-1)?.id, resposta.id);

    const ids = recente.mensagens.map((m) => m.id);
    assert.deepEqual(ids, [...ids].sort(), "ordem cronológica por id preservada");
    const anterior = await historico(B, conversaAB, `limite=10&antesDe=${recente.proximoCursor}`);
    assert.ok(anterior.mensagens.every((m) => m.id < (ids[0] as string)));
  });

  it("destinatário offline recupera a resposta depois; lista mostra só o conteúdo novo; estados seguem Enviada→Entregue→Lida", async () => {
    const socketA = await conectar(A);
    const entregues = coletar<unknown>(socketA, EVENTO_MENSAGENS_ENTREGUES);
    const lidas = coletar<unknown>(socketA, EVENTO_MENSAGENS_LIDAS);
    const original = await enviar(B, conversaAB, "Chegou em casa?");
    const resposta = await enviar(A, conversaAB, "Cheguei sim.", original.id); // B sem nenhuma conexão
    assert.equal(resposta.estado, "enviada");

    const paginaB = await historico(B, conversaAB);
    const recuperada = paginaB.mensagens.find((m) => m.id === resposta.id);
    assert.deepEqual(recuperada?.mensagemRespondida, referenciaEsperada(original, B));
    assert.equal(recuperada?.estado, "enviada");

    const listaB: PaginaConversas = (await api(B, "GET", "/conversas")).json();
    const item = listaB.conversas.find((c) => c.id === conversaAB);
    assert.equal(listaB.conversas[0]?.id, conversaAB, "conversa com a resposta sobe ao topo");
    assert.equal(item?.ultimaMensagem.id, resposta.id);
    assert.equal(item?.ultimaMensagem.conteudo, "Cheguei sim.");
    assert.deepEqual(item?.ultimaMensagem.mensagemRespondida, referenciaEsperada(original, B));

    assert.equal((await api(B, "POST", "/mensagens/recebimentos", { mensagemIds: [resposta.id] })).statusCode, 200);
    await aguardarAte(() => entregues.length === 1);
    assert.equal((await historico(A, conversaAB)).mensagens.find((m) => m.id === resposta.id)?.estado, "entregue");
    assert.equal((await api(B, "POST", `/conversas/${conversaAB}/leitura`, { ateMensagemId: resposta.id })).statusCode, 200);
    await aguardarAte(() => lidas.length === 1);
    const final = (await historico(A, conversaAB)).mensagens.find((m) => m.id === resposta.id);
    assert.equal(final?.estado, "lida");
    assert.deepEqual(final?.mensagemRespondida, referenciaEsperada(original, B));
    socketA.disconnect();
  });

  it("conteúdo longo: prévia limitada (em caracteres) e marcada como truncada; a original fica intacta", async () => {
    const longa = await enviar(B, conversaAB, "é".repeat(4000));
    const noLimite = await enviar(B, conversaAB, "ã".repeat(PREVIA_MENSAGEM_RESPONDIDA_TAMANHO_MAXIMO));
    const respostaLonga = await enviar(A, conversaAB, "Resumindo: ok", longa.id);
    const respostaLimite = await enviar(A, conversaAB, "ok também", noLimite.id);

    assert.equal([...(respostaLonga.mensagemRespondida?.previaConteudo ?? "")].length, PREVIA_MENSAGEM_RESPONDIDA_TAMANHO_MAXIMO);
    assert.equal(respostaLonga.mensagemRespondida?.conteudoTruncado, true);
    assert.equal(respostaLimite.mensagemRespondida?.previaConteudo, noLimite.conteudo);
    assert.equal(respostaLimite.mensagemRespondida?.conteudoTruncado, false);

    const pagina = await historico(A, conversaAB);
    assert.equal(pagina.mensagens.find((m) => m.id === longa.id)?.conteudo, "é".repeat(4000));
    assert.equal(pagina.mensagens.find((m) => m.id === respostaLonga.id)?.mensagemRespondida?.conteudoTruncado, true);
  });
});

describe("idempotência da resposta", () => {
  it("retry com o mesmo idCliente e a mesma referência não duplica nem reemite", async () => {
    const socketB = await conectar(B);
    const novas = coletar<EventoMensagemNova>(socketB, EVENTO_MENSAGEM_NOVA);
    const original = await enviar(B, conversaAB, "Traz pão?");
    const idCliente = randomUUID();
    const corpo = { idCliente, conteudo: "Trago.", mensagemRespondidaId: original.id };

    const primeira = await api(A, "POST", `/conversas/${conversaAB}/mensagens`, corpo);
    assert.equal(primeira.statusCode, 201);
    const retries = await Promise.all(Array.from({ length: 6 }, () => api(A, "POST", `/conversas/${conversaAB}/mensagens`, corpo)));
    for (const retry of retries) {
      assert.equal(retry.statusCode, 200);
      assert.equal(retry.json().id, primeira.json().id);
      assert.deepEqual(retry.json().mensagemRespondida, referenciaEsperada(original, B));
    }
    const [linhas] = await banco
      .select({ total: count() })
      .from(mensagens)
      .where(and(eq(mensagens.remetenteIdentidadeId, A.identidadeId), eq(mensagens.idCliente, idCliente)));
    assert.equal(linhas?.total, 1);
    await esperar(300);
    assert.equal(novas.filter((e) => e.mensagem.id === primeira.json().id).length, 1);
    socketB.disconnect();
  });

  it("mesmo idCliente não troca, remove nem adiciona a referência silenciosamente", async () => {
    const original = await enviar(B, conversaAB, "Qual horário?");
    const outra = await enviar(B, conversaAB, "E o local?");
    const semResposta = await enviar(B, conversaAB, "Obrigado");

    const idCliente = randomUUID();
    assert.equal((await api(A, "POST", `/conversas/${conversaAB}/mensagens`, { idCliente, conteudo: "10h", mensagemRespondidaId: original.id })).statusCode, 201);
    for (const corpo of [
      { idCliente, conteudo: "10h", mensagemRespondidaId: outra.id },
      { idCliente, conteudo: "10h" },
    ]) {
      const resposta = await api(A, "POST", `/conversas/${conversaAB}/mensagens`, corpo);
      assert.equal(resposta.statusCode, 409);
      assert.equal(resposta.json().codigo, "ID_CLIENTE_REUTILIZADO");
    }

    const idComum = randomUUID();
    assert.equal((await api(A, "POST", `/conversas/${conversaAB}/mensagens`, { idCliente: idComum, conteudo: "de nada" })).statusCode, 201);
    const tentativa = await api(A, "POST", `/conversas/${conversaAB}/mensagens`, { idCliente: idComum, conteudo: "de nada", mensagemRespondidaId: semResposta.id });
    assert.equal(tentativa.statusCode, 409);

    const [linha] = await banco.select().from(mensagens).where(and(eq(mensagens.remetenteIdentidadeId, A.identidadeId), eq(mensagens.idCliente, idCliente)));
    assert.equal(linha?.mensagemRespondidaId, original.id);
  });
});

describe("autorização e ataques na referência", () => {
  it("id inexistente ou de outra conversa é recusado sem gravar nem emitir, com a mesma resposta", async () => {
    const socketB = await conectar(B);
    const novas = coletar<EventoMensagemNova>(socketB, EVENTO_MENSAGEM_NOVA);
    const deBC = await enviar(C, conversaBC, "Segredo entre B e C");
    const antes = await contarMensagens(conversaAB);

    const respostas = [
      await postar(A, conversaAB, { conteudo: "fantasma", mensagemRespondidaId: randomUUID() }),
      await postar(A, conversaAB, { conteudo: "cruzada", mensagemRespondidaId: deBC.id }),
      // B participa das DUAS conversas e mesmo assim não pode cruzar referências.
      await postar(B, conversaAB, { conteudo: "cruzada por participante", mensagemRespondidaId: deBC.id }),
    ];
    for (const resposta of respostas) {
      assert.equal(resposta.statusCode, 404);
      assert.deepEqual(resposta.json(), {
        codigo: "MENSAGEM_RESPONDIDA_NAO_ENCONTRADA",
        mensagem: "A mensagem respondida não foi encontrada nesta conversa.",
      });
      assert.ok(!resposta.body.includes("Segredo"), "nada do conteúdo alheio vaza");
    }
    assert.equal(await contarMensagens(conversaAB), antes);
    await esperar(200);
    assert.equal(novas.filter((e) => e.mensagem.conversaId === conversaAB).length, 0);
    assert.equal((await postar(A, conversaAB, { conteudo: "formato", mensagemRespondidaId: "nao-e-uuid" })).statusCode, 400);
    socketB.disconnect();
  });

  it("C não injeta nem obtém referência privada de A↔B", async () => {
    const privada = await enviar(A, conversaAB, "Conteúdo privado de A↔B");
    const naConversaAlheia = await postar(C, conversaAB, { conteudo: "intrusão", mensagemRespondidaId: privada.id });
    assert.equal(naConversaAlheia.statusCode, 404);
    assert.equal(naConversaAlheia.json().codigo, "CONVERSA_NAO_ENCONTRADA");

    const naPropriaConversa = await postar(C, conversaBC, { conteudo: "tentando citar", mensagemRespondidaId: privada.id });
    assert.equal(naPropriaConversa.statusCode, 404);
    assert.equal(naPropriaConversa.json().codigo, "MENSAGEM_RESPONDIDA_NAO_ENCONTRADA");
    assert.ok(!naPropriaConversa.body.includes("privado"));

    const paginaC = await historico(C, conversaBC);
    assert.ok(!JSON.stringify(paginaC).includes("privado"));
    assert.equal((await api(C, "GET", `/conversas/${conversaAB}/mensagens`)).statusCode, 404);
  });

  it("spoof: remetente, conversa e referência forjados no corpo são ignorados", async () => {
    const original = await enviar(B, conversaAB, "Original verdadeira");
    const resposta = await postar(A, conversaAB, {
      conteudo: "Resposta",
      mensagemRespondidaId: original.id,
      remetenteIdentidadeId: B.identidadeId,
      conversaId: conversaBC,
      mensagemRespondida: { id: original.id, remetente: { identidadeId: C.identidadeId, nomeExibicao: "Forjado" }, tipo: "texto", previaConteudo: "falso", conteudoTruncado: false, excluida: false },
    });
    assert.equal(resposta.statusCode, 201, resposta.body);
    assert.equal(resposta.json().remetenteIdentidadeId, A.identidadeId);
    assert.equal(resposta.json().conversaId, conversaAB);
    assert.deepEqual(resposta.json().mensagemRespondida, referenciaEsperada(original, B));
  });
});

describe("digitando durante a resposta", () => {
  it("persistir a resposta encerra o digitando antes de mensagem:nova chegar com a referência", async () => {
    const [a1, b1] = await Promise.all([conectar(A), conectar(B)]);
    for (const socket of [a1, b1]) assert.equal((await socket.timeout(2000).emitWithAck(EVENTO_CONVERSA_OBSERVAR, { conversaId: conversaAB })).ok, true);
    const original = await enviar(B, conversaAB, "Tá aí?");
    const ordem: string[] = [];
    b1.on(EVENTO_DIGITANDO_ATUALIZADO, (e: { digitando: boolean }) => ordem.push(`digitando:${e.digitando}`));
    b1.on(EVENTO_MENSAGEM_NOVA, (e: EventoMensagemNova) => {
      if (e.mensagem.id !== original.id) ordem.push(e.mensagem.mensagemRespondida ? "resposta" : "mensagem");
    });

    await a1.timeout(2000).emitWithAck(EVENTO_DIGITANDO_INFORMAR, { conversaId: conversaAB, digitando: true });
    await aguardarAte(() => ordem.length === 1);
    await enviar(A, conversaAB, "Tô sim", original.id);
    await aguardarAte(() => ordem.length === 3);
    assert.deepEqual(ordem, ["digitando:true", "digitando:false", "resposta"]);
    a1.disconnect();
    b1.disconnect();
  });
});
