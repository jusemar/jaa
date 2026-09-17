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
  sessions,
  users,
  verifications,
} from "@jaa/banco/schema";
import {
  EVENTO_MENSAGEM_NOVA,
  paginaConversasSchema,
  type EventoMensagemNova,
  type ItemListaConversas,
  type Mensagem,
  type PaginaConversas,
} from "@jaa/contratos";
import { betterAuth } from "better-auth";
import { testUtils } from "better-auth/plugins";
import { desc, eq, inArray, like, or } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { io, type Socket } from "socket.io-client";
import { criarAplicacao } from "../src/aplicacao.js";
import { criarOpcoesAutenticacao } from "../src/features/autenticacao/autenticacao.js";
import { criarAvisoSessoesEncerradas } from "../src/features/autenticacao/lib/sessoes-encerradas.js";
import { criarCanalEventosMensagens } from "../src/features/mensagens/lib/eventos-mensagens.js";
import { carregarAmbiente } from "../src/lib/ambiente.js";
import { configurarRealtime } from "../src/realtime/configurar-realtime.js";

/*
 * Integração REAL da lista de conversas: HTTP (Fastify), Better Auth, PostgreSQL local e Socket.IO
 * escutando numa porta. Pessoas principais autenticam por OTP (testUtils oficial); as identidades
 * extras da paginação são inseridas direto no banco (só servem de destino das conversas).
 * Telefones, IPs e ids reservados a este arquivo; todos os dados criados são removidos ao final.
 */

const ORIGEM_WEB = "http://localhost:3000";
const PREFIXO_IP_TESTE = "198.18.0."; // RFC 2544 (reservado para testes)
const TELEFONES_TESTE = ["+5531987650301", "+5531987650302", "+5531987650303", "+5531987650304", "+5531987650305"];
const PREFIXO_USUARIO_EXTRA = "teste-lista-conversas-";
const TOTAL_EXTRAS = 22;

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
let P: Pessoa; // dona de muitas conversas (paginação)
let conversaAB = "";
let conversaAC = "";
let conversaBC = "";

function api(pessoa: Pessoa | null, metodo: "GET" | "POST", url: string, corpo?: unknown) {
  return app.inject({
    method: metodo,
    url,
    remoteAddress: pessoa?.ip ?? `${PREFIXO_IP_TESTE}99`,
    headers: {
      origin: ORIGEM_WEB,
      ...(corpo !== undefined ? { "content-type": "application/json" } : {}),
      ...(pessoa?.cookie ? { cookie: pessoa.cookie } : {}),
    },
    ...(corpo !== undefined ? { payload: JSON.stringify(corpo) } : {}),
  });
}

async function autenticar(telefone: string, ip: string): Promise<string> {
  const semSessao: Pessoa = { cookie: "", identidadeId: "", nomeUsuario: "", ip };
  assert.equal((await api(semSessao, "POST", "/api/auth/phone-number/send-otp", { phoneNumber: telefone })).statusCode, 200);
  const codigo = (await autenticacao.$context).test.getOTP?.(telefone);
  assert.ok(codigo);
  const verificacao = await api(semSessao, "POST", "/api/auth/phone-number/verify", { phoneNumber: telefone, code: codigo });
  const cookieSessao = verificacao.cookies.find((c) => c.name === "better-auth.session_token");
  assert.ok(cookieSessao);
  return `${cookieSessao.name}=${cookieSessao.value}`;
}

async function criarPessoa(telefone: string, nomeUsuario: string, ip: string): Promise<Pessoa> {
  const pessoa: Pessoa = { cookie: await autenticar(telefone, ip), identidadeId: "", nomeUsuario, ip };
  const identidade = await api(pessoa, "POST", "/identidades/pessoal", { nomeExibicao: `Pessoa ${nomeUsuario}`, nomeUsuario });
  assert.equal(identidade.statusCode, 201, identidade.body);
  return { ...pessoa, identidadeId: identidade.json().id };
}

async function abrirConversa(pessoa: Pessoa, nomeUsuario: string): Promise<string> {
  const resposta = await api(pessoa, "POST", "/conversas/diretas", { nomeUsuario });
  assert.ok(resposta.statusCode === 201 || resposta.statusCode === 200, resposta.body);
  return resposta.json().id;
}

