import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";
import { anexosMensagem, conversas, dispositivosPush, identidades, mensagens, participantesConversa, sessions, users } from "@jaa/banco/schema";
import {
  CANAL_PUSH_MENSAGENS,
  dadosPushSchema,
  EVENTO_NOTIFICACAO_NOVA_MENSAGEM,
  TEXTO_PUSH_NOVA_MENSAGEM,
  TITULO_PUSH_NOVA_MENSAGEM,
  type EventoNotificacaoNovaMensagem,
  type VisitanteAtual,
} from "@jaa/contratos";
import { and, eq, inArray } from "drizzle-orm";
import type { EventoDominioMensagens } from "../src/features/mensagens/lib/eventos-mensagens.js";
import { ERRO_DISPOSITIVO_NAO_REGISTRADO, type MensagemPush, type ProvedorPush, type ReciboPush, type TicketPush } from "../src/features/push/lib/provedor-push.js";
import { criarServicoPush } from "../src/features/push/lib/servico-push.js";
import { aguardarAte, coletar, criarAmbienteIntegracao, type Pessoa } from "./apoio/integracao.js";

/*
 * PUSH DE NOVA MENSAGEM: assinante do aviso que o Jaaa já dá pelo realtime. Provedor FALSO: nenhum push
 * real sai da suíte. Ana, Beto e Caio: pessoas comuns. Junior: dono do Restaurante, com DOIS aparelhos.
 * Caio é quem NÃO deveria receber nada alheio. V: visitante do Link do Jaa (remetente, nunca registra).
 */

const TELEFONES = Array.from({ length: 4 }, (_, i) => `+553198712500${i}`);
const ctx = criarAmbienteIntegracao({ telefones: TELEFONES, prefixoIp: "198.18.125." });
let ana: Pessoa;
let beto: Pessoa;
let caio: Pessoa;
let junior: Pessoa;
let juniorCelular2: Pessoa;
let restaurante = { id: "", identidadeId: "" };
// Contas anônimas criadas pelos testes: apagadas no fim (o apoio só conhece telefones).
const usuariosVisitantes = new Set<string>();
let ipVisitante = 60;

// ---- Provedor falso ----
const enviados: MensagemPush[] = [];
const respostaPorToken = new Map<string, TicketPush>();
const recibos = new Map<string, ReciboPush>();
let provedorFalha = false;
let contadorTicket = 0;
const provedor: ProvedorPush = {
  async enviar(lote) {
    if (provedorFalha) throw new Error("provedor fora do ar");
    enviados.push(...lote);
    return lote.map((mensagem) => respostaPorToken.get(mensagem.token) ?? { status: "ok", id: `ticket-${(contadorTicket += 1)}` });
  },
  async consultarRecibos(idsTicket) {
    return new Map(idsTicket.flatMap((id) => (recibos.has(id) ? [[id, recibos.get(id) as ReciboPush] as const] : [])));
  },
};
let relogio = Date.now();
const falhas: unknown[] = [];
const servico = criarServicoPush({ banco: ctx.banco, eventosMensagens: ctx.eventosMensagens, provedor, aoFalhar: (erro) => falhas.push(erro), agora: () => relogio });
const eventos: EventoDominioMensagens[] = [];

const token = (nome: string) => `ExponentPushToken[${nome}]`;
const TOKENS = { ana: token("ana"), beto: token("beto"), caio: token("caio"), junior1: token("junior1"), junior2: token("junior2") };
const instalacoes = { ana: randomUUID(), beto: randomUUID(), caio: randomUUID(), junior1: randomUUID(), junior2: randomUUID() };
const para = (tokenAlvo: string) => enviados.filter((mensagem) => mensagem.token === tokenAlvo);

