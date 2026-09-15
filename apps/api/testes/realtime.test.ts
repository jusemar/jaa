import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { criarConexaoBanco } from "@jaa/banco";
import { identidades, rateLimits, sessions, users, verifications } from "@jaa/banco/schema";
import { betterAuth } from "better-auth";
import { testUtils } from "better-auth/plugins";
import { eq, inArray, like } from "drizzle-orm";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { io, type Socket } from "socket.io-client";
import { criarAplicacao } from "../src/aplicacao.js";
import { criarOpcoesAutenticacao } from "../src/features/autenticacao/autenticacao.js";
import { criarAvisoSessoesEncerradas } from "../src/features/autenticacao/lib/sessoes-encerradas.js";
import { carregarAmbiente } from "../src/lib/ambiente.js";
import { configurarRealtime } from "../src/realtime/configurar-realtime.js";
import type { ServidorRealtime } from "../src/realtime/tipos.js";

/*
 * Teste de integração REAL do realtime: servidor HTTP escutando numa porta, Socket.IO,
 * Better Auth e PostgreSQL local; clientes com socket.io-client.
 * OTP capturado pelo utilitário oficial testUtils. Telefones e IPs reservados, limpos ao final.
 */

const ORIGEM_WEB = "http://localhost:3000";
const PREFIXO_IP_TESTE = "203.0.113."; // TEST-NET-3 (RFC 5737)
const COOKIE_SESSAO = "better-auth.session_token";

const TELEFONES_TESTE = Array.from({ length: 4 }, (_, i) => `+55319876501${String(i + 1).padStart(2, "0")}`);
const [TEL_COMPLETO, TEL_INCOMPLETO] = TELEFONES_TESTE as [string, string, ...string[]];

const ambiente = carregarAmbiente();
const conexao = criarConexaoBanco(ambiente.DATABASE_URL);
const { banco } = conexao;

const sessoesEncerradas = criarAvisoSessoesEncerradas();
const opcoes = criarOpcoesAutenticacao({
  banco,
  ambiente,
  entregadorOtp: { enviar: async () => {} },
  sessoesEncerradas,
});
const autenticacao = betterAuth({
  ...opcoes,
  plugins: [...opcoes.plugins, testUtils({ captureOTP: true })],
});

// Logs reais da API capturados para verificar que nada sensível vaza.
const logs: string[] = [];
const valoresSensiveis: string[] = [ambiente.BETTER_AUTH_SECRET, ...TELEFONES_TESTE];

let app: FastifyInstance;
let realtime: ServidorRealtime;
let porta = 0;
const clientes: Socket[] = [];

async function iniciarServidor() {
  app = await criarAplicacao({
    ambiente,
    banco,
    autenticacao,
    logger: { level: "info", stream: { write: (linha: string) => void logs.push(linha) } },
  });
  realtime = configurarRealtime(app, {
    autenticacao,
    banco,
    sessoesEncerradas,
    origensPermitidas: ambiente.ORIGENS_WEB_PERMITIDAS,
  });
  await app.listen({ port: porta, host: "127.0.0.1" });
  porta = (app.server.address() as AddressInfo).port;
}

function requisitar(opcoesRequisicao: { metodo: "GET" | "POST"; url: string; ip: string; corpo?: unknown; cookie?: string }) {
  return app.inject({
    method: opcoesRequisicao.metodo,
    url: opcoesRequisicao.url,
    remoteAddress: opcoesRequisicao.ip,
    headers: {
      origin: ORIGEM_WEB,
      ...(opcoesRequisicao.corpo !== undefined ? { "content-type": "application/json" } : {}),
      ...(opcoesRequisicao.cookie ? { cookie: opcoesRequisicao.cookie } : {}),
    },
    ...(opcoesRequisicao.corpo !== undefined ? { payload: JSON.stringify(opcoesRequisicao.corpo) } : {}),
  });
}

function extrairCookieSessao(resposta: LightMyRequestResponse): string {
  const cookie = resposta.cookies.find((c) => c.name === COOKIE_SESSAO);
  assert.ok(cookie?.value, "cookie de sessão ausente");
  valoresSensiveis.push(cookie.value, decodeURIComponent(cookie.value).split(".")[0] ?? cookie.value);
  return `${cookie.name}=${cookie.value}`;
}