async function enviar(pessoa: Pessoa, conversaId: string, conteudo: string, idCliente: string = randomUUID()): Promise<Mensagem> {
  const resposta = await api(pessoa, "POST", `/conversas/${conversaId}/mensagens`, { idCliente, conteudo });
  assert.ok(resposta.statusCode === 201 || resposta.statusCode === 200, resposta.body);
  return resposta.json();
}

async function listar(pessoa: Pessoa, consulta = ""): Promise<PaginaConversas> {
  const resposta = await api(pessoa, "GET", `/conversas${consulta ? `?${consulta}` : ""}`);
  assert.equal(resposta.statusCode, 200, resposta.body);
  // A resposta precisa cumprir o contrato público.
  return paginaConversasSchema.parse(resposta.json());
}

const idsDaLista = (pagina: PaginaConversas) => pagina.conversas.map((item) => item.id);

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

// Ordem esperada calculada direto no banco, de forma independente da consulta da API.
async function ordemEsperadaNoBanco(identidadeId: string): Promise<string[]> {
  const participacoes = await banco
    .select({ conversaId: participantesConversa.conversaId })
    .from(participantesConversa)
    .where(eq(participantesConversa.identidadeId, identidadeId));
  const ultimas: { conversaId: string; id: string }[] = [];
  for (const { conversaId } of participacoes) {
    const [ultima] = await banco
      .select({ id: mensagens.id })
      .from(mensagens)
      .where(eq(mensagens.conversaId, conversaId))
      .orderBy(desc(mensagens.id))
      .limit(1);
    if (ultima) ultimas.push({ conversaId, id: ultima.id });
  }
  return ultimas.sort((a, b) => (a.id < b.id ? 1 : -1)).map((u) => u.conversaId);
}

async function limparDadosDeTeste() {
  const usuariosTeste = banco
    .select({ id: users.id })
    .from(users)
    .where(or(inArray(users.phoneNumber, TELEFONES_TESTE), like(users.id, `${PREFIXO_USUARIO_EXTRA}%`)));
  const identidadesTeste = banco.select({ id: identidades.id }).from(identidades).where(inArray(identidades.usuarioId, usuariosTeste));
  const conversasTeste = banco
    .select({ id: participantesConversa.conversaId })
    .from(participantesConversa)
    .where(inArray(participantesConversa.identidadeId, identidadesTeste));
  await banco.delete(mensagens).where(inArray(mensagens.conversaId, conversasTeste));
  await banco.delete(conversas).where(inArray(conversas.id, conversasTeste)); // participantes em cascata
  await banco.delete(identidades).where(inArray(identidades.usuarioId, usuariosTeste));
  await banco.delete(users).where(or(inArray(users.phoneNumber, TELEFONES_TESTE), like(users.id, `${PREFIXO_USUARIO_EXTRA}%`)));
  await banco.delete(verifications).where(inArray(verifications.identifier, TELEFONES_TESTE));
  await banco.delete(rateLimits).where(like(rateLimits.key, `${PREFIXO_IP_TESTE}%`));
}

before(async () => {
  await limparDadosDeTeste();
  app = await criarAplicacao({ ambiente: ambienteDoTeste, banco, autenticacao, eventosMensagens, logger: false });
  configurarRealtime(app, { autenticacao, banco, sessoesEncerradas, eventosMensagens, origensPermitidas: ambienteDoTeste.ORIGENS_WEB_PERMITIDAS });
  await app.listen({ port: 0, host: "127.0.0.1" });
  porta = (app.server.address() as AddressInfo).port;

  A = await criarPessoa(TELEFONES_TESTE[0] as string, "lst_a", `${PREFIXO_IP_TESTE}1`);
  B = await criarPessoa(TELEFONES_TESTE[1] as string, "lst_b", `${PREFIXO_IP_TESTE}2`);
  C = await criarPessoa(TELEFONES_TESTE[2] as string, "lst_c", `${PREFIXO_IP_TESTE}3`);
  P = await criarPessoa(TELEFONES_TESTE[3] as string, "lst_p", `${PREFIXO_IP_TESTE}4`);
});

after(async () => {
  for (const cliente of clientes) cliente.disconnect();
  await app.close();
  await limparDadosDeTeste();
  const restantes = await banco
    .select({ id: users.id })
    .from(users)
    .where(or(inArray(users.phoneNumber, TELEFONES_TESTE), like(users.id, `${PREFIXO_USUARIO_EXTRA}%`)));
  assert.equal(restantes.length, 0, "dados de teste não foram removidos");
  await conexao.encerrar();
});

