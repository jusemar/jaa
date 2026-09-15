import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { criarConexaoBanco } from "@jaa/banco";
import {
  conversas,
  identidades,
  mensagens,
  participantesConversa,
  rateLimits,
  users,
  verifications,
} from "@jaa/banco/schema";
import { EVENTO_MENSAGEM_NOVA, type EventoMensagemNova, type Mensagem } from "@jaa/contratos";
import { betterAuth } from "better-auth";
import { testUtils } from "better-auth/plugins";
import { and, asc, count, eq, inArray, like } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { io, type Socket } from "socket.io-client";
import { criarAplicacao } from "../src/aplicacao.js";
import { criarOpcoesAutenticacao } from "../src/features/autenticacao/autenticacao.js";
import { criarAvisoSessoesEncerradas } from "../src/features/autenticacao/lib/sessoes-encerradas.js";
import { enviarMensagemTexto } from "../src/features/mensagens/casos-de-uso/enviar-mensagem-texto.js";
import { criarCanalEventosMensagens } from "../src/features/mensagens/lib/eventos-mensagens.js";
import { carregarAmbiente } from "../src/lib/ambiente.js";
import { configurarRealtime } from "../src/realtime/configurar-realtime.js";

/*
 * Integração REAL de conversas 1:1 e mensagens: HTTP (Fastify), Better Auth, PostgreSQL local
 * e Socket.IO escutando numa porta, com clientes socket.io-client. OTP via testUtils oficial.
 * Telefones e IPs reservados; todos os dados criados são removidos ao final.
 */

const ORIGEM_WEB = "http://localhost:3000";
const PREFIXO_IP_TESTE = "192.0.2."; // TEST-NET-1 (RFC 5737)
const TELEFONES_TESTE = ["+5531987650201", "+5531987650202", "+5531987650203"];

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
  nomeUsuario: string;
  ip: string;
}
let A: Pessoa;
let B: Pessoa;
let C: Pessoa;
let conversaAB = "";

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
  const semSessao: Pessoa = { cookie: "", identidadeId: "", nomeUsuario, ip };
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

function enviar(pessoa: Pessoa, conversaId: string, conteudo: string, idCliente: string = randomUUID(), extras: Record<string, unknown> = {}) {
  return api(pessoa, "POST", `/conversas/${conversaId}/mensagens`, { idCliente, conteudo, ...extras });
}

async function conectar(pessoa: Pessoa): Promise<Socket> {
  const socket = io(`http://127.0.0.1:${porta}`, {
    forceNew: true,
    reconnection: false,
    extraHeaders: { origin: ORIGEM_WEB, cookie: pessoa.cookie },
  });
  clientes.push(socket);
  await new Promise<void>((resolver, rejeitar) => {
    socket.once("connect", () => resolver());
    socket.once("connect_error", rejeitar);
  });
  return socket;
}

function coletarEventos(socket: Socket): EventoMensagemNova[] {
  const recebidos: EventoMensagemNova[] = [];
  socket.on(EVENTO_MENSAGEM_NOVA, (evento: EventoMensagemNova) => recebidos.push(evento));
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
  await banco.delete(mensagens).where(inArray(mensagens.conversaId, conversasTeste));
  await banco.delete(conversas).where(inArray(conversas.id, conversasTeste)); // participantes em cascata
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

  A = await criarPessoa(TELEFONES_TESTE[0] as string, "msg_a", `${PREFIXO_IP_TESTE}1`);
  B = await criarPessoa(TELEFONES_TESTE[1] as string, "msg_b", `${PREFIXO_IP_TESTE}2`);
  C = await criarPessoa(TELEFONES_TESTE[2] as string, "msg_c", `${PREFIXO_IP_TESTE}3`);
});

after(async () => {
  for (const cliente of clientes) cliente.disconnect();
  await app.close();
  await limparDadosDeTeste();
  await conexao.encerrar();
});