async function chamar(pessoa: Pessoa | null, metodo: "GET" | "POST" | "PUT" | "DELETE", caminho: string, corpo?: unknown) {
  const resposta = await ctx.api(pessoa, metodo, caminho, corpo);
  let json: Record<string, unknown> = {};
  try {
    json = resposta.json() as Record<string, unknown>;
  } catch {
    // 204 sem corpo
  }
  return { status: resposta.statusCode, corpo: json };
}
const registrar = (pessoa: Pessoa, instalacaoId: string, tokenPush: string) => chamar(pessoa, "PUT", "/dispositivos-push", { instalacaoId, token: tokenPush, plataforma: "android" });
const dispositivo = async (instalacaoId: string) => (await ctx.banco.select().from(dispositivosPush).where(eq(dispositivosPush.instalacaoId, instalacaoId)))[0];
const usuarioDe = async (pessoa: Pessoa) => (await ctx.banco.select({ usuarioId: identidades.usuarioId }).from(identidades).where(eq(identidades.id, pessoa.identidadeId)))[0]?.usuarioId ?? "";

// Segundo login da mesma conta (outro aparelho): outra sessão.
async function outraSessao(indice: number, pessoa: Pessoa): Promise<Pessoa> {
  const telefone = TELEFONES[indice] ?? "";
  const semSessao: Pessoa = { cookie: "", identidadeId: "", nomeExibicao: "", ip: `198.18.125.${indice + 50}` };
  assert.equal((await ctx.api(semSessao, "POST", "/api/auth/phone-number/send-otp", { phoneNumber: telefone })).statusCode, 200);
  const verificacao = await ctx.api(semSessao, "POST", "/api/auth/phone-number/verify", { phoneNumber: telefone, code: await ctx.obterCodigo(telefone) });
  const cookie = verificacao.cookies.find((c) => c.name === "better-auth.session_token");
  assert.ok(cookie);
  return { ...pessoa, cookie: `${cookie.name}=${cookie.value}` };
}

async function criarVisitante(): Promise<Pessoa> {
  const ip = `198.18.125.${ipVisitante++}`;
  const semSessao: Pessoa = { cookie: "", identidadeId: "", nomeExibicao: "Visitante", ip };
  const resposta = await ctx.api(semSessao, "POST", "/visitantes", {});
  assert.equal(resposta.statusCode, 201, resposta.body);
  const cookie = resposta.cookies.find((c) => c.name === "better-auth.session_token");
  assert.ok(cookie);
  const visitante: VisitanteAtual = resposta.json();
  const [dona] = await ctx.banco.select({ usuarioId: identidades.usuarioId }).from(identidades).where(eq(identidades.id, visitante.identidadeId));
  if (dona?.usuarioId) usuariosVisitantes.add(dona.usuarioId);
  return { cookie: `${cookie.name}=${cookie.value}`, identidadeId: visitante.identidadeId, nomeExibicao: visitante.nomeExibicao, ip };
}

async function conversaCom(pessoa: Pessoa, nomeUsuario: string): Promise<string> {
  const aberta = await chamar(pessoa, "POST", "/conversas/diretas", { nomeUsuario });
  assert.ok(aberta.status < 300, JSON.stringify(aberta.corpo));
  return String(aberta.corpo.id);
}
// Envia e espera o aviso de nova mensagem ser publicado E o push terminar.
async function enviarTexto(pessoa: Pessoa, conversaId: string, conteudo: string) {
  const antes = eventos.filter((evento) => evento.tipo === "notificacao-nova-mensagem").length;
  const enviada = await chamar(pessoa, "POST", `/conversas/${conversaId}/mensagens`, { idCliente: randomUUID(), conteudo });
  assert.equal(enviada.status, 201, JSON.stringify(enviada.corpo));
  await aguardarAte(() => eventos.filter((evento) => evento.tipo === "notificacao-nova-mensagem").length > antes);
  await servico.ocioso();
  return enviada.corpo;
}