async function entrar(telefone: string, ip: string) {
  assert.equal((await requisitar({ metodo: "POST", url: "/api/auth/phone-number/send-otp", ip, corpo: { phoneNumber: telefone } })).statusCode, 200);
  const codigo = (await autenticacao.$context).test.getOTP?.(telefone);
  assert.ok(codigo);
  valoresSensiveis.push(codigo);
  const verificacao = await requisitar({ metodo: "POST", url: "/api/auth/phone-number/verify", ip, corpo: { phoneNumber: telefone, code: codigo } });
  assert.equal(verificacao.statusCode, 200, verificacao.body);
  const cookie = extrairCookieSessao(verificacao);
  const sessao = (await requisitar({ metodo: "GET", url: "/api/auth/get-session", ip, cookie })).json();
  return { cookie, usuarioId: sessao.user.id as string, sessaoId: sessao.session.id as string };
}

function criarCliente(
  opcoesCliente: {
    cookie?: string;
    origem?: string;
    reconectar?: boolean;
    auth?: Record<string, string>;
    query?: Record<string, string>;
    cabecalhos?: Record<string, string>;
  } = {},
): Socket {
  const socket = io(`http://127.0.0.1:${porta}`, {
    forceNew: true,
    autoConnect: false,
    reconnection: opcoesCliente.reconectar ?? false,
    reconnectionDelay: 100,
    reconnectionDelayMax: 200,
    extraHeaders: {
      origin: opcoesCliente.origem ?? ORIGEM_WEB,
      ...(opcoesCliente.cookie ? { cookie: opcoesCliente.cookie } : {}),
      ...opcoesCliente.cabecalhos,
    },
    ...(opcoesCliente.auth ? { auth: opcoesCliente.auth } : {}),
    ...(opcoesCliente.query ? { query: opcoesCliente.query } : {}),
  });
  clientes.push(socket);
  return socket;
}

type ResultadoConexao = { conectado: true } | { conectado: false; erro: Error & { data?: unknown } };

function aguardarResultadoConexao(socket: Socket, limiteMs = 5000): Promise<ResultadoConexao> {
  return new Promise((resolver, rejeitar) => {
    const temporizador = setTimeout(() => {
      limpar();
      rejeitar(new Error("tempo esgotado aguardando conexão"));
    }, limiteMs);
    const aoConectar = () => {
      limpar();
      resolver({ conectado: true });
    };
    const aoFalhar = (erro: Error & { data?: unknown }) => {
      limpar();
      resolver({ conectado: false, erro });
    };
    const limpar = () => {
      clearTimeout(temporizador);
      socket.off("connect", aoConectar);
      socket.off("connect_error", aoFalhar);
    };
    socket.on("connect", aoConectar);
    socket.on("connect_error", aoFalhar);
  });
}

function conectar(socket: Socket) {
  const resultado = aguardarResultadoConexao(socket);
  socket.connect();
  return resultado;
}

function aguardarDesconexao(socket: Socket, limiteMs = 3000): Promise<string> {
  return new Promise((resolver, rejeitar) => {
    const temporizador = setTimeout(() => rejeitar(new Error("socket não foi desconectado")), limiteMs);
    socket.once("disconnect", (motivo) => {
      clearTimeout(temporizador);
      resolver(motivo);
    });
  });
}

async function contextoNoServidor(socket: Socket) {
  const sockets = await realtime.fetchSockets();
  return sockets.find((s) => s.id === socket.id)?.data.contexto;
}

function assertRecusadaCom(resultado: ResultadoConexao, codigo: string) {
  assert.equal(resultado.conectado, false);
  if (resultado.conectado) return;
  assert.equal(resultado.erro.message, codigo);
  const dados = resultado.erro.data as Record<string, unknown>;
  assert.deepEqual(Object.keys(dados).sort(), ["codigo", "mensagem"]);
  assert.equal(dados.codigo, codigo);
}

async function limparDadosDeTeste() {
  const usuariosTeste = banco.select({ id: users.id }).from(users).where(inArray(users.phoneNumber, TELEFONES_TESTE));
  await banco.delete(identidades).where(inArray(identidades.usuarioId, usuariosTeste));
  await banco.delete(users).where(inArray(users.phoneNumber, TELEFONES_TESTE));
  await banco.delete(verifications).where(inArray(verifications.identifier, TELEFONES_TESTE));
  await banco.delete(rateLimits).where(like(rateLimits.key, `${PREFIXO_IP_TESTE}%`));
}

let contaCompleta: { cookie: string; usuarioId: string; sessaoId: string; identidadeId: string };

