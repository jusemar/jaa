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
  recebimentosMensagem,
  users,
  verifications,
} from "@jaa/banco/schema";
import {
  EVENTO_MENSAGEM_NOVA,
  EVENTO_MENSAGENS_ENTREGUES,
  EVENTO_MENSAGENS_LIDAS,
  type EstadoMensagem,
  type EventoMensagemNova,
  type EventoMensagensEntregues,
  type EventoMensagensLidas,
  type Mensagem,
  type PaginaConversas,
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
 * Integração REAL dos estados ENVIADA → ENTREGUE → LIDA: HTTP (Fastify), Better Auth, PostgreSQL
 * local e Socket.IO numa porta, com clientes socket.io-client. OTP via testUtils oficial.
 * Telefones e IPs reservados; todos os dados criados são removidos ao final.
 */

const ORIGEM_WEB = "http://localhost:3000";
const PREFIXO_IP_TESTE = "198.19.0."; // RFC 2544 (reservado para testes)
const TELEFONES_TESTE = ["+5531987650401", "+5531987650402", "+5531987650403"];

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

async function enviar(pessoa: Pessoa, conversaId: string, conteudo: string, idCliente: string = randomUUID()): Promise<Mensagem> {
  const resposta = await api(pessoa, "POST", `/conversas/${conversaId}/mensagens`, { idCliente, conteudo });
  assert.equal(resposta.statusCode, 201, resposta.body);
  return resposta.json();
}

const confirmarRecebimento = (pessoa: Pessoa, corpo: unknown) => api(pessoa, "POST", "/mensagens/recebimentos", corpo);
const confirmarLeitura = (pessoa: Pessoa, conversaId: string, corpo: unknown) =>
  api(pessoa, "POST", `/conversas/${conversaId}/leitura`, corpo);

async function estadosNoHistorico(pessoa: Pessoa, conversaId: string): Promise<Map<string, EstadoMensagem>> {
  const resposta = await api(pessoa, "GET", `/conversas/${conversaId}/mensagens?limite=100`);
  assert.equal(resposta.statusCode, 200, resposta.body);
  return new Map(resposta.json().mensagens.map((m: Mensagem) => [m.id, m.estado]));
}

async function estadoNoHistorico(pessoa: Pessoa, conversaId: string, mensagemId: string) {
  return (await estadosNoHistorico(pessoa, conversaId)).get(mensagemId);
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

async function contarRecebimentos(mensagemIds: string[]) {
  const [linha] = await banco
    .select({ total: count() })
    .from(recebimentosMensagem)
    .where(inArray(recebimentosMensagem.mensagemId, mensagemIds));
  return linha?.total ?? 0;
}

async function marcadorLeitura(pessoa: Pessoa, conversaId: string) {
  const [linha] = await banco
    .select({ lidaAte: participantesConversa.lidaAteMensagemId })
    .from(participantesConversa)
    .where(and(eq(participantesConversa.conversaId, conversaId), eq(participantesConversa.identidadeId, pessoa.identidadeId)));
  return linha?.lidaAte ?? null;
}

async function limparDadosDeTeste() {
  const usuariosTeste = banco.select({ id: users.id }).from(users).where(inArray(users.phoneNumber, TELEFONES_TESTE));
  const identidadesTeste = banco.select({ id: identidades.id }).from(identidades).where(inArray(identidades.usuarioId, usuariosTeste));
  const conversasTeste = banco
    .select({ id: participantesConversa.conversaId })
    .from(participantesConversa)
    .where(inArray(participantesConversa.identidadeId, identidadesTeste));
  await banco.delete(mensagens).where(inArray(mensagens.conversaId, conversasTeste)); // recebimentos em cascata
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

  A = await criarPessoa(TELEFONES_TESTE[0] as string, "est_a", `${PREFIXO_IP_TESTE}1`);
  B = await criarPessoa(TELEFONES_TESTE[1] as string, "est_b", `${PREFIXO_IP_TESTE}2`);
  C = await criarPessoa(TELEFONES_TESTE[2] as string, "est_c", `${PREFIXO_IP_TESTE}3`);
  conversaAB = (await api(A, "POST", "/conversas/diretas", { nomeUsuario: "est_b" })).json().id;
  conversaBC = (await api(C, "POST", "/conversas/diretas", { nomeUsuario: "est_b" })).json().id;
});

after(async () => {
  for (const cliente of clientes) cliente.disconnect();
  await app.close();
  await limparDadosDeTeste();
  const [restantes] = await banco.select({ total: count() }).from(users).where(inArray(users.phoneNumber, TELEFONES_TESTE));
  assert.equal(restantes?.total, 0, "dados de teste não foram limpos");
  await conexao.encerrar();
});

describe("ENVIADA", () => {
  it("persistida = enviada: resposta, evento mensagem:nova e histórico dos dois lados", async () => {
    const socketB = await conectar(B);
    const novasB = coletar<EventoMensagemNova>(socketB, EVENTO_MENSAGEM_NOVA);

    const mensagem = await enviar(A, conversaAB, "persistida");
    assert.equal(mensagem.estado, "enviada");
    await aguardarAte(() => novasB.length === 1);
    assert.equal(novasB[0]?.mensagem.estado, "enviada");
    assert.equal(await estadoNoHistorico(A, conversaAB, mensagem.id), "enviada");
    assert.equal(await estadoNoHistorico(B, conversaAB, mensagem.id), "enviada");
    socketB.disconnect();
  });

  it("B offline: a mensagem permanece enviada, sem nenhum recebimento", async () => {
    const socketA = await conectar(A);
    const entreguesA = coletar<EventoMensagensEntregues>(socketA, EVENTO_MENSAGENS_ENTREGUES);

    const mensagem = await enviar(A, conversaAB, "B está offline");
    await esperar(300);
    assert.equal(await estadoNoHistorico(A, conversaAB, mensagem.id), "enviada");
    assert.equal(await contarRecebimentos([mensagem.id]), 0);
    assert.equal(entreguesA.length, 0);
    socketA.disconnect();
  });

  it("emit sem ACK não é entregue: B conectado recebe o evento, mas não confirma", async () => {
    const [socketA, socketB] = await Promise.all([conectar(A), conectar(B)]);
    const entreguesA = coletar<EventoMensagensEntregues>(socketA, EVENTO_MENSAGENS_ENTREGUES);
    const novasB = coletar<EventoMensagemNova>(socketB, EVENTO_MENSAGEM_NOVA);

    const mensagem = await enviar(A, conversaAB, "emitida sem ACK");
    await aguardarAte(() => novasB.some((e) => e.mensagem.id === mensagem.id));
    await esperar(300);
    assert.equal(await estadoNoHistorico(A, conversaAB, mensagem.id), "enviada");
    assert.equal(await contarRecebimentos([mensagem.id]), 0);
    assert.equal(entreguesA.length, 0);
    socketA.disconnect();
    socketB.disconnect();
  });
});

describe("ENTREGUE", () => {
  it("B recebe e confirma → entregue; todas as conexões de A são atualizadas; C não recebe nada", async () => {
    const [a1, a2, b1, c1] = await Promise.all([conectar(A), conectar(A), conectar(B), conectar(C)]);
    const eventosA1 = coletar<EventoMensagensEntregues>(a1, EVENTO_MENSAGENS_ENTREGUES);
    const eventosA2 = coletar<EventoMensagensEntregues>(a2, EVENTO_MENSAGENS_ENTREGUES);
    const eventosC = coletar<EventoMensagensEntregues>(c1, EVENTO_MENSAGENS_ENTREGUES);
    const novasB = coletar<EventoMensagemNova>(b1, EVENTO_MENSAGEM_NOVA);

    const mensagem = await enviar(A, conversaAB, "confirme, B");
    await aguardarAte(() => novasB.length === 1);

    const resposta = await confirmarRecebimento(B, { mensagemIds: [novasB[0]?.mensagem.id] });
    assert.equal(resposta.statusCode, 200, resposta.body);
    assert.deepEqual(resposta.json(), { mensagemIds: [mensagem.id] });

    const esperado: EventoMensagensEntregues = { conversaId: conversaAB, destinatarioIdentidadeId: B.identidadeId, mensagemIds: [mensagem.id] };
    await aguardarAte(() => eventosA1.length === 1 && eventosA2.length === 1);
    assert.deepEqual(eventosA1[0], esperado);
    assert.deepEqual(eventosA2[0], esperado);
    assert.equal(await estadoNoHistorico(A, conversaAB, mensagem.id), "entregue");
    assert.equal(await estadoNoHistorico(B, conversaAB, mensagem.id), "entregue");

    // Recebida em background: entregue, mas NÃO lida.
    assert.equal(await marcadorLeitura(B, conversaAB), null);
    await esperar(200);
    assert.equal(eventosC.length, 0, "terceiro não recebe estados da conversa A↔B");
    for (const socket of [a1, a2, b1, c1]) socket.disconnect();
  });

  it("B com duas conexões: ACKs duplicados e simultâneos geram UM recebimento e UM evento", async () => {
    const [a1, b1, b2] = await Promise.all([conectar(A), conectar(B), conectar(B)]);
    const eventosA = coletar<EventoMensagensEntregues>(a1, EVENTO_MENSAGENS_ENTREGUES);
    const novasB1 = coletar<EventoMensagemNova>(b1, EVENTO_MENSAGEM_NOVA);
    const novasB2 = coletar<EventoMensagemNova>(b2, EVENTO_MENSAGEM_NOVA);

    const mensagem = await enviar(A, conversaAB, "duas abas de B");
    await aguardarAte(() => novasB1.length === 1 && novasB2.length === 1);

    const respostas = await Promise.all(
      Array.from({ length: 10 }, () => confirmarRecebimento(B, { mensagemIds: [mensagem.id, mensagem.id] })),
    );
    assert.ok(respostas.every((r) => r.statusCode === 200 && r.json().mensagemIds.length === 1));
    assert.equal(await contarRecebimentos([mensagem.id]), 1);

    await aguardarAte(() => eventosA.length === 1);
    await esperar(300);
    assert.equal(eventosA.length, 1, "ACK repetido não pode gerar novo evento");

    // Retry posterior, já confirmada: resposta idêntica, sem evento.
    assert.deepEqual((await confirmarRecebimento(B, { mensagemIds: [mensagem.id] })).json(), { mensagemIds: [mensagem.id] });
    await esperar(200);
    assert.equal(eventosA.length, 1);
    for (const socket of [a1, b1, b2]) socket.disconnect();
  });

  it("mensagem enviada offline, recuperada depois pelo histórico, vira entregue após reconexão de B", async () => {
    const socketA = await conectar(A);
    const eventosA = coletar<EventoMensagensEntregues>(socketA, EVENTO_MENSAGENS_ENTREGUES);
    const offline = [await enviar(A, conversaAB, "offline 1"), await enviar(A, conversaAB, "offline 2")];
    await esperar(200);

    // B volta: conecta e carrega o histórico, onde as mensagens aparecem como enviadas.
    const socketB = await conectar(B);
    const pagina = (await api(B, "GET", `/conversas/${conversaAB}/mensagens`)).json();
    const pendentes: Mensagem[] = pagina.mensagens.filter(
      (m: Mensagem) => m.remetenteIdentidadeId !== B.identidadeId && m.estado === "enviada",
    );
    for (const mensagem of offline) assert.ok(pendentes.some((m) => m.id === mensagem.id));

    const resposta = await confirmarRecebimento(B, { mensagemIds: pendentes.map((m) => m.id) });
    assert.equal(resposta.statusCode, 200, resposta.body);
    await aguardarAte(() => eventosA.some((e) => offline.every((m) => e.mensagemIds.includes(m.id))));

    // "Reload": nova leitura do histórico reflete o estado persistido.
    const estados = await estadosNoHistorico(A, conversaAB);
    for (const mensagem of offline) assert.equal(estados.get(mensagem.id), "entregue");
    socketA.disconnect();
    socketB.disconnect();
  });

  it("confirmação em lote de conversas diferentes: cada conversa notifica só seus participantes", async () => {
    const [a1, c1] = await Promise.all([conectar(A), conectar(C)]);
    const eventosA = coletar<EventoMensagensEntregues>(a1, EVENTO_MENSAGENS_ENTREGUES);
    const eventosC = coletar<EventoMensagensEntregues>(c1, EVENTO_MENSAGENS_ENTREGUES);
    const deA = await enviar(A, conversaAB, "lote de A");
    const deC = await enviar(C, conversaBC, "lote de C");

    assert.equal((await confirmarRecebimento(B, { mensagemIds: [deA.id, deC.id] })).statusCode, 200);
    await aguardarAte(() => eventosA.length === 1 && eventosC.length === 1);
    assert.deepEqual(eventosA[0], { conversaId: conversaAB, destinatarioIdentidadeId: B.identidadeId, mensagemIds: [deA.id] });
    assert.deepEqual(eventosC[0], { conversaId: conversaBC, destinatarioIdentidadeId: B.identidadeId, mensagemIds: [deC.id] });
    a1.disconnect();
    c1.disconnect();
  });

  it("retry do envio devolve a mensagem com o estado atual", async () => {
    const idCliente = randomUUID();
    const mensagem = await enviar(A, conversaAB, "retry após entrega", idCliente);
    await confirmarRecebimento(B, { mensagemIds: [mensagem.id] });
    const retry = await api(A, "POST", `/conversas/${conversaAB}/mensagens`, { idCliente, conteudo: "retry após entrega" });
    assert.equal(retry.statusCode, 200);
    assert.equal(retry.json().id, mensagem.id);
    assert.equal(retry.json().estado, "entregue");
  });
});

describe("LIDA", () => {
  it("B abre a conversa: um marcador lê várias mensagens de uma vez; A (duas conexões) recebe um evento", async () => {
    const [a1, a2] = await Promise.all([conectar(A), conectar(A)]);
    const lidasA1 = coletar<EventoMensagensLidas>(a1, EVENTO_MENSAGENS_LIDAS);
    const lidasA2 = coletar<EventoMensagensLidas>(a2, EVENTO_MENSAGENS_LIDAS);

    const lote = [await enviar(A, conversaAB, "lote 1"), await enviar(A, conversaAB, "lote 2"), await enviar(A, conversaAB, "lote 3")];
    await confirmarRecebimento(B, { mensagemIds: [lote[0]?.id] }); // só a primeira foi entregue antes da leitura
    const ultima = lote[2] as Mensagem;

    const resposta = await confirmarLeitura(B, conversaAB, { ateMensagemId: ultima.id });
    assert.equal(resposta.statusCode, 200, resposta.body);
    assert.deepEqual(resposta.json(), { conversaId: conversaAB, lidaAteMensagemId: ultima.id });

    const esperado: EventoMensagensLidas = { conversaId: conversaAB, leitorIdentidadeId: B.identidadeId, ateMensagemId: ultima.id };
    await aguardarAte(() => lidasA1.length === 1 && lidasA2.length === 1);
    assert.deepEqual(lidasA1[0], esperado);
    assert.deepEqual(lidasA2[0], esperado);

    const estados = await estadosNoHistorico(A, conversaAB);
    for (const mensagem of lote) assert.equal(estados.get(mensagem.id), "lida");
    // Todas as mensagens anteriores de A também ficam lidas; nenhuma posterior existe.
    assert.ok([...estados.values()].every((estado) => estado === "lida"));
    a1.disconnect();
    a2.disconnect();
  });

  it("estado não regride: recebimento tardio, leitura repetida ou mais antiga não alteram nada nem emitem", async () => {
    const socketA = await conectar(A);
    const lidasA = coletar<EventoMensagensLidas>(socketA, EVENTO_MENSAGENS_LIDAS);
    const antiga = await enviar(A, conversaAB, "antiga");
    const nova = await enviar(A, conversaAB, "nova");

    assert.equal((await confirmarLeitura(B, conversaAB, { ateMensagemId: nova.id })).statusCode, 200);
    await aguardarAte(() => lidasA.length === 1);

    // Entrega chegando depois da leitura: grava o fato, mas o estado continua "lida".
    assert.equal((await confirmarRecebimento(B, { mensagemIds: [antiga.id, nova.id] })).statusCode, 200);
    // Leitura atrasada de uma mensagem mais antiga e leitura repetida.
    const atrasada = await confirmarLeitura(B, conversaAB, { ateMensagemId: antiga.id });
    assert.deepEqual(atrasada.json(), { conversaId: conversaAB, lidaAteMensagemId: nova.id });
    assert.equal((await confirmarLeitura(B, conversaAB, { ateMensagemId: nova.id })).statusCode, 200);

    await esperar(300);
    assert.equal(lidasA.length, 1);
    assert.equal(await marcadorLeitura(B, conversaAB), nova.id);
    const estados = await estadosNoHistorico(A, conversaAB);
    assert.equal(estados.get(antiga.id), "lida");
    assert.equal(estados.get(nova.id), "lida");
    socketA.disconnect();
  });

  it("concorrência: leituras simultâneas fora de ordem e entrega quase simultânea terminam no marcador máximo", async () => {
    const lote: Mensagem[] = [];
    for (let i = 0; i < 6; i++) lote.push(await enviar(A, conversaAB, `concorrente ${i}`));
    const maisNova = lote.at(-1) as Mensagem;

    const operacoes = [
      ...[...lote].reverse().flatMap((m) => [
        confirmarLeitura(B, conversaAB, { ateMensagemId: m.id }),
        confirmarRecebimento(B, { mensagemIds: [m.id] }),
      ]),
      ...lote.map((m) => confirmarLeitura(B, conversaAB, { ateMensagemId: m.id })),
    ];
    const respostas = await Promise.all(operacoes);
    assert.ok(respostas.every((r) => r.statusCode === 200), "todas as confirmações são aceitas");

    assert.equal(await marcadorLeitura(B, conversaAB), maisNova.id);
    assert.equal(await contarRecebimentos(lote.map((m) => m.id)), lote.length);
    const estados = await estadosNoHistorico(A, conversaAB);
    for (const mensagem of lote) assert.equal(estados.get(mensagem.id), "lida");
  });

  it("mensagem nova depois da leitura volta a ser só enviada; B lendo a de A não muda o estado das de B", async () => {
    const deB = await enviar(B, conversaAB, "resposta de B");
    const deA = await enviar(A, conversaAB, "depois da leitura");
    assert.equal((await confirmarLeitura(B, conversaAB, { ateMensagemId: deA.id })).statusCode, 200);

    const estados = await estadosNoHistorico(B, conversaAB);
    assert.equal(estados.get(deA.id), "lida");
    assert.equal(estados.get(deB.id), "enviada", "estado de B depende só de A");

    const outra = await enviar(A, conversaAB, "ainda não lida");
    assert.equal(await estadoNoHistorico(A, conversaAB, outra.id), "enviada");
  });
});

describe("segurança", () => {
  it("A não confirma a própria mensagem como destinatário (recebimento nem leitura); lote misto é recusado inteiro", async () => {
    const socketA = await conectar(A);
    const eventos = [
      ...coletar<unknown>(socketA, EVENTO_MENSAGENS_ENTREGUES),
      ...coletar<unknown>(socketA, EVENTO_MENSAGENS_LIDAS),
    ];
    const propria = await enviar(A, conversaAB, "minha própria");
    const deB = await enviar(B, conversaAB, "de B para A");
    const marcadorAntes = await marcadorLeitura(A, conversaAB);

    const recebimento = await confirmarRecebimento(A, { mensagemIds: [propria.id] });
    assert.equal(recebimento.statusCode, 404);
    assert.equal(recebimento.json().codigo, "MENSAGEM_NAO_ENCONTRADA");

    const misto = await confirmarRecebimento(A, { mensagemIds: [deB.id, propria.id] });
    assert.equal(misto.statusCode, 404);
    assert.equal(await contarRecebimentos([propria.id, deB.id]), 0, "nada é gravado quando o lote é inválido");

    const leitura = await confirmarLeitura(A, conversaAB, { ateMensagemId: propria.id });
    assert.equal(leitura.statusCode, 404);
    assert.equal(leitura.json().codigo, "MENSAGEM_NAO_ENCONTRADA");
    assert.equal(await marcadorLeitura(A, conversaAB), marcadorAntes);
    assert.equal(await estadoNoHistorico(A, conversaAB, propria.id), "enviada");

    await esperar(200);
    assert.equal(eventos.length, 0);
    socketA.disconnect();
  });

  it("C não altera estados de A↔B, nem com ids manipulados de outra conversa", async () => {
    const [a1, b1] = await Promise.all([conectar(A), conectar(B)]);
    const eventos = [
      ...coletar<unknown>(a1, EVENTO_MENSAGENS_ENTREGUES),
      ...coletar<unknown>(a1, EVENTO_MENSAGENS_LIDAS),
      ...coletar<unknown>(b1, EVENTO_MENSAGENS_ENTREGUES),
      ...coletar<unknown>(b1, EVENTO_MENSAGENS_LIDAS),
    ];
    const deA = await enviar(A, conversaAB, "privada A↔B");
    const deB = await enviar(B, conversaBC, "de B para C");
    const marcadores = [await marcadorLeitura(A, conversaAB), await marcadorLeitura(B, conversaAB)];

    const recebimento = await confirmarRecebimento(C, { mensagemIds: [deA.id] });
    assert.equal(recebimento.statusCode, 404);
    assert.equal(recebimento.json().codigo, "MENSAGEM_NAO_ENCONTRADA");

    const leituraNaConversaAlheia = await confirmarLeitura(C, conversaAB, { ateMensagemId: deA.id });
    assert.equal(leituraNaConversaAlheia.statusCode, 404);
    assert.equal(leituraNaConversaAlheia.json().codigo, "CONVERSA_NAO_ENCONTRADA");

    // Conversa própria (B↔C) com id de mensagem de A↔B, e o inverso para B.
    assert.equal((await confirmarLeitura(C, conversaBC, { ateMensagemId: deA.id })).statusCode, 404);
    assert.equal((await confirmarLeitura(B, conversaAB, { ateMensagemId: deB.id })).statusCode, 404);
    assert.equal((await confirmarLeitura(C, randomUUID(), { ateMensagemId: deA.id })).statusCode, 404);

    assert.equal(await contarRecebimentos([deA.id]), 0);
    assert.deepEqual([await marcadorLeitura(A, conversaAB), await marcadorLeitura(B, conversaAB)], marcadores);
    assert.equal(await estadoNoHistorico(A, conversaAB, deA.id), "enviada");
    await esperar(200);
    assert.equal(eventos.length, 0);
    a1.disconnect();
    b1.disconnect();
  });

  it("identidade enviada no corpo é ignorada: quem confirma é sempre a sessão", async () => {
    const deB = await enviar(B, conversaAB, "B para A, confirmada por A");
    const resposta = await confirmarRecebimento(A, {
      mensagemIds: [deB.id],
      destinatarioIdentidadeId: B.identidadeId,
      identidadeId: C.identidadeId,
    });
    assert.equal(resposta.statusCode, 200);
    const linhas = await banco.select().from(recebimentosMensagem).where(eq(recebimentosMensagem.mensagemId, deB.id));
    assert.deepEqual(linhas.map((l) => l.destinatarioIdentidadeId), [A.identidadeId]);

    const leitura = await confirmarLeitura(A, conversaAB, { ateMensagemId: deB.id, leitorIdentidadeId: B.identidadeId });
    assert.equal(leitura.statusCode, 200);
    assert.equal(await marcadorLeitura(A, conversaAB), deB.id);
  });

  it("payload inválido, sem sessão e conversa inválida", async () => {
    const id = randomUUID();
    for (const corpo of [{}, { mensagemIds: [] }, { mensagemIds: ["abc"] }, { mensagemIds: Array.from({ length: 101 }, () => id) }]) {
      const resposta = await confirmarRecebimento(B, corpo);
      assert.equal(resposta.statusCode, 400, JSON.stringify(corpo).slice(0, 40));
      assert.equal(resposta.json().codigo, "DADOS_INVALIDOS");
    }
    assert.equal((await confirmarLeitura(B, conversaAB, {})).statusCode, 400);
    assert.equal((await confirmarLeitura(B, conversaAB, { ateMensagemId: "abc" })).statusCode, 400);
    assert.equal((await confirmarLeitura(B, "nao-e-uuid", { ateMensagemId: id })).statusCode, 400);
    assert.equal((await api(null, "POST", "/mensagens/recebimentos", { mensagemIds: [id] })).statusCode, 401);
    assert.equal((await api(null, "POST", `/conversas/${conversaAB}/leitura`, { ateMensagemId: id })).statusCode, 401);
  });
});

describe("histórico e lista refletem o estado persistido", () => {
  it("uma página mistura enviada, entregue e lida corretamente, igual para A e B, e a lista traz o estado da última", async () => {
    const [lida, entregue, enviada] = [
      await enviar(A, conversaAB, "vai ser lida"),
      await enviar(A, conversaAB, "vai ser entregue"),
      await enviar(A, conversaAB, "fica enviada"),
    ];
    await confirmarLeitura(B, conversaAB, { ateMensagemId: lida.id });
    await confirmarRecebimento(B, { mensagemIds: [entregue.id] });

    const estadosA = await estadosNoHistorico(A, conversaAB);
    assert.deepEqual([estadosA.get(lida.id), estadosA.get(entregue.id), estadosA.get(enviada.id)], ["lida", "entregue", "enviada"]);
    assert.deepEqual(await estadosNoHistorico(B, conversaAB), estadosA);

    const listaA: PaginaConversas = (await api(A, "GET", "/conversas")).json();
    const item = listaA.conversas.find((c) => c.id === conversaAB);
    assert.equal(item?.ultimaMensagem.id, enviada.id);
    assert.equal(item?.ultimaMensagem.estado, "enviada");

    await confirmarLeitura(B, conversaAB, { ateMensagemId: enviada.id });
    const listaDepois: PaginaConversas = (await api(A, "GET", "/conversas")).json();
    assert.equal(listaDepois.conversas.find((c) => c.id === conversaAB)?.ultimaMensagem.estado, "lida");
  });
});