before(async () => {
  await ctx.iniciar();
  ctx.eventosMensagens.inscrever((evento) => eventos.push(evento));
  ana = await ctx.criarPessoa(0, "pu_ana", "Ana Souza");
  beto = await ctx.criarPessoa(1, "pu_beto", "Beto");
  caio = await ctx.criarPessoa(2, "pu_caio", "Caio");
  junior = await ctx.criarPessoa(3, "pu_junior", "Junior Rocha");
  juniorCelular2 = await outraSessao(3, junior);
  const criada = await chamar(junior, "POST", "/empresas", { nome: "Restaurante Bom", nomeUsuario: "pu_restaurante", slug: "pu-restaurante" });
  assert.equal(criada.status, 201, JSON.stringify(criada.corpo));
  restaurante = { id: String(criada.corpo.id), identidadeId: String(criada.corpo.identidadeId) };

  for (const [pessoa, nome] of [[ana, "ana"], [beto, "beto"], [caio, "caio"], [junior, "junior1"], [juniorCelular2, "junior2"]] as const) {
    assert.equal((await registrar(pessoa, instalacoes[nome], TOKENS[nome])).status, 204);
  }
});

beforeEach(() => {
  enviados.length = 0;
  respostaPorToken.clear();
  provedorFalha = false;
});

after(async () => {
  await servico.encerrar();
  // Conversas que envolvem os visitantes (as das contas de teste o apoio já limpa).
  const ids = [...usuariosVisitantes];
  if (ids.length > 0) {
    const ident = ctx.banco.select({ id: identidades.id }).from(identidades).where(inArray(identidades.usuarioId, ids));
    const conversasIds = (await ctx.banco.select({ id: participantesConversa.conversaId }).from(participantesConversa).where(inArray(participantesConversa.identidadeId, ident))).map((linha) => linha.id);
    if (conversasIds.length > 0) {
      await ctx.banco.transaction(async (transacao) => {
        await transacao.delete(anexosMensagem).where(inArray(anexosMensagem.conversaId, conversasIds));
        await transacao.delete(mensagens).where(inArray(mensagens.conversaId, conversasIds));
      });
      await ctx.banco.delete(conversas).where(inArray(conversas.id, conversasIds));
    }
    await ctx.banco.delete(identidades).where(inArray(identidades.usuarioId, ids));
    await ctx.banco.delete(users).where(and(inArray(users.id, ids), eq(users.isAnonymous, true)));
  }
  // Dispositivos e sessões saem com as contas (FK em cascata) na limpeza comum.
  await ctx.encerrar();
});