before(async () => {
  await limparDadosDeTeste();
  await iniciarServidor();

  const login = await entrar(TEL_COMPLETO, `${PREFIXO_IP_TESTE}1`);
  const criacao = await requisitar({
    metodo: "POST",
    url: "/identidades/pessoal",
    ip: `${PREFIXO_IP_TESTE}1`,
    cookie: login.cookie,
    corpo: { nomeExibicao: "Realtime Teste", nomeUsuario: "realtime_teste" },
  });
  assert.equal(criacao.statusCode, 201, criacao.body);
  contaCompleta = { ...login, identidadeId: criacao.json().id };
});

after(async () => {
  for (const cliente of clientes) cliente.disconnect();
  await app.close();
  await limparDadosDeTeste();
  await conexao.encerrar();
});

describe("handshake realtime", () => {
  it("sem cookie/sessão → recusada com NAO_AUTENTICADO", async () => {
    assertRecusadaCom(await conectar(criarCliente()), "NAO_AUTENTICADO");
  });

  it("cookie inválido → recusada com NAO_AUTENTICADO", async () => {
    const resultado = await conectar(criarCliente({ cookie: `${COOKIE_SESSAO}=invalido.assinatura-falsa` }));
    assertRecusadaCom(resultado, "NAO_AUTENTICADO");
  });

  it("origem de navegador não permitida → recusada antes de qualquer validação", async () => {
    const resultado = await conectar(criarCliente({ cookie: contaCompleta.cookie, origem: "https://site-malicioso.example" }));
    assert.equal(resultado.conectado, false);
  });

  it("sessão válida sem identidade pessoal → recusada com CADASTRO_INCOMPLETO", async () => {
    const incompleta = await entrar(TEL_INCOMPLETO, `${PREFIXO_IP_TESTE}2`);
    assertRecusadaCom(await conectar(criarCliente({ cookie: incompleta.cookie })), "CADASTRO_INCOMPLETO");
    assert.equal((await realtime.fetchSockets()).length, 0);
  });

  it("sessão válida + identidade → aceita, com contexto resolvido pelo servidor", async () => {
    const socket = criarCliente({ cookie: contaCompleta.cookie });
    assert.deepEqual(await conectar(socket), { conectado: true });
    assert.deepEqual(await contextoNoServidor(socket), {
      usuarioId: contaCompleta.usuarioId,
      identidadeId: contaCompleta.identidadeId,
      sessaoId: contaCompleta.sessaoId,
    });
    socket.disconnect();
  });

  it("IDs falsos enviados pelo cliente (auth, query e cabeçalhos) são ignorados", async () => {
    const falsos = { usuarioId: "usuario-falso", identidadeId: "00000000-0000-0000-0000-000000000000", sessaoId: "sessao-falsa" };
    const socket = criarCliente({
      cookie: contaCompleta.cookie,
      auth: falsos,
      query: falsos,
      cabecalhos: { "x-usuario-id": falsos.usuarioId, "x-identidade-id": falsos.identidadeId },
    });
    assert.deepEqual(await conectar(socket), { conectado: true });
    const contexto = await contextoNoServidor(socket);
    assert.equal(contexto?.usuarioId, contaCompleta.usuarioId);
    assert.equal(contexto?.identidadeId, contaCompleta.identidadeId);
    assert.equal(contexto?.sessaoId, contaCompleta.sessaoId);
    socket.disconnect();
  });

  it("reload (nova conexão com a mesma sessão) continua funcionando", async () => {
    const primeira = criarCliente({ cookie: contaCompleta.cookie });
    assert.deepEqual(await conectar(primeira), { conectado: true });
    const idAnterior = primeira.id;
    primeira.disconnect();

    const aposReload = criarCliente({ cookie: contaCompleta.cookie });
    assert.deepEqual(await conectar(aposReload), { conectado: true });
    assert.notEqual(aposReload.id, idAnterior);
    assert.equal((await contextoNoServidor(aposReload))?.identidadeId, contaCompleta.identidadeId);
    aposReload.disconnect();
  });
});

