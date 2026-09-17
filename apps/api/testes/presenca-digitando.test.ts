import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { criarConexaoBanco } from "@jaa/banco";
import { conversas, identidades, mensagens, participantesConversa, rateLimits, users, verifications } from "@jaa/banco/schema";
import {
  EVENTO_CONVERSA_DEIXAR_DE_OBSERVAR,
  EVENTO_CONVERSA_OBSERVAR,
  EVENTO_DIGITANDO_ATUALIZADO,
  EVENTO_DIGITANDO_INFORMAR,
  EVENTO_MENSAGEM_NOVA,
  EVENTO_PRESENCA_ATUALIZADA,
  type EventoDigitandoAtualizado,
  type EventoPresencaAtualizada,
  type RespostaEventoRealtime,
  type RespostaObservarConversa,
} from "@jaa/contratos";
import { betterAuth } from "better-auth";
import { testUtils } from "better-auth/plugins";
import { count, inArray, like } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { io, type Socket } from "socket.io-client";
import { criarAplicacao } from "../src/aplicacao.js";
import { criarOpcoesAutenticacao } from "../src/features/autenticacao/autenticacao.js";
import { criarAvisoSessoesEncerradas } from "../src/features/autenticacao/lib/sessoes-encerradas.js";
import { LIMITE_OBSERVACOES_POR_CONEXAO } from "../src/features/conversas/eventos/eventos-atividade-conversa.js";
import { criarRegistroDigitandoEmMemoria } from "../src/features/conversas/lib/registro-digitando.js";
import { criarCanalEventosMensagens } from "../src/features/mensagens/lib/eventos-mensagens.js";
import { criarRegistroPresencaEmMemoria } from "../src/features/presenca/lib/registro-presenca.js";
import { carregarAmbiente } from "../src/lib/ambiente.js";
import { configurarRealtime } from "../src/realtime/configurar-realtime.js";
import type { ServidorRealtime } from "../src/realtime/tipos.js";

/*
 * Integração REAL de presença e "digitando": HTTP (Fastify), Better Auth, PostgreSQL local e
 * Socket.IO numa porta, com clientes socket.io-client. Tempos de tolerância/validade encurtados
 * por injeção (a lógica é a mesma de produção). Nada disso é persistido; dados de teste removidos.
 */

const ORIGEM_WEB = "http://localhost:3000";
const PREFIXO_IP_TESTE = "198.18.1."; // RFC 2544 (reservado para testes)
const TELEFONES_TESTE = ["+5531987650501", "+5531987650502", "+5531987650503"];
const TOLERANCIA_OFFLINE_MS = 300;
const VALIDADE_DIGITANDO_MS = 700;
const REPASSE_DIGITANDO_MS = 250;

const ambiente = carregarAmbiente();
// A origem do teste é definida AQUI: mudar as origens do .env local não pode quebrar a suíte.
const ambienteDoTeste = { ...ambiente, ORIGENS_WEB_PERMITIDAS: [ORIGEM_WEB] };
const conexao = criarConexaoBanco(ambiente.DATABASE_URL);
const { banco } = conexao;
const eventosMensagens = criarCanalEventosMensagens();
const sessoesEncerradas = criarAvisoSessoesEncerradas();
const opcoes = criarOpcoesAutenticacao({ banco, ambiente: ambienteDoTeste, entregadorOtp: { enviar: async () => {} }, sessoesEncerradas });
const autenticacao = betterAuth({ ...opcoes, plugins: [...opcoes.plugins, testUtils({ captureOTP: true })] });

let app: FastifyInstance;
let realtime: ServidorRealtime;
let porta = 0;
const clientes: Socket[] = [];