describe("lista vazia e conversas sem atividade", () => {
  it("identidade sem conversas recebe lista vazia, sem cursor", async () => {
    assert.deepEqual(await listar(A), { conversas: [], proximoCursor: null });
  });

  it("conversa aberta sem mensagens não aparece para ninguém (não há atividade)", async () => {
    conversaAB = await abrirConversa(A, "lst_b");
    assert.deepEqual((await listar(A)).conversas, []);
    assert.deepEqual((await listar(B)).conversas, []);
  });
});

describe("conteúdo e ordem da lista", () => {
  it("A↔B com mensagem aparece para A e para B, cada um vendo a OUTRA identidade", async () => {
    const mensagem = await enviar(A, conversaAB, "Oi B");

    const [itemA] = (await listar(A)).conversas;
    const [itemB] = (await listar(B)).conversas;
    assert.deepEqual(itemA, {
      id: conversaAB,
      tipo: "direta",
      outraIdentidade: { identidadeId: B.identidadeId, tipo: "pessoal", nomeExibicao: "Pessoa lst_b", nomeUsuario: "lst_b" },
      ultimaMensagem: mensagem,
      naoLidas: 0,
    });
    assert.equal(itemB?.naoLidas, 1, "a mensagem de A é não lida para B");
    assert.deepEqual(itemB?.outraIdentidade, { identidadeId: A.identidadeId, tipo: "pessoal", nomeExibicao: "Pessoa lst_a", nomeUsuario: "lst_a" });
    assert.deepEqual(itemB?.ultimaMensagem, mensagem);
  });

  it("A com B e C: ambas aparecem e a mais recente vem primeiro", async () => {
    conversaAC = await abrirConversa(C, "lst_a");
    await enviar(C, conversaAC, "Oi A, aqui é C");

    const lista = await listar(A);
    assert.deepEqual(idsDaLista(lista), [conversaAC, conversaAB]);
    assert.deepEqual(lista.conversas.map((item) => item.outraIdentidade.nomeUsuario), ["lst_c", "lst_b"]);
  });

  it("nova mensagem na conversa de baixo a leva ao topo; última mensagem e horário são os da mensagem real", async () => {
    await enviar(B, conversaAB, "primeira de B");
    const ultima = await enviar(A, conversaAB, "segunda, agora de A");

    const lista = await listar(A);
    assert.deepEqual(idsDaLista(lista), [conversaAB, conversaAC]);
    const [topo] = lista.conversas;
    const [noBanco] = await banco.select().from(mensagens).where(eq(mensagens.id, ultima.id));
    assert.ok(noBanco);
    assert.equal(topo?.ultimaMensagem.id, noBanco.id);
    assert.equal(topo?.ultimaMensagem.conteudo, "segunda, agora de A");
    assert.equal(topo?.ultimaMensagem.remetenteIdentidadeId, A.identidadeId);
    assert.equal(topo?.ultimaMensagem.criadoEm, noBanco.criadoEm.toISOString());
    assert.deepEqual(idsDaLista(await listar(A)), await ordemEsperadaNoBanco(A.identidadeId));
  });

  it("horários iguais: ordem continua total e determinística (desempate pelo id UUIDv7)", async () => {
    // Uma transação: now() é o mesmo para todas as linhas → criado_em idêntico nas duas conversas.
    const inseridas = await banco.transaction(async (transacao) => {
      const linhas = [];
      for (const [conversaId, remetente] of [[conversaAB, B], [conversaAC, C]] as const) {
        const [linha] = await transacao
          .insert(mensagens)
          .values({ conversaId, remetenteIdentidadeId: remetente.identidadeId, idCliente: randomUUID(), tipo: "texto", conteudo: "mesmo instante" })
          .returning();
        linhas.push(linha);
      }
      return linhas;
    });
    assert.equal(inseridas[0]?.criadoEm.getTime(), inseridas[1]?.criadoEm.getTime());

    const primeira = await listar(A);
    const [topo, segundo] = primeira.conversas;
    assert.equal(topo?.ultimaMensagem.criadoEm, segundo?.ultimaMensagem.criadoEm);
    assert.ok((topo?.ultimaMensagem.id ?? "") > (segundo?.ultimaMensagem.id ?? ""));
    for (let i = 0; i < 5; i++) assert.deepEqual(await listar(A), primeira);
  });
});