describe("conversa direta 1:1", () => {
  it("A inicia conversa com B pelo @usuario", async () => {
    const resposta = await api(A, "POST", "/conversas/diretas", { nomeUsuario: "@msg_b" });
    assert.equal(resposta.statusCode, 201, resposta.body);
    const conversa = resposta.json();
    assert.equal(conversa.tipo, "direta");
    assert.deepEqual(
      conversa.participantes.map((p: { identidadeId: string }) => p.identidadeId).sort(),
      [A.identidadeId, B.identidadeId].sort(),
    );
    conversaAB = conversa.id;
  });

  it("B inicia com A (e variações de maiúsculas) e recebe a mesma conversa", async () => {
    for (const [pessoa, destino] of [[B, "msg_a"], [A, "MSG_B"]] as const) {
      const resposta = await api(pessoa, "POST", "/conversas/diretas", { nomeUsuario: destino });
      assert.equal(resposta.statusCode, 200);
      assert.equal(resposta.json().id, conversaAB);
    }
  });

  it("criação concorrente B↔C não duplica a conversa", async () => {
    const respostas = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        i % 2 === 0 ? api(B, "POST", "/conversas/diretas", { nomeUsuario: "msg_c" }) : api(C, "POST", "/conversas/diretas", { nomeUsuario: "msg_b" }),
      ),
    );
    const ids = new Set(respostas.map((r) => r.json().id));
    assert.equal(ids.size, 1);
    assert.equal(respostas.filter((r) => r.statusCode === 201).length, 1);
    const conversaBC = [...ids][0] as string;
    const [participantes] = await banco
      .select({ total: count() })
      .from(participantesConversa)
      .where(eq(participantesConversa.conversaId, conversaBC));
    assert.equal(participantes?.total, 2);
  });

  it("A não conversa consigo mesmo; destino inexistente; sem sessão", async () => {
    const consigoMesmo = await api(A, "POST", "/conversas/diretas", { nomeUsuario: "msg_a" });
    assert.equal(consigoMesmo.statusCode, 400);
    assert.equal(consigoMesmo.json().codigo, "CONVERSA_CONSIGO_MESMO");

    const inexistente = await api(A, "POST", "/conversas/diretas", { nomeUsuario: "ninguem_com_este_nome" });
    assert.equal(inexistente.statusCode, 404);
    assert.equal(inexistente.json().codigo, "IDENTIDADE_NAO_ENCONTRADA");

    assert.equal((await api(null, "POST", "/conversas/diretas", { nomeUsuario: "msg_b" })).statusCode, 401);
  });
});