interface Pessoa {
  cookie: string;
  identidadeId: string;
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

async function criarPessoa(telefone: string, nomeUsuario: string, ip: string): Promise<Pessoa> {
  const semSessao: Pessoa = { cookie: "", identidadeId: "", ip };
  assert.equal((await api(semSessao, "POST", "/api/auth/phone-number/send-otp", { phoneNumber: telefone })).statusCode, 200);
  const codigo = (await autenticacao.$context).test.getOTP?.(telefone);
  assert.ok(codigo);
  const verificacao = await api(semSessao, "POST", "/api/auth/phone-number/verify", { phoneNumber: telefone, code: codigo });
  const cookieSessao = verificacao.cookies.find((c) => c.name === "better-auth.session_token");
  assert.ok(cookieSessao);
  const pessoa: Pessoa = { ...semSessao, cookie: `${cookieSessao.name}=${cookieSessao.value}` };
  const identidade = await api(pessoa, "POST", "/identidades/pessoal", { nomeExibicao: nomeUsuario.toUpperCase(), nomeUsuario });
  assert.equal(identidade.statusCode, 201, identidade.body);
  return { ...pessoa, identidadeId: identidade.json().id };
}

async function conectar(pessoa: Pessoa, extras: { auth?: Record<string, string> } = {}): Promise<Socket> {
  const socket = io(`http://127.0.0.1:${porta}`, {
    forceNew: true,
    reconnection: false,
    extraHeaders: { origin: ORIGEM_WEB, cookie: pessoa.cookie },
    ...(extras.auth ? { auth: extras.auth } : {}),
  });
  clientes.push(socket);
  await new Promise<void>((resolver, rejeitar) => {
    socket.once("connect", () => resolver());
    socket.once("connect_error", rejeitar);
  });
  return socket;
}

async function desconectar(socket: Socket) {
  const identificador = socket.id;
  socket.disconnect();
  await aguardarAte(async () => !(await realtime.fetchSockets()).some((s) => s.id === identificador));
}

const observar = (socket: Socket, dados: unknown): Promise<RespostaObservarConversa> =>
  socket.timeout(2000).emitWithAck(EVENTO_CONVERSA_OBSERVAR, dados);
const deixarDeObservar = (socket: Socket, dados: unknown): Promise<RespostaEventoRealtime> =>
  socket.timeout(2000).emitWithAck(EVENTO_CONVERSA_DEIXAR_DE_OBSERVAR, dados);
const informarDigitando = (socket: Socket, dados: unknown): Promise<RespostaEventoRealtime> =>
  socket.timeout(2000).emitWithAck(EVENTO_DIGITANDO_INFORMAR, dados);

function coletar<T>(socket: Socket, evento: string): T[] {
  const recebidos: T[] = [];
  socket.on(evento, (dados: T) => recebidos.push(dados));
  return recebidos;
}

async function aguardarAte(condicao: () => boolean | Promise<boolean>, limiteMs = 3000) {
  const inicio = Date.now();
  while (!(await condicao())) {
    if (Date.now() - inicio > limiteMs) throw new Error("condição não atingida a tempo");
    await new Promise((r) => setTimeout(r, 20));
  }
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
const presencaDe = (pessoa: Pessoa, online: boolean): EventoPresencaAtualizada => ({ identidadeId: pessoa.identidadeId, online });
const digitandoDe = (pessoa: Pessoa, conversaId: string, digitando: boolean): EventoDigitandoAtualizado => ({
  conversaId,
  identidadeId: pessoa.identidadeId,
  digitando,
});

async function limparDadosDeTeste() {
  const usuariosTeste = banco.select({ id: users.id }).from(users).where(inArray(users.phoneNumber, TELEFONES_TESTE));
  const identidadesTeste = banco.select({ id: identidades.id }).from(identidades).where(inArray(identidades.usuarioId, usuariosTeste));
  const conversasTeste = banco
    .select({ id: participantesConversa.conversaId })
    .from(participantesConversa)
    .where(inArray(participantesConversa.identidadeId, identidadesTeste));
  await banco.delete(mensagens).where(inArray(mensagens.conversaId, conversasTeste));
  await banco.delete(conversas).where(inArray(conversas.id, conversasTeste));
  await banco.delete(identidades).where(inArray(identidades.usuarioId, usuariosTeste));
  await banco.delete(users).where(inArray(users.phoneNumber, TELEFONES_TESTE));
  await banco.delete(verifications).where(inArray(verifications.identifier, TELEFONES_TESTE));
  await banco.delete(rateLimits).where(like(rateLimits.key, `${PREFIXO_IP_TESTE}%`));
}

before(async () => {
  await limparDadosDeTeste();
  app = await criarAplicacao({ ambiente: ambienteDoTeste, banco, autenticacao, eventosMensagens, logger: false });
  realtime = configurarRealtime(app, {
    autenticacao,
    banco,
    sessoesEncerradas,
    eventosMensagens,
    origensPermitidas: ambienteDoTeste.ORIGENS_WEB_PERMITIDAS,
    presenca: criarRegistroPresencaEmMemoria({ toleranciaOfflineMs: TOLERANCIA_OFFLINE_MS }),
    digitando: criarRegistroDigitandoEmMemoria({ validadeMs: VALIDADE_DIGITANDO_MS, intervaloMinimoRepasseMs: REPASSE_DIGITANDO_MS }),
  });
  await app.listen({ port: 0, host: "127.0.0.1" });
  porta = (app.server.address() as AddressInfo).port;

  A = await criarPessoa(TELEFONES_TESTE[0] as string, "pres_a", `${PREFIXO_IP_TESTE}1`);
  B = await criarPessoa(TELEFONES_TESTE[1] as string, "pres_b", `${PREFIXO_IP_TESTE}2`);
  C = await criarPessoa(TELEFONES_TESTE[2] as string, "pres_c", `${PREFIXO_IP_TESTE}3`);
  conversaAB = (await api(A, "POST", "/conversas/diretas", { nomeUsuario: "pres_b" })).json().id;
  conversaBC = (await api(C, "POST", "/conversas/diretas", { nomeUsuario: "pres_b" })).json().id;
});

after(async () => {
  for (const cliente of clientes) cliente.disconnect();
  await app.close();
  await limparDadosDeTeste();
  const [restantes] = await banco.select({ total: count() }).from(users).where(inArray(users.phoneNumber, TELEFONES_TESTE));
  assert.equal(restantes?.total, 0, "dados de teste não foram limpos");
  await conexao.encerrar();
});

describe("presença online/offline", () => {
  it("B observa a conversa com A offline; A conecta → B vê online; com duas conexões fecha uma → continua; fecha a última → offline; reconecta → online", async () => {
    const b1 = await conectar(B);
    const eventosB = coletar<EventoPresencaAtualizada>(b1, EVENTO_PRESENCA_ATUALIZADA);
    assert.deepEqual(await observar(b1, { conversaId: conversaAB }), { ok: true, presencas: [presencaDe(A, false)] });

    const a1 = await conectar(A);
    await aguardarAte(() => eventosB.length === 1);
    assert.deepEqual(eventosB, [presencaDe(A, true)]);

    // A também observa: vê B online desde já (estado atual na resposta).
    assert.deepEqual(await observar(a1, { conversaId: conversaAB }), { ok: true, presencas: [presencaDe(B, true)] });

    const a2 = await conectar(A);
    await desconectar(a1);
    await esperar(TOLERANCIA_OFFLINE_MS * 3);
    assert.deepEqual(eventosB, [presencaDe(A, true)], "fechar uma de duas conexões não deixa A offline");
    assert.deepEqual(await observar(b1, { conversaId: conversaAB }), { ok: true, presencas: [presencaDe(A, true)] });

    await desconectar(a2);
    await aguardarAte(() => eventosB.length === 2);
    assert.deepEqual(eventosB.at(-1), presencaDe(A, false));

    const a3 = await conectar(A);
    await aguardarAte(() => eventosB.length === 3);
    assert.deepEqual(eventosB.at(-1), presencaDe(A, true));

    for (const socket of [b1, a3]) await desconectar(socket);
    await esperar(TOLERANCIA_OFFLINE_MS * 2);
  });

  it("reload rápido (reconexão dentro da tolerância) não gera offline/online falsos", async () => {
    const b1 = await conectar(B);
    const antes = await conectar(A);
    const eventosB = coletar<EventoPresencaAtualizada>(b1, EVENTO_PRESENCA_ATUALIZADA);
    await observar(b1, { conversaId: conversaAB });

    await desconectar(antes);
    const depois = await conectar(A);
    await esperar(TOLERANCIA_OFFLINE_MS * 3);
    assert.deepEqual(eventosB, []);
    assert.deepEqual(await observar(b1, { conversaId: conversaAB }), { ok: true, presencas: [presencaDe(A, true)] });

    for (const socket of [b1, depois]) await desconectar(socket);
    await esperar(TOLERANCIA_OFFLINE_MS * 2);
  });

  it("sem broadcast global: quem não observa uma conversa com a identidade não recebe a presença dela", async () => {
    const [b1, c1] = await Promise.all([conectar(B), conectar(C)]);
    const eventosC = coletar<EventoPresencaAtualizada>(c1, EVENTO_PRESENCA_ATUALIZADA);
    const eventosB = coletar<EventoPresencaAtualizada>(b1, EVENTO_PRESENCA_ATUALIZADA);
    // C tem conversa com B, mas NÃO a observa; B não tem conversa com A aberta.
    const a1 = await conectar(A);
    await desconectar(a1);
    await esperar(TOLERANCIA_OFFLINE_MS * 3);
    assert.deepEqual(eventosC, []);
    assert.deepEqual(eventosB, []);

    // Deixar de observar encerra a entrega.
    await observar(b1, { conversaId: conversaAB });
    assert.deepEqual(await deixarDeObservar(b1, { conversaId: conversaAB }), { ok: true });
    const a2 = await conectar(A);
    await esperar(200);
    assert.deepEqual(eventosB, []);
    for (const socket of [a2, b1, c1]) await desconectar(socket);
    await esperar(TOLERANCIA_OFFLINE_MS * 2);
  });

  it("C sem relação com A↔B não observa a conversa nem a presença; spoof de identidade é ignorado", async () => {
    // Pedir para conectar COMO B é recusado no handshake (nunca concedido); C conecta como si mesma.
    await assert.rejects(conectar(C, { auth: { identidadeId: B.identidadeId } }), (erro: Error) => erro.message === "IDENTIDADE_NAO_AUTORIZADA");
    const c1 = await conectar(C);
    const eventosC = coletar<EventoPresencaAtualizada>(c1, EVENTO_PRESENCA_ATUALIZADA);

    assert.deepEqual(await observar(c1, { conversaId: conversaAB }), { ok: false, codigo: "CONVERSA_NAO_ENCONTRADA" });
    assert.deepEqual(
      await observar(c1, { conversaId: conversaAB, identidadeId: B.identidadeId, sala: `presenca:${A.identidadeId}` }),
      { ok: false, codigo: "CONVERSA_NAO_ENCONTRADA" },
    );
    assert.deepEqual(await observar(c1, { conversaId: randomUUID() }), { ok: false, codigo: "CONVERSA_NAO_ENCONTRADA" });
    for (const invalido of [{}, { conversaId: "abc" }, null, `presenca:${A.identidadeId}`]) {
      assert.deepEqual(await observar(c1, invalido), { ok: false, codigo: "DADOS_INVALIDOS" });
    }
    // Evento fora do contrato (ex.: tentar entrar em sala) não tem efeito.
    c1.emit("join", `presenca:${A.identidadeId}`);

    const salasC = (await realtime.fetchSockets()).find((s) => s.id === c1.id)?.rooms;
    assert.ok(salasC);
    assert.ok(![...salasC].some((sala) => sala.startsWith("presenca:") || sala.startsWith("conversa:")), [...salasC].join(","));

    const a1 = await conectar(A);
    await desconectar(a1);
    await esperar(TOLERANCIA_OFFLINE_MS * 3);
    assert.deepEqual(eventosC, []);

    // Observando a PRÓPRIA conversa com B, C recebe a presença de B (e só dela).
    assert.deepEqual(await observar(c1, { conversaId: conversaBC }), { ok: true, presencas: [presencaDe(B, false)] });
    await desconectar(c1);
  });

  it("limite de conversas observadas por conexão", async () => {
    const b1 = await conectar(B);
    // Observar a mesma conversa de novo é idempotente e não consome o limite.
    for (let i = 0; i < LIMITE_OBSERVACOES_POR_CONEXAO + 2; i++) {
      assert.equal((await observar(b1, { conversaId: conversaAB })).ok, true);
    }
    const dados = (await realtime.fetchSockets()).find((s) => s.id === b1.id)?.data;
    assert.ok(dados);
    for (let i = dados.observacoes.size; i < LIMITE_OBSERVACOES_POR_CONEXAO; i++) dados.observacoes.set(randomUUID(), []);
    assert.deepEqual(await observar(b1, { conversaId: conversaBC }), { ok: false, codigo: "LIMITE_OBSERVACOES" });
    await desconectar(b1);
  });
});

describe("digitando", () => {
  async function prepararAB() {
    const [a1, a2, b1, bLista] = await Promise.all([conectar(A), conectar(A), conectar(B), conectar(B)]);
    for (const socket of [a1, a2, b1]) assert.equal((await observar(socket, { conversaId: conversaAB })).ok, true);
    return {
      a1,
      a2,
      b1,
      bLista,
      emB: coletar<EventoDigitandoAtualizado>(b1, EVENTO_DIGITANDO_ATUALIZADO),
      emBLista: coletar<EventoDigitandoAtualizado>(bLista, EVENTO_DIGITANDO_ATUALIZADO),
      emA1: coletar<EventoDigitandoAtualizado>(a1, EVENTO_DIGITANDO_ATUALIZADO),
      emA2: coletar<EventoDigitandoAtualizado>(a2, EVENTO_DIGITANDO_ATUALIZADO),
      encerrar: async () => {
        for (const socket of [a1, a2, b1, bLista]) if (socket.connected) await desconectar(socket);
        await esperar(TOLERANCIA_OFFLINE_MS * 2);
      },
    };
  }

  it("A digita → B (conversa aberta) recebe; B sem conversa aberta e as outras abas de A não; A para → B deixa de ver", async () => {
    const ctx = await prepararAB();
    assert.deepEqual(await informarDigitando(ctx.a1, { conversaId: conversaAB, digitando: true }), { ok: true });
    await aguardarAte(() => ctx.emB.length === 1);
    assert.deepEqual(ctx.emB, [digitandoDe(A, conversaAB, true)]);

    assert.deepEqual(await informarDigitando(ctx.a1, { conversaId: conversaAB, digitando: false }), { ok: true });
    await aguardarAte(() => ctx.emB.length === 2);
    assert.deepEqual(ctx.emB.at(-1), digitandoDe(A, conversaAB, false));

    await esperar(200);
    assert.deepEqual(ctx.emBLista, [], "conexão que não observa a conversa não recebe digitando");
    assert.deepEqual([...ctx.emA1, ...ctx.emA2], [], "a própria identidade não recebe o seu digitando");
    await ctx.encerrar();
  });

  it("sem digitação, nenhum estado falso chega a ninguém", async () => {
    const ctx = await prepararAB();
    await esperar(VALIDADE_DIGITANDO_MS + 200);
    assert.deepEqual([...ctx.emB, ...ctx.emA1, ...ctx.emA2], []);
    await ctx.encerrar();
  });

  it("A envia a mensagem → digitando some antes/independentemente do cliente avisar", async () => {
    const ctx = await prepararAB();
    const ordem: string[] = [];
    ctx.b1.on(EVENTO_DIGITANDO_ATUALIZADO, (e: EventoDigitandoAtualizado) => ordem.push(`digitando:${e.digitando}`));
    ctx.b1.on(EVENTO_MENSAGEM_NOVA, () => ordem.push("mensagem"));

    await informarDigitando(ctx.a1, { conversaId: conversaAB, digitando: true });
    await aguardarAte(() => ordem.length === 1);
    const envio = await api(A, "POST", `/conversas/${conversaAB}/mensagens`, { idCliente: randomUUID(), conteudo: "enviada digitando" });
    assert.equal(envio.statusCode, 201);
    await aguardarAte(() => ordem.length === 3);
    assert.deepEqual(ordem, ["digitando:true", "digitando:false", "mensagem"]);
    await ctx.encerrar();
  });

  it("A sai da conversa → B deixa de ver; A desconecta → B deixa de ver imediatamente", async () => {
    const ctx = await prepararAB();
    await informarDigitando(ctx.a1, { conversaId: conversaAB, digitando: true });
    await aguardarAte(() => ctx.emB.length === 1);
    await deixarDeObservar(ctx.a1, { conversaId: conversaAB });
    await aguardarAte(() => ctx.emB.length === 2);
    assert.deepEqual(ctx.emB.at(-1), digitandoDe(A, conversaAB, false));

    // Após sair, a mesma conexão não pode mais informar digitando nessa conversa.
    assert.deepEqual(await informarDigitando(ctx.a1, { conversaId: conversaAB, digitando: true }), {
      ok: false,
      codigo: "CONVERSA_NAO_ENCONTRADA",
    });

    await informarDigitando(ctx.a2, { conversaId: conversaAB, digitando: true });
    await aguardarAte(() => ctx.emB.length === 3);
    const inicio = Date.now();
    ctx.a2.disconnect();
    await aguardarAte(() => ctx.emB.length === 4);
    assert.deepEqual(ctx.emB.at(-1), digitandoDe(A, conversaAB, false));
    assert.ok(Date.now() - inicio < VALIDADE_DIGITANDO_MS, "queda encerra o digitando sem esperar a validade");
    await ctx.encerrar();
  });

  it("múltiplas conexões de A digitando: para só quando a última para; nada fica preso", async () => {
    const ctx = await prepararAB();
    await informarDigitando(ctx.a1, { conversaId: conversaAB, digitando: true });
    await informarDigitando(ctx.a2, { conversaId: conversaAB, digitando: true });
    await informarDigitando(ctx.a1, { conversaId: conversaAB, digitando: false });
    await esperar(150);
    assert.deepEqual(ctx.emB, [digitandoDe(A, conversaAB, true)], "outra aba de A ainda digita");
    await desconectar(ctx.a2);
    await aguardarAte(() => ctx.emB.length === 2);
    assert.deepEqual(ctx.emB.at(-1), digitandoDe(A, conversaAB, false));
    await esperar(VALIDADE_DIGITANDO_MS + 200);
    assert.equal(ctx.emB.length, 2);
    await ctx.encerrar();
  });

  it("throttle: dezenas de avisos seguidos viram um único evento; validade encerra quando o aviso final não chega", async () => {
    const ctx = await prepararAB();
    await Promise.all(Array.from({ length: 40 }, () => informarDigitando(ctx.a1, { conversaId: conversaAB, digitando: true })));
    await aguardarAte(() => ctx.emB.length >= 1);
    await esperar(100);
    assert.deepEqual(ctx.emB, [digitandoDe(A, conversaAB, true)]);

    // Nenhum aviso final: o servidor encerra sozinho após a validade.
    await aguardarAte(() => ctx.emB.length === 2, VALIDADE_DIGITANDO_MS + 1000);
    assert.deepEqual(ctx.emB.at(-1), digitandoDe(A, conversaAB, false));
    await ctx.encerrar();
  });

  it("C não emite digitando em A↔B; digitando exige observar antes; payload inválido é recusado", async () => {
    const ctx = await prepararAB();
    const c1 = await conectar(C);
    assert.deepEqual(await informarDigitando(c1, { conversaId: conversaAB, digitando: true, identidadeId: A.identidadeId }), {
      ok: false,
      codigo: "CONVERSA_NAO_ENCONTRADA",
    });
    assert.equal((await observar(c1, { conversaId: conversaAB })).ok, false);
    assert.equal((await informarDigitando(c1, { conversaId: conversaAB, digitando: true })).ok, false);

    // B conectado sem observar ainda: não pode informar digitando.
    assert.deepEqual(await informarDigitando(ctx.bLista, { conversaId: conversaAB, digitando: true }), {
      ok: false,
      codigo: "CONVERSA_NAO_ENCONTRADA",
    });
    for (const invalido of [{ conversaId: conversaAB }, { conversaId: conversaAB, digitando: "sim" }, { digitando: true }, null]) {
      assert.deepEqual(await informarDigitando(ctx.a1, invalido), { ok: false, codigo: "DADOS_INVALIDOS" });
    }
    // Evento sem acknowledgement também é tratado com segurança.
    c1.emit(EVENTO_DIGITANDO_INFORMAR, { conversaId: conversaAB, digitando: true });

    await esperar(200);
    assert.deepEqual([...ctx.emB, ...ctx.emA1, ...ctx.emA2], []);
    await desconectar(c1);
    await ctx.encerrar();
  });

  it("identidade informada no payload é ignorada: o evento sai com a identidade do handshake", async () => {
    const ctx = await prepararAB();
    await informarDigitando(ctx.b1, { conversaId: conversaAB, digitando: true, identidadeId: C.identidadeId });
    await aguardarAte(() => ctx.emA1.length === 1 && ctx.emA2.length === 1);
    assert.deepEqual(ctx.emA1, [digitandoDe(B, conversaAB, true)]);
    await ctx.encerrar();
  });
});