describe("isolamento e privacidade", () => {
  it("A não recebe a conversa entre B e C; B vê A e C", async () => {
    conversaBC = await abrirConversa(B, "lst_c");
    await enviar(B, conversaBC, "segredo entre B e C");

    const listaA = await listar(A);
    assert.ok(!idsDaLista(listaA).includes(conversaBC));
    assert.ok(!JSON.stringify(listaA).includes("segredo entre B e C"));
    assert.deepEqual(new Set(idsDaLista(await listar(B))), new Set([conversaAB, conversaBC]));
    assert.deepEqual(new Set(idsDaLista(await listar(C))), new Set([conversaAC, conversaBC]));
  });

  it("parâmetros tentando escolher outra identidade/conta/empresa são ignorados", async () => {
    const legitima = await listar(A);
    for (const consulta of [
      `identidadeId=${B.identidadeId}`,
      `usuarioId=qualquer&empresaId=${randomUUID()}`,
      `identidade=${C.identidadeId}&remetenteIdentidadeId=${C.identidadeId}`,
    ]) {
      assert.deepEqual(await listar(A, consulta), legitima, consulta);
    }
  });

  it("cursor de mensagem de conversa alheia não revela nada: só filtra as conversas da própria identidade", async () => {
    const [ultimaBC] = await banco.select({ id: mensagens.id }).from(mensagens).where(eq(mensagens.conversaId, conversaBC)).orderBy(desc(mensagens.id)).limit(1);
    assert.ok(ultimaBC);
    const pagina = await listar(A, `antesDe=${ultimaBC.id}`);
    assert.ok(pagina.conversas.every((item) => [conversaAB, conversaAC].includes(item.id)));
  });

  it("resposta contém só os campos do contrato: sem telefone, e-mail, conta, sessão ou idCliente", async () => {
    const resposta = await api(A, "GET", "/conversas");
    const corpo = resposta.body;
    const json = resposta.json() as PaginaConversas;
    assert.deepEqual(Object.keys(json).sort(), ["conversas", "proximoCursor"]);
    for (const item of json.conversas as ItemListaConversas[]) {
      assert.deepEqual(Object.keys(item).sort(), ["id", "naoLidas", "outraIdentidade", "tipo", "ultimaMensagem"]);
      assert.deepEqual(Object.keys(item.outraIdentidade).sort(), ["identidadeId", "nomeExibicao", "nomeUsuario", "tipo"]);
      assert.deepEqual(Object.keys(item.ultimaMensagem).sort(), ["conteudo", "conversaId", "criadoEm", "editadaEm", "estado", "excluidaEm", "id", "mensagemRespondida", "pedido", "remetenteIdentidadeId", "tipo"]);
    }

    const contas = await banco.select({ id: users.id, email: users.email }).from(users).where(inArray(users.phoneNumber, TELEFONES_TESTE));
    const idsCliente = await banco.select({ idCliente: mensagens.idCliente }).from(mensagens).where(inArray(mensagens.conversaId, [conversaAB, conversaAC]));
    const tokensSessao = await banco.select({ token: sessions.token }).from(sessions).where(inArray(sessions.userId, contas.map((c) => c.id)));
    const proibidos = [
      ...TELEFONES_TESTE,
      ...TELEFONES_TESTE.map((t) => t.slice(3)),
      ...contas.flatMap((c) => [c.id, c.email]),
      ...idsCliente.map((m) => m.idCliente),
      ...tokensSessao.map((s) => s.token),
      "session",
      "cookie",
      "usuarioId",
      "phone",
      "email",
    ];
    for (const valor of proibidos) assert.ok(!corpo.includes(valor), `resposta expõe: ${valor}`);
  });

  it("sem sessão → 401; sessão sem identidade pessoal → 403", async () => {
    const semSessao = await api(null, "GET", "/conversas");
    assert.equal(semSessao.statusCode, 401);
    assert.equal(semSessao.json().codigo, "NAO_AUTENTICADO");

    const semIdentidade: Pessoa = { cookie: await autenticar(TELEFONES_TESTE[4] as string, `${PREFIXO_IP_TESTE}5`), identidadeId: "", nomeUsuario: "", ip: `${PREFIXO_IP_TESTE}5` };
    const incompleto = await api(semIdentidade, "GET", "/conversas");
    assert.equal(incompleto.statusCode, 403);
    assert.equal(incompleto.json().codigo, "CADASTRO_INCOMPLETO");

    const cookieInvalido: Pessoa = { ...A, cookie: "better-auth.session_token=forjado.invalido" };
    assert.equal((await api(cookieInvalido, "GET", "/conversas")).statusCode, 401);
  });

  it("conversa aberta pela lista continua sujeita à autorização das mensagens", async () => {
    const [itemDeB] = (await listar(B)).conversas.filter((item) => item.id === conversaBC);
    assert.ok(itemDeB);
    // A conhece o id (ex.: vazado) mas não participa: 404 ao ler e ao enviar.
    assert.equal((await api(A, "GET", `/conversas/${itemDeB.id}/mensagens`)).statusCode, 404);
    assert.equal((await api(A, "POST", `/conversas/${itemDeB.id}/mensagens`, { idCliente: randomUUID(), conteudo: "intrusão" })).statusCode, 404);
    assert.ok(!idsDaLista(await listar(A)).includes(conversaBC), "tentativa de intrusão não pode criar item na lista de A");
    assert.equal((await api(B, "GET", `/conversas/${itemDeB.id}/mensagens`)).statusCode, 200);
  });
});