describe("envio e entrega realtime", () => {
  it("A envia; mensagem é persistida ANTES da emissão; B (duas conexões) e as outras abas de A recebem; C não", async () => {
    const [b1, b2, a1, c1] = await Promise.all([conectar(B), conectar(B), conectar(A), conectar(C)]);
    const eventosB1 = coletarEventos(b1);
    const eventosB2 = coletarEventos(b2);
    const eventosA1 = coletarEventos(a1);
    const eventosC1 = coletarEventos(c1);

    let persistidaQuandoRecebida: boolean | null = null;
    b1.once(EVENTO_MENSAGEM_NOVA, (evento: EventoMensagemNova) => {
      void banco
        .select({ id: mensagens.id })
        .from(mensagens)
        .where(eq(mensagens.id, evento.mensagem.id))
        .then((linhas) => {
          persistidaQuandoRecebida = linhas.length === 1;
        });
    });

    const resposta = await enviar(A, conversaAB, "Olá B");
    assert.equal(resposta.statusCode, 201, resposta.body);
    const mensagem: Mensagem = resposta.json();
    assert.equal(mensagem.remetenteIdentidadeId, A.identidadeId);
    assert.equal(mensagem.conteudo, "Olá B");

    await aguardarAte(() => eventosB1.length === 1 && eventosB2.length === 1 && eventosA1.length === 1 && persistidaQuandoRecebida !== null);
    assert.equal(persistidaQuandoRecebida, true);
    assert.deepEqual(eventosB1[0]?.mensagem, mensagem);
    assert.deepEqual(eventosB2[0]?.mensagem, mensagem);
    await esperar(300);
    assert.equal(eventosC1.length, 0, "terceiro não pode receber mensagens da conversa A↔B");

    for (const socket of [b1, b2, a1, c1]) socket.disconnect();
  });

  it("cliente não consegue falsificar o remetente", async () => {
    const resposta = await enviar(A, conversaAB, "tentativa de impersonação", randomUUID(), {
      remetenteIdentidadeId: B.identidadeId,
      conversaId: randomUUID(),
    });
    assert.equal(resposta.statusCode, 201);
    assert.equal(resposta.json().remetenteIdentidadeId, A.identidadeId);
    const [linha] = await banco.select().from(mensagens).where(eq(mensagens.id, resposta.json().id));
    assert.equal(linha?.remetenteIdentidadeId, A.identidadeId);
    assert.equal(linha?.conversaId, conversaAB);
  });

  it("conteúdo vazio, só espaços, acima do limite ou sem idCliente é recusado", async () => {
    for (const conteudo of ["", "   ", "\n\t ", "x".repeat(4001)]) {
      const resposta = await enviar(A, conversaAB, conteudo);
      assert.equal(resposta.statusCode, 400, JSON.stringify(conteudo).slice(0, 20));
      assert.equal(resposta.json().codigo, "DADOS_INVALIDOS");
    }
    assert.equal((await enviar(A, conversaAB, "x".repeat(4000))).statusCode, 201);
    assert.equal((await api(A, "POST", `/conversas/${conversaAB}/mensagens`, { conteudo: "sem idCliente" })).statusCode, 400);
  });

  it("se o banco recusar a mensagem, nada é emitido", async () => {
    const canal = criarCanalEventosMensagens();
    let emitidos = 0;
    canal.inscrever(() => {
      emitidos += 1;
    });
    // Chamada direta ao caso de uso com conteúdo que o banco recusa (CHECK), simulando falha de persistência.
    await assert.rejects(enviarMensagemTexto({ banco, eventosMensagens: canal }, A.identidadeId, conversaAB, { idCliente: randomUUID(), conteudo: "   " }));
    assert.equal(emitidos, 0);
  });
});

describe("destinatário offline e histórico", () => {
  it("B offline: mensagem persiste; B volta e recupera pelo histórico; A também lê", async () => {
    const resposta = await enviar(A, conversaAB, "Mensagem enquanto B estava offline");
    assert.equal(resposta.statusCode, 201);
    const id = resposta.json().id;
    const [linha] = await banco.select().from(mensagens).where(eq(mensagens.id, id));
    assert.equal(linha?.conteudo, "Mensagem enquanto B estava offline");

    const socketB = await conectar(B); // B volta
    const historicoB = await api(B, "GET", `/conversas/${conversaAB}/mensagens`);
    assert.equal(historicoB.statusCode, 200);
    assert.ok(historicoB.json().mensagens.some((m: Mensagem) => m.id === id));

    const historicoA = await api(A, "GET", `/conversas/${conversaAB}/mensagens`);
    assert.deepEqual(historicoA.json(), historicoB.json());
    socketB.disconnect();
  });
});

describe("autorização contra terceiros", () => {
  it("C não lê nem envia na conversa A↔B; ids inexistentes ou inválidos não revelam nada", async () => {
    const antes = await contarMensagens(conversaAB);

    const leitura = await api(C, "GET", `/conversas/${conversaAB}/mensagens`);
    assert.equal(leitura.statusCode, 404);
    assert.equal(leitura.json().codigo, "CONVERSA_NAO_ENCONTRADA");

    const escrita = await enviar(C, conversaAB, "intrusão");
    assert.equal(escrita.statusCode, 404);
    assert.equal(await contarMensagens(conversaAB), antes);

    assert.equal((await api(C, "GET", `/conversas/${randomUUID()}/mensagens`)).statusCode, 404);
    assert.equal((await api(C, "GET", "/conversas/nao-e-uuid/mensagens")).statusCode, 400);
    assert.equal((await api(null, "GET", `/conversas/${conversaAB}/mensagens`)).statusCode, 401);
  });
});