describe("registro do dispositivo (conta da sessão)", () => {
  it("registra a instalação na conta e na sessão de quem chamou; sem sessão 401; corpo inválido ou com usuarioId 400", async () => {
    const linha = await dispositivo(instalacoes.ana);
    assert.equal(linha?.usuarioId, await usuarioDe(ana));
    assert.equal(linha?.token, TOKENS.ana);
    assert.equal(linha?.plataforma, "android");
    assert.equal((await registrar({ ...ana, cookie: "" }, randomUUID(), token("sem-sessao"))).status, 401);
    assert.equal((await registrar(ana, randomUUID(), "token-qualquer")).status, 400);
    assert.equal((await chamar(ana, "PUT", "/dispositivos-push", { instalacaoId: "nao-uuid", token: token("x"), plataforma: "android" })).status, 400);
    assert.equal((await chamar(ana, "PUT", "/dispositivos-push", { instalacaoId: randomUUID(), token: token("x"), plataforma: "windows" })).status, 400);
    const comConta = await chamar(ana, "PUT", "/dispositivos-push", { instalacaoId: randomUUID(), token: token("x"), plataforma: "android", usuarioId: await usuarioDe(caio) });
    assert.equal(comConta.status, 400, "a conta nunca vem do corpo");
  });

  it("visitante não registra aparelho (CONTA_NECESSARIA)", async () => {
    const visitante = await criarVisitante();
    const resposta = await registrar(visitante, randomUUID(), token("visitante"));
    assert.equal(resposta.status, 403);
    assert.equal(resposta.corpo.codigo, "CONTA_NECESSARIA");
  });

  it("repetir a mesma instalação é upsert (uma linha); token renovado substitui o anterior", async () => {
    const instalacao = randomUUID();
    await registrar(beto, instalacao, token("beto-velho"));
    await registrar(beto, instalacao, token("beto-velho"));
    await registrar(beto, instalacao, token("beto-novo"));
    const linhas = await ctx.banco.select().from(dispositivosPush).where(eq(dispositivosPush.instalacaoId, instalacao));
    assert.deepEqual(linhas.map((linha) => linha.token), [token("beto-novo")]);
    await ctx.banco.delete(dispositivosPush).where(eq(dispositivosPush.instalacaoId, instalacao));
  });

  it("vários aparelhos: a mesma conta tem as duas instalações, cada uma na sua sessão", async () => {
    const [um, dois] = [await dispositivo(instalacoes.junior1), await dispositivo(instalacoes.junior2)];
    assert.equal(um?.usuarioId, dois?.usuarioId);
    assert.notEqual(um?.sessaoId, dois?.sessaoId);
  });

  it("troca de conta no aparelho: a instalação passa para a conta nova (a antiga deixa de receber); reinstalação com o mesmo token tira a antiga", async () => {
    const instalacao = randomUUID();
    const compartilhado = token("aparelho-compartilhado");
    await registrar(caio, instalacao, compartilhado);
    await registrar(beto, instalacao, compartilhado);
    const linha = await dispositivo(instalacao);
    assert.equal(linha?.usuarioId, await usuarioDe(beto));
    assert.equal((await ctx.banco.select().from(dispositivosPush).where(eq(dispositivosPush.token, compartilhado))).length, 1);

    // Mensagem para o Caio não vai mais ao aparelho que agora é do Beto.
    await enviarTexto(ana, await conversaCom(ana, "pu_caio"), "para o Caio");
    assert.equal(para(compartilhado).length, 0);

    const reinstalada = randomUUID();
    await registrar(beto, reinstalada, compartilhado);
    assert.equal(await dispositivo(instalacao), undefined);
    assert.ok(await dispositivo(reinstalada));
    await ctx.banco.delete(dispositivosPush).where(eq(dispositivosPush.instalacaoId, reinstalada));
  });

  it("logout: só a própria conta remove a instalação; encerrar a sessão também leva a linha junto", async () => {
    const instalacao = randomUUID();
    await registrar(caio, instalacao, token("caio-logout"));
    assert.equal((await chamar(ana, "DELETE", `/dispositivos-push/${instalacao}`)).status, 204);
    assert.ok(await dispositivo(instalacao), "outra conta não desliga o aparelho alheio");
    assert.equal((await chamar({ ...caio, cookie: "" }, "DELETE", `/dispositivos-push/${instalacao}`)).status, 401);
    assert.equal((await chamar(caio, "DELETE", "/dispositivos-push/nao-uuid")).status, 400);
    assert.equal((await chamar(caio, "DELETE", `/dispositivos-push/${instalacao}`)).status, 204);
    assert.equal(await dispositivo(instalacao), undefined);

    const caioOutroAparelho = await outraSessao(2, caio);
    const instalacaoDois = randomUUID();
    await registrar(caioOutroAparelho, instalacaoDois, token("caio-sign-out"));
    assert.equal((await chamar(caioOutroAparelho, "POST", "/api/auth/sign-out", {})).status, 200);
    assert.equal(await dispositivo(instalacaoDois), undefined, "sessão apagada no sign-out leva o dispositivo");
  });
});