describe("paginação por cursor", () => {
  let esperada: string[] = [];

  before(async () => {
    // Identidades extras direto no banco: só servem de destino para P abrir conversas pela API.
    const extras = Array.from({ length: TOTAL_EXTRAS }, (_, i) => ({ id: `${PREFIXO_USUARIO_EXTRA}${i}`, nome: `lst_x${String(i).padStart(2, "0")}` }));
    await banco.insert(users).values(extras.map((e) => ({ id: e.id, name: e.nome, email: `${e.id}@teste.invalid` })));
    await banco.insert(identidades).values(extras.map((e) => ({ usuarioId: e.id, tipo: "pessoal" as const, nomeExibicao: `Extra ${e.nome}`, nomeUsuario: e.nome })));

    for (const [indice, extra] of extras.entries()) {
      const conversaId = await abrirConversa(P, extra.nome);
      await enviar(P, conversaId, `mensagem ${indice}`);
    }
    esperada = await ordemEsperadaNoBanco(P.identidadeId);
    assert.equal(esperada.length, TOTAL_EXTRAS);
  });

  async function percorrer(limite: number): Promise<{ ids: string[]; paginas: number }> {
    const ids: string[] = [];
    let cursor: string | null = null;
    let paginas = 0;
    do {
      const pagina: PaginaConversas = await listar(P, `limite=${limite}${cursor ? `&antesDe=${cursor}` : ""}`);
      assert.ok(pagina.conversas.length <= limite);
      ids.push(...idsDaLista(pagina));
      if (pagina.proximoCursor) assert.equal(pagina.proximoCursor, pagina.conversas.at(-1)?.ultimaMensagem.id);
      cursor = pagina.proximoCursor;
      paginas += 1;
      assert.ok(paginas <= TOTAL_EXTRAS + 1, "paginação não termina");
    } while (cursor);
    return { ids, paginas };
  }

  it("percorre todas as conversas sem duplicar nem perder, na ordem da atividade", async () => {
    for (const limite of [1, 5, 7, 22, 50]) {
      const { ids, paginas } = await percorrer(limite);
      assert.equal(new Set(ids).size, ids.length, `limite ${limite}: página duplicou conversa`);
      assert.deepEqual(ids, esperada, `limite ${limite}: perdeu ou desordenou conversas`);
      assert.equal(paginas, Math.max(1, Math.ceil(TOTAL_EXTRAS / limite)), `limite ${limite}: número de páginas`);
    }
  });

  it("limite padrão é 20 e máximo é 50", async () => {
    const padrao = await listar(P);
    assert.equal(padrao.conversas.length, 20);
    assert.equal(padrao.proximoCursor, padrao.conversas.at(-1)?.ultimaMensagem.id);
    const maximo = await listar(P, "limite=50");
    assert.equal(maximo.conversas.length, TOTAL_EXTRAS);
    assert.equal(maximo.proximoCursor, null);
  });

  it("atividade durante a paginação não duplica itens nas páginas seguintes", async () => {
    const primeira = await listar(P, "limite=5");
    const vistas = idsDaLista(primeira);
    // Nova mensagem numa conversa JÁ vista e noutra que ainda estava por vir.
    const jaVista = vistas[2] as string;
    const aindaNaoVista = esperada.at(-1) as string;
    await enviar(P, jaVista, "subiu depois de vista");
    await enviar(P, aindaNaoVista, "subiu antes de ser vista");

    const restantes: string[] = [];
    let cursor = primeira.proximoCursor;
    while (cursor) {
      const pagina: PaginaConversas = await listar(P, `limite=5&antesDe=${cursor}`);
      restantes.push(...idsDaLista(pagina));
      cursor = pagina.proximoCursor;
    }
    assert.ok(!restantes.includes(jaVista), "conversa já vista reapareceu");
    assert.equal(new Set([...vistas, ...restantes]).size, vistas.length + restantes.length, "duplicou conversa");
    // A que subiu antes de ser vista fica ACIMA do cursor: quem pagina a recebe pelo realtime
    // ou recarregando a primeira página, que agora a traz no topo.
    assert.deepEqual(idsDaLista(await listar(P, "limite=2")), [aindaNaoVista, jaVista]);
  });

  it("limite e cursor inválidos são recusados com DADOS_INVALIDOS", async () => {
    for (const consulta of ["limite=0", "limite=51", "limite=-1", "limite=2.5", "limite=abc", "antesDe=abc", "antesDe=", `antesDe=${randomUUID()}x`]) {
      const resposta = await api(P, "GET", `/conversas?${consulta}`);
      assert.equal(resposta.statusCode, 400, consulta);
      assert.equal(resposta.json().codigo, "DADOS_INVALIDOS", consulta);
    }
  });
});