describe("idempotência de envio", () => {
  it("retry com o mesmo idCliente não duplica mensagem nem evento", async () => {
    const socketB = await conectar(B);
    const eventosB = coletarEventos(socketB);
    const idCliente = randomUUID();

    const primeira = await enviar(A, conversaAB, "retry", idCliente);
    const retry = await enviar(A, conversaAB, "retry", idCliente);
    assert.equal(primeira.statusCode, 201);
    assert.equal(retry.statusCode, 200);
    assert.equal(retry.json().id, primeira.json().id);

    const simultaneos = await Promise.all(Array.from({ length: 6 }, () => enviar(A, conversaAB, "retry", idCliente)));
    assert.ok(simultaneos.every((r) => r.statusCode === 200 && r.json().id === primeira.json().id));

    const [linhas] = await banco
      .select({ total: count() })
      .from(mensagens)
      .where(and(eq(mensagens.remetenteIdentidadeId, A.identidadeId), eq(mensagens.idCliente, idCliente)));
    assert.equal(linhas?.total, 1);

    await esperar(300);
    assert.equal(eventosB.filter((e) => e.mensagem.id === primeira.json().id).length, 1);
    socketB.disconnect();
  });

  it("mesmo idCliente com outro conteúdo é recusado; o escopo do idCliente é o remetente", async () => {
    const idCliente = randomUUID();
    assert.equal((await enviar(A, conversaAB, "original", idCliente)).statusCode, 201);
    const reutilizado = await enviar(A, conversaAB, "diferente", idCliente);
    assert.equal(reutilizado.statusCode, 409);
    assert.equal(reutilizado.json().codigo, "ID_CLIENTE_REUTILIZADO");
    assert.equal((await enviar(B, conversaAB, "original", idCliente)).statusCode, 201);
  });
});

describe("paginação do histórico", () => {
  it("percorre todas as mensagens por cursor, sem duplicar nem perder, em ordem determinística", async () => {
    for (let i = 1; i <= 25; i++) {
      assert.equal((await enviar(i % 2 ? A : B, conversaAB, `paginação ${i}`)).statusCode, 201);
    }

    const noBanco = await banco
      .select({ id: mensagens.id })
      .from(mensagens)
      .where(eq(mensagens.conversaId, conversaAB))
      .orderBy(asc(mensagens.id));

    const percorrer = async () => {
      const coletadas: string[] = [];
      let cursor: string | null = null;
      do {
        const url: string = `/conversas/${conversaAB}/mensagens?limite=7${cursor ? `&antesDe=${cursor}` : ""}`;
        const pagina = (await api(B, "GET", url)).json();
        assert.ok(pagina.mensagens.length <= 7);
        coletadas.unshift(...pagina.mensagens.map((m: Mensagem) => m.id));
        cursor = pagina.proximoCursor;
      } while (cursor);
      return coletadas;
    };

    const primeiraVolta = await percorrer();
    assert.equal(new Set(primeiraVolta).size, primeiraVolta.length, "página duplicou mensagem");
    assert.deepEqual(primeiraVolta, noBanco.map((m) => m.id), "página perdeu ou desordenou mensagens");
    assert.deepEqual(await percorrer(), primeiraVolta, "ordem não é determinística");

    const ultimaPagina = (await api(A, "GET", `/conversas/${conversaAB}/mensagens?limite=5`)).json();
    assert.deepEqual(ultimaPagina.mensagens.map((m: Mensagem) => m.conteudo), [21, 22, 23, 24, 25].map((i) => `paginação ${i}`));
  });

  it("limite e cursor inválidos são recusados", async () => {
    for (const consulta of ["limite=0", "limite=101", "antesDe=abc"]) {
      assert.equal((await api(A, "GET", `/conversas/${conversaAB}/mensagens?${consulta}`)).statusCode, 400);
    }
  });
});