describe("queda e retorno da API", () => {
  it("reconecta sozinho e passa por nova autenticação no handshake", async () => {
    const socket = criarCliente({ cookie: contaCompleta.cookie, reconectar: true });
    assert.deepEqual(await conectar(socket), { conectado: true });

    const desconexao = aguardarDesconexao(socket);
    await app.close();
    assert.equal(await desconexao, "transport close");
    assert.equal(socket.active, true, "cliente deve continuar tentando reconectar");

    const reconexao = aguardarResultadoConexao(socket, 8000);
    await iniciarServidor(); // instância nova: nenhum estado em memória da conexão anterior
    assert.deepEqual(await reconexao, { conectado: true });
    assert.equal((await contextoNoServidor(socket))?.identidadeId, contaCompleta.identidadeId);
    socket.disconnect();
  });

  it("se a sessão deixou de existir durante a queda, a reconexão é recusada", async () => {
    const temporaria = await entrar(TEL_COMPLETO, `${PREFIXO_IP_TESTE}3`);
    const socket = criarCliente({ cookie: temporaria.cookie, reconectar: true });
    assert.deepEqual(await conectar(socket), { conectado: true });

    const desconexao = aguardarDesconexao(socket);
    await app.close();
    await desconexao;
    // API fora do ar: a sessão some sem passar pela API (ex.: expirada/removida).
    await banco.delete(sessions).where(eq(sessions.id, temporaria.sessaoId));

    const reconexao = aguardarResultadoConexao(socket, 8000);
    await iniciarServidor();
    assertRecusadaCom(await reconexao, "NAO_AUTENTICADO");
    assert.equal(socket.active, false, "após recusa do handshake o cliente não insiste");
  });
});

describe("logout", () => {
  it("desconecta imediatamente o socket da sessão encerrada; reconexão é recusada; novo login conecta", async () => {
    const login = await entrar(TEL_COMPLETO, `${PREFIXO_IP_TESTE}4`);
    const socket = criarCliente({ cookie: login.cookie });
    assert.deepEqual(await conectar(socket), { conectado: true });

    const desconexao = aguardarDesconexao(socket, 1500);
    const saida = await requisitar({ metodo: "POST", url: "/api/auth/sign-out", ip: `${PREFIXO_IP_TESTE}4`, cookie: login.cookie, corpo: {} });
    assert.equal(saida.statusCode, 200);
    assert.equal(await desconexao, "io server disconnect");

    assertRecusadaCom(await conectar(socket), "NAO_AUTENTICADO");

    const novoLogin = await entrar(TEL_COMPLETO, `${PREFIXO_IP_TESTE}4`);
    const novoSocket = criarCliente({ cookie: novoLogin.cookie });
    assert.deepEqual(await conectar(novoSocket), { conectado: true });
    assert.equal((await contextoNoServidor(novoSocket))?.sessaoId, novoLogin.sessaoId);
    novoSocket.disconnect();
  });

  it("com duas sessões do mesmo usuário, logout de uma não derruba a outra", async () => {
    const sessaoA = await entrar(TEL_COMPLETO, `${PREFIXO_IP_TESTE}5`); // ex.: celular
    const sessaoB = await entrar(TEL_COMPLETO, `${PREFIXO_IP_TESTE}6`); // ex.: web
    assert.notEqual(sessaoA.sessaoId, sessaoB.sessaoId);
    assert.equal(sessaoA.usuarioId, sessaoB.usuarioId);

    const socketA = criarCliente({ cookie: sessaoA.cookie });
    const socketB = criarCliente({ cookie: sessaoB.cookie });
    assert.deepEqual(await conectar(socketA), { conectado: true });
    assert.deepEqual(await conectar(socketB), { conectado: true });

    const desconexaoB = aguardarDesconexao(socketB, 1500);
    await requisitar({ metodo: "POST", url: "/api/auth/sign-out", ip: `${PREFIXO_IP_TESTE}6`, cookie: sessaoB.cookie, corpo: {} });
    assert.equal(await desconexaoB, "io server disconnect");

    await new Promise((r) => setTimeout(r, 500));
    assert.equal(socketA.connected, true, "sessão A não pode ser derrubada");
    const restantes = (await realtime.fetchSockets()).map((s) => s.data.contexto.sessaoId);
    assert.deepEqual(restantes, [sessaoA.sessaoId]);
    socketA.disconnect();
  });
});

describe("vazamento de dados sensíveis", () => {
  it("logs da API não contêm cookie, token, telefone, OTP ou segredo", () => {
    const texto = logs.join("\n");
    assert.ok(texto.includes("Conexão realtime recusada"), "logs de realtime devem ter sido capturados");
    assert.ok(!texto.includes(COOKIE_SESSAO), "nome do cookie de sessão apareceu no log");
    for (const valor of valoresSensiveis) {
      assert.ok(!texto.includes(valor), `valor sensível apareceu no log: ${valor.slice(0, 4)}…`);
    }
    // Telefone também em forma nacional.
    for (const telefone of TELEFONES_TESTE) {
      assert.ok(!texto.includes(telefone.slice(3)), "telefone (forma nacional) apareceu no log");
    }
  });
});