describe("realtime reflete a lista", () => {
  it("nova mensagem: todas as conexões dos participantes recebem UM evento que corresponde ao novo topo da lista", async () => {
    const [a1, a2, b1, c1] = await Promise.all([conectar(A), conectar(A), conectar(B), conectar(C)]);
    const eventosA1 = coletarEventos(a1);
    const eventosA2 = coletarEventos(a2);
    const eventosB1 = coletarEventos(b1);
    const eventosC1 = coletarEventos(c1);

    const antes = await listar(A);
    const conversaDeBaixo = antes.conversas.at(-1);
    assert.ok(conversaDeBaixo);
    const remetente = conversaDeBaixo.id === conversaAB ? B : C;
    const idCliente = randomUUID();
    const enviada = await enviar(remetente, conversaDeBaixo.id, "vai para o topo", idCliente);

    await aguardarAte(() => eventosA1.length === 1 && eventosA2.length === 1);
    for (const eventos of [eventosA1, eventosA2]) {
      assert.equal(eventos[0]?.mensagem.conversaId, conversaDeBaixo.id);
      assert.deepEqual(eventos[0]?.mensagem, enviada);
    }

    const depois = await listar(A);
    assert.equal(depois.conversas[0]?.id, conversaDeBaixo.id);
    assert.deepEqual(depois.conversas[0]?.ultimaMensagem, eventosA1[0]?.mensagem, "evento e lista devem concordar");
    assert.equal(new Set(idsDaLista(depois)).size, depois.conversas.length);
    assert.deepEqual(new Set(idsDaLista(depois)), new Set(idsDaLista(antes)), "nenhum item novo ou duplicado");

    // Retry da mesma tentativa: sem novo evento e sem mudança na lista.
    await enviar(remetente, conversaDeBaixo.id, "vai para o topo", idCliente);
    await esperar(300);
    assert.equal(eventosA1.length, 1);
    assert.equal(eventosA2.length, 1);
    assert.deepEqual(await listar(A), depois);

    // Quem não participa da conversa não recebe o evento.
    const terceiro = remetente === B ? { eventos: eventosC1, nome: "C" } : { eventos: eventosB1, nome: "B" };
    assert.equal(terceiro.eventos.length, 0, `${terceiro.nome} recebeu evento de conversa alheia`);

    // Uma das conexões de A cai; a outra continua recebendo.
    a1.disconnect();
    const outra = await enviar(A, conversaDeBaixo.id, "com uma conexão a menos");
    await aguardarAte(() => eventosA2.length === 2);
    assert.equal(eventosA2[1]?.mensagem.id, outra.id);
    assert.equal(eventosA1.length, 1);
    assert.equal((await listar(A)).conversas[0]?.ultimaMensagem.id, outra.id);

    for (const socket of [a2, b1, c1]) socket.disconnect();
  });
});