describe("nova mensagem → push (identidade destinatária → contas que a operam → aparelhos)", () => {
  it("conta → conta: um push no aparelho da destinatária, sem conteúdo nem autor; ninguém mais recebe", async () => {
    const conversaId = await conversaCom(beto, "pu_ana");
    await enviarTexto(beto, conversaId, "Segredo: a senha do portão é 1234");
    assert.equal(enviados.length, 1);
    const [aviso] = para(TOKENS.ana);
    assert.ok(aviso);
    assert.deepEqual([aviso.titulo, aviso.texto, aviso.canal], [TITULO_PUSH_NOVA_MENSAGEM, TEXTO_PUSH_NOVA_MENSAGEM, CANAL_PUSH_MENSAGENS]);
    assert.ok(!JSON.stringify(aviso).includes("1234") && !JSON.stringify(aviso).includes("Beto"), "conteúdo e autor nunca vão no push");
    assert.deepEqual(dadosPushSchema.parse(aviso.dados), { v: 1, evento: "nova-mensagem", identidadeId: ana.identidadeId, conversaId });
  });

  it("visitante → conta: o destinatário cadastrado recebe como de qualquer conta (o visitante não tem aparelho)", async () => {
    const visitante = await criarVisitante();
    const conversaId = await conversaCom(visitante, "pu_ana");
    await enviarTexto(visitante, conversaId, "oi, vim pelo link");
    assert.deepEqual(enviados.map((mensagem) => mensagem.token), [TOKENS.ana]);
    assert.equal(dadosPushSchema.parse(para(TOKENS.ana)[0]?.dados).conversaId, conversaId);
  });

  it("conta → empresa: TODOS os aparelhos de quem opera a empresa (Junior, nos dois); o toque abre como a empresa", async () => {
    const conversaId = await conversaCom(ana, "pu_restaurante");
    await enviarTexto(ana, conversaId, "Vocês abrem hoje?");
    assert.deepEqual(enviados.map((mensagem) => mensagem.token).sort(), [TOKENS.junior1, TOKENS.junior2].sort());
    assert.equal(dadosPushSchema.parse(para(TOKENS.junior1)[0]?.dados).identidadeId, restaurante.identidadeId);
  });

  it("remetente nunca recebe: Junior escreve, como pessoa, à empresa que ele mesmo opera → nenhum push", async () => {
    const conversaId = await conversaCom(junior, "pu_restaurante");
    await enviarTexto(junior, conversaId, "teste interno");
    assert.equal(enviados.length, 0);
  });

  it("um fato = no máximo um push por aparelho, mesmo alcançado por duas identidades ou publicado duas vezes", async () => {
    const evento: EventoDominioMensagens = {
      tipo: "notificacao-nova-mensagem",
      conversaId: randomUUID(),
      mensagemId: randomUUID(),
      remetente: { identidadeId: ana.identidadeId, tipo: "pessoal", nomeExibicao: "Ana Souza", nomeUsuario: "pu_ana" },
      previaConteudo: "x",
      conteudoTruncado: false,
      criadoEm: new Date(),
      operadorUsuarioId: await usuarioDe(ana),
      destinatariosIdentidadeIds: [junior.identidadeId, restaurante.identidadeId],
    };
    ctx.eventosMensagens.publicar(evento);
    ctx.eventosMensagens.publicar(evento);
    await servico.ocioso();
    assert.deepEqual(enviados.map((mensagem) => mensagem.token).sort(), [TOKENS.junior1, TOKENS.junior2].sort());
  });

  it("destinatário sem aparelho: nada é enviado e nada falha", async () => {
    const falhasAntes = falhas.length;
    await ctx.banco.delete(dispositivosPush).where(eq(dispositivosPush.instalacaoId, instalacoes.caio));
    await enviarTexto(beto, await conversaCom(beto, "pu_caio"), "oi Caio");
    assert.equal(enviados.length, 0);
    assert.equal(falhas.length, falhasAntes);
    assert.equal((await registrar(caio, instalacoes.caio, TOKENS.caio)).status, 204);
  });

  it("sessão vencida: o aparelho dela deixa de receber", async () => {
    const { sessaoId } = (await dispositivo(instalacoes.caio)) ?? { sessaoId: "" };
    const [original] = await ctx.banco.select({ expiraEm: sessions.expiresAt }).from(sessions).where(eq(sessions.id, sessaoId));
    await ctx.banco.update(sessions).set({ expiresAt: new Date(Date.now() - 60_000) }).where(eq(sessions.id, sessaoId));
    await enviarTexto(beto, await conversaCom(beto, "pu_caio"), "oi");
    assert.equal(para(TOKENS.caio).length, 0);
    await ctx.banco.update(sessions).set({ expiresAt: original?.expiraEm ?? new Date() }).where(eq(sessions.id, sessaoId));
  });

  it("quem não opera a identidade não recebe: Caio nunca recebe o que é do Restaurante ou da Ana", async () => {
    for (const nomeUsuario of ["pu_restaurante", "pu_ana"]) {
      await enviarTexto(beto, await conversaCom(beto, nomeUsuario), "oi");
    }
    assert.equal(para(TOKENS.caio).length, 0);
    assert.ok(enviados.length >= 2);
  });

  it("o realtime continua igual: a destinatária conectada recebe mensagem e aviso, sem campo do push", async () => {
    const socket = await ctx.conectar(ana);
    const avisos = coletar<EventoNotificacaoNovaMensagem & Record<string, unknown>>(socket, EVENTO_NOTIFICACAO_NOVA_MENSAGEM);
    const conversaId = await conversaCom(beto, "pu_ana");
    const enviada = await enviarTexto(beto, conversaId, "pelo realtime");
    await aguardarAte(() => avisos.some((aviso) => aviso.mensagemId === enviada.id));
    assert.ok(avisos.every((aviso) => !("operadorUsuarioId" in aviso)), "a conta do autor nunca vai ao cliente");
    assert.equal(para(TOKENS.ana).length, 1, "conectada ou não, o aparelho recebe o push (o app decide o que mostrar)");
    socket.disconnect();
  });
});

describe("provedor: token inválido, recibos e falha", () => {
  it("ticket DeviceNotRegistered invalida o token na hora; o próximo aviso já não vai a ele", async () => {
    const instalacao = randomUUID();
    const morto = token("beto-desinstalado");
    await registrar(beto, instalacao, morto);
    respostaPorToken.set(morto, { status: "erro", erro: ERRO_DISPOSITIVO_NAO_REGISTRADO });
    const conversaId = await conversaCom(ana, "pu_beto");
    await enviarTexto(ana, conversaId, "um");
    assert.ok((await dispositivo(instalacao))?.invalidadoEm);
    enviados.length = 0;
    await enviarTexto(ana, conversaId, "dois");
    assert.equal(para(morto).length, 0);
    assert.equal(para(TOKENS.beto).length, 1, "o outro aparelho do Beto continua");
    // Registrar de novo "revive": o aparelho acabou de provar que o token vale.
    await registrar(beto, instalacao, morto);
    assert.equal((await dispositivo(instalacao))?.invalidadoEm, null);
    await ctx.banco.delete(dispositivosPush).where(eq(dispositivosPush.instalacaoId, instalacao));
  });

  it("recibo DeviceNotRegistered (consultado ~15 min depois) também invalida; recibo ok não mexe", async () => {
    const instalacao = randomUUID();
    const tokenAlvo = token("beto-recibo");
    await registrar(beto, instalacao, tokenAlvo);
    respostaPorToken.set(tokenAlvo, { status: "ok", id: "ticket-recibo-ruim" });
    respostaPorToken.set(TOKENS.beto, { status: "ok", id: "ticket-recibo-bom" });
    recibos.set("ticket-recibo-ruim", { status: "erro", erro: ERRO_DISPOSITIVO_NAO_REGISTRADO });
    recibos.set("ticket-recibo-bom", { status: "ok" });
    await enviarTexto(ana, await conversaCom(ana, "pu_beto"), "recibo");
    await servico.verificarRecibos();
    assert.equal((await dispositivo(instalacao))?.invalidadoEm, null, "antes de 15 min, nada é consultado");
    relogio += 16 * 60_000;
    await servico.verificarRecibos();
    assert.ok((await dispositivo(instalacao))?.invalidadoEm);
    assert.equal((await dispositivo(instalacoes.beto))?.invalidadoEm, null);
    await ctx.banco.delete(dispositivosPush).where(eq(dispositivosPush.instalacaoId, instalacao));
  });

  it("provedor fora do ar: a mensagem existe e chega pelo histórico; a falha só é registrada", async () => {
    provedorFalha = true;
    const falhasAntes = falhas.length;
    const conversaId = await conversaCom(ana, "pu_beto");
    const enviada = await enviarTexto(ana, conversaId, "mesmo sem push");
    const historico = await chamar(beto, "GET", `/conversas/${conversaId}/mensagens`);
    assert.ok(JSON.stringify(historico.corpo).includes(String(enviada.id)));
    assert.equal(falhas.length, falhasAntes + 1);
  });
});
