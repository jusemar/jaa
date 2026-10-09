import "./apoio/exigir-banco-de-teste.js";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { criarConexaoBanco } from "@jaa/banco";
import { dispositivosAutorizados, identidades, rateLimits, users, verifications } from "@jaa/banco/schema";
import { betterAuth } from "better-auth";
import { testUtils } from "better-auth/plugins";
import { and, eq, inArray, isNull, like, or } from "drizzle-orm";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { criarAplicacao } from "../src/aplicacao.js";
import { criarOpcoesAutenticacao } from "../src/features/autenticacao/autenticacao.js";
import { JANELA_PARA_CRIAR_PIN_SEGUNDOS, POLITICA_PIN, VALIDADE_CREDENCIAL_WEB_SEGUNDOS, consequenciaDoErro } from "../src/features/autenticacao/pin/politica-pin.js";
import { criarAvisoSessoesEncerradas } from "../src/features/autenticacao/lib/sessoes-encerradas.js";
import { criarCanalEventosMensagens } from "../src/features/mensagens/lib/eventos-mensagens.js";
import { carregarAmbiente } from "../src/lib/ambiente.js";

/*
 * PIN DO DISPOSITIVO AUTORIZADO de ponta a ponta: Fastify + Better Auth + PostgreSQL de teste.
 * Os entregadores de código são FALSOS e contados: nenhum SMS e nenhum e-mail real.
 */

const ORIGEM_WEB = "http://localhost:3000";
const ORIGEM_APP = "jaa-dev://";
const PREFIXO_IP = "198.18.8.";
const TELEFONES = Array.from({ length: 17 }, (_, indice) => `+55319876800${String(indice + 1).padStart(2, "0")}`);
const [TEL_ANA, TEL_BIA, TEL_BLOQUEIO, TEL_APP, TEL_REMOVIDO, TEL_SENHA, TEL_SAIR, TEL_LIMITE, TEL_TROCA, TEL_BIO_A, TEL_BIO_B, TEL_BIO_REVOGADO, TEL_BIO_REMOVIDO, TEL_BIO_PIN, TEL_BIO_SAIR, TEL_MULTI_A, TEL_MULTI_B] = TELEFONES as [
  string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string,
];
const EMAIL_PIN = "pin.dispositivo@teste-jaa.example";
const PIN = "482913";
const OUTRO_PIN = "135790";
const SENHA = "senha-boa-do-jaa-2026";
const COOKIE_DISPOSITIVO = "better-auth.dispositivo";
const COOKIE_SESSAO = "better-auth.session_token";

const ambiente = carregarAmbiente();
const ambienteDoTeste = { ...ambiente, ORIGENS_WEB_PERMITIDAS: [ORIGEM_WEB] };
const conexao = criarConexaoBanco(ambiente.DATABASE_URL);
const { banco } = conexao;

// Entregadores falsos e CONTADOS: entrar com PIN não pode gerar código nenhum.
let codigosEnviados = 0;
const codigosDeEmail = new Map<string, string>();
const opcoes = criarOpcoesAutenticacao({
  banco,
  ambiente: ambienteDoTeste,
  entregadorOtp: {
    enviar: async () => {
      codigosEnviados++;
    },
  },
  entregadorOtpEmail: {
    enviar: async ({ email, codigo }) => {
      codigosEnviados++;
      codigosDeEmail.set(email, codigo);
    },
    avisarEnderecoJaCadastrado: async () => {},
  },
  sessoesEncerradas: criarAvisoSessoesEncerradas(),
});
const autenticacao = betterAuth({ ...opcoes, plugins: [...opcoes.plugins, testUtils({ captureOTP: true })] });

let app: FastifyInstance;
let ultimoIp = 0;
const novoIp = () => `${PREFIXO_IP}${++ultimoIp}`;

interface Pedido {
  corpo?: unknown;
  cookies?: string[];
  ip?: string;
  /** "app" = sem Origin de navegador, com o scheme do aplicativo (como o cliente do Expo envia). */
  de?: "web" | "app";
}

function requisitar(metodo: "GET" | "POST", url: string, { corpo, cookies = [], ip, de = "web" }: Pedido = {}): Promise<LightMyRequestResponse> {
  return app.inject({
    method: metodo,
    url,
    remoteAddress: ip ?? novoIp(),
    headers: {
      ...(de === "web" ? { origin: ORIGEM_WEB } : { "expo-origin": ORIGEM_APP }),
      ...(corpo !== undefined ? { "content-type": "application/json" } : {}),
      ...(cookies.length > 0 ? { cookie: cookies.join("; ") } : {}),
    },
    ...(corpo !== undefined ? { payload: JSON.stringify(corpo) } : {}),
  });
}
const pin = (acao: "situacao" | "criar" | "entrar" | "remover", pedido: Pedido = {}) => requisitar("POST", `/api/auth/pin/${acao}`, { corpo: {}, ...pedido });

const cookieDaResposta = (resposta: LightMyRequestResponse, nome: string) => resposta.cookies.find((cookie) => cookie.name === nome);
function cookieObrigatorio(resposta: LightMyRequestResponse, nome: string): string {
  const cookie = cookieDaResposta(resposta, nome);
  assert.ok(cookie?.value, `cookie ${nome} ausente`);
  return `${cookie.name}=${cookie.value}`;
}
const valorDoCookie = (cookie: string) => decodeURIComponent(cookie.slice(cookie.indexOf("=") + 1));
const sha256 = (valor: string) => createHash("sha256").update(valor).digest("hex");
// O que quem está de fora enxerga: status e corpo.
const publico = (resposta: LightMyRequestResponse) => `${resposta.statusCode} ${resposta.body}`;

/** Entra por CÓDIGO no celular (o fluxo de sempre) e devolve o cookie de sessão. */
async function entrarPorCodigo(telefone: string, de: "web" | "app" = "web") {
  const ip = novoIp();
  const envio = await requisitar("POST", "/api/auth/phone-number/send-otp", { corpo: { phoneNumber: telefone }, ip, de });
  assert.equal(envio.statusCode, 200, envio.body);
  const codigo = (await autenticacao.$context).test.getOTP?.(telefone);
  assert.ok(codigo, "código não capturado");
  const verificacao = await requisitar("POST", "/api/auth/phone-number/verify", { corpo: { phoneNumber: telefone, code: codigo }, ip, de });
  assert.equal(verificacao.statusCode, 200, verificacao.body);
  return { sessao: cookieObrigatorio(verificacao, COOKIE_SESSAO), usuarioId: (verificacao.json().user as { id: string }).id };
}

/** Entra por código e cria o PIN deste "navegador": devolve sessão e cookie do dispositivo. */
async function autorizarNavegador(telefone: string, codigoPin = PIN) {
  const conta = await entrarPorCodigo(telefone);
  const criacao = await pin("criar", { corpo: { pin: codigoPin, confirmacao: codigoPin }, cookies: [conta.sessao] });
  assert.equal(criacao.statusCode, 200, criacao.body);
  return { ...conta, dispositivo: cookieObrigatorio(criacao, COOKIE_DISPOSITIVO) };
}

const entrarComPin = (dispositivo: string | null, codigoPin: string, extra: Pedido = {}) => pin("entrar", { corpo: { pin: codigoPin }, cookies: dispositivo ? [dispositivo] : [], ...extra });
const contaDaSessao = (sessao: string) => requisitar("GET", "/usuarios/eu", { cookies: [sessao] });

const autorizacoesDe = (usuarioId: string) => banco.select().from(dispositivosAutorizados).where(eq(dispositivosAutorizados.usuarioId, usuarioId));
const autorizacaoAtivaDe = async (usuarioId: string) => {
  const [linha] = await banco.select().from(dispositivosAutorizados).where(and(eq(dispositivosAutorizados.usuarioId, usuarioId), isNull(dispositivosAutorizados.revogadoEm)));
  return linha;
};
// A autorização DESTE navegador (uma conta pode ter vários dispositivos autorizados).
const autorizacaoDoCookie = async (dispositivo: string) => {
  const [linha] = await banco.select().from(dispositivosAutorizados).where(eq(dispositivosAutorizados.credencialHash, sha256(valorDoCookie(dispositivo))));
  return linha;
};
// O tempo de bloqueio "passa" só na linha deste teste.
const encerrarBloqueio = (usuarioId: string) => banco.update(dispositivosAutorizados).set({ bloqueadoAte: new Date(Date.now() - 1000) }).where(eq(dispositivosAutorizados.usuarioId, usuarioId));

async function limpar() {
  const contas = banco.select({ id: users.id }).from(users).where(or(inArray(users.phoneNumber, TELEFONES), eq(users.email, EMAIL_PIN)));
  await banco.delete(identidades).where(inArray(identidades.usuarioId, contas));
  await banco.delete(users).where(or(inArray(users.phoneNumber, TELEFONES), eq(users.email, EMAIL_PIN))); // sessões e dispositivos em cascata
  await banco.delete(verifications).where(or(inArray(verifications.identifier, TELEFONES), like(verifications.identifier, `%${EMAIL_PIN}`)));
  await banco.delete(rateLimits).where(or(like(rateLimits.key, `${PREFIXO_IP}%`), like(rateLimits.key, "jaa:otp-email%")));
}

before(async () => {
  await limpar();
  app = await criarAplicacao({ ambiente: { ...ambienteDoTeste, OTP_EMAIL_ENTREGA: "resend" }, banco, autenticacao, eventosMensagens: criarCanalEventosMensagens(), logger: false });
  await app.ready();
});

after(async () => {
  await app.close();
  await limpar();
  await conexao.encerrar();
});

describe("política de tentativas do PIN (regra pura)", () => {
  it("1º e 2º erro liberam nova tentativa; 3º bloqueia 1 min; 4º bloqueia 5 min; 5º revoga", () => {
    assert.deepEqual([1, 2, 3, 4, 5, 6, 50].map((erros) => consequenciaDoErro(erros)), [
      { tipo: "nenhuma" },
      { tipo: "nenhuma" },
      { tipo: "bloqueio", segundos: 60 },
      { tipo: "bloqueio", segundos: 300 },
      { tipo: "revogar" },
      { tipo: "revogar" },
      { tipo: "revogar" },
    ]);
    assert.deepEqual(POLITICA_PIN, { bloqueios: [{ noErro: 3, segundos: 60 }, { noErro: 4, segundos: 300 }], revogarNoErro: 5 });
    assert.equal(JANELA_PARA_CRIAR_PIN_SEGUNDOS, 600);
  });
});

describe("dispositivo sem autorização", () => {
  it("não oferece PIN, e um PIN qualquer não entra em lugar nenhum", async () => {
    assert.deepEqual((await pin("situacao")).json(), { autorizado: false, biometria: false });
    const entrada = await entrarComPin(null, PIN);
    assert.equal(entrada.statusCode, 401, entrada.body);
    assert.equal(entrada.json().code, "PIN_NAO_ACEITO");
    assert.equal(cookieDaResposta(entrada, COOKIE_SESSAO), undefined);
  });
});

describe("criar o PIN do dispositivo", () => {
  it("exige sessão", async () => {
    const semSessao = await pin("criar", { corpo: { pin: PIN, confirmacao: PIN } });
    assert.equal(semSessao.statusCode, 401, semSessao.body);
  });

  it("só com exatamente 6 números e confirmação igual; nada é gravado no erro", async () => {
    const ana = await entrarPorCodigo(TEL_ANA);
    for (const corpo of [
      { pin: "12345", confirmacao: "12345" },
      { pin: "1234567", confirmacao: "1234567" },
      { pin: "12a456", confirmacao: "12a456" },
      { pin: " 12345", confirmacao: " 12345" },
      { pin: PIN, confirmacao: OUTRO_PIN },
      { pin: PIN },
      { pin: 482913, confirmacao: 482913 },
      {},
    ]) {
      const resposta = await pin("criar", { corpo, cookies: [ana.sessao] });
      assert.equal(resposta.statusCode, 400, `${JSON.stringify(corpo)}: ${resposta.body}`);
      assert.equal(resposta.json().code, "PIN_INVALIDO");
      assert.equal(cookieDaResposta(resposta, COOKIE_DISPOSITIVO), undefined);
    }
    assert.equal((await autorizacoesDe(ana.usuarioId)).length, 0);
  });

  it("depois do código: cria a autorização, entrega a credencial em cookie protegido e não guarda nada em claro", async () => {
    const ana = await entrarPorCodigo(TEL_ANA);
    const criacao = await pin("criar", { corpo: { pin: PIN, confirmacao: PIN }, cookies: [ana.sessao] });
    assert.equal(criacao.statusCode, 200, criacao.body);
    // No navegador a credencial NUNCA vem no corpo (o JavaScript da página não a vê).
    assert.deepEqual(criacao.json(), { autorizado: true });

    const cookie = cookieDaResposta(criacao, COOKIE_DISPOSITIVO);
    assert.ok(cookie, "cookie do dispositivo ausente");
    assert.equal(cookie.httpOnly, true);
    assert.equal(cookie.sameSite, "Lax");
    assert.equal(cookie.path, "/api/auth/pin");
    assert.equal(cookie.maxAge, VALIDADE_CREDENCIAL_WEB_SEGUNDOS);
    const credencial = decodeURIComponent(cookie.value);
    assert.ok(credencial.length >= 43, "credencial de 256 bits");

    const [linha, ...resto] = await autorizacoesDe(ana.usuarioId);
    assert.ok(linha && resto.length === 0);
    assert.equal(linha.credencialHash, sha256(credencial));
    assert.notEqual(linha.pinHash, PIN);
    assert.notEqual(linha.pinHash, sha256(PIN));
    const tudoOQueFoiGravado = JSON.stringify(linha);
    assert.ok(!tudoOQueFoiGravado.includes(credencial), "credencial em claro no banco");
    assert.ok(!tudoOQueFoiGravado.includes(PIN), "PIN em claro no banco");
    assert.deepEqual([linha.tentativasErradas, linha.bloqueadoAte, linha.revogadoEm, linha.ultimoUsoEm], [0, null, null, null]);

    assert.deepEqual((await pin("situacao", { cookies: [`${COOKIE_DISPOSITIVO}=${cookie.value}`] })).json(), { autorizado: true, biometria: false });
    // Continua na sessão normal de sempre.
    assert.equal((await contaDaSessao(ana.sessao)).statusCode, 200);
  });

  it("dois dispositivos com o mesmo PIN guardam hashes diferentes", async () => {
    const [ana, bia] = [await autorizarNavegador(TEL_ANA), await autorizarNavegador(TEL_BIA)];
    const [deAna, deBia] = [await autorizacaoDoCookie(ana.dispositivo), await autorizacaoDoCookie(bia.dispositivo)];
    assert.ok(deAna && deBia);
    assert.notEqual(deAna.pinHash, deBia.pinHash);
  });

  it("criar de novo no mesmo dispositivo troca o PIN: o anterior deixa de valer", async () => {
    const primeiro = await autorizarNavegador(TEL_TROCA, PIN);
    const denovo = await entrarPorCodigo(TEL_TROCA);
    const troca = await pin("criar", { corpo: { pin: OUTRO_PIN, confirmacao: OUTRO_PIN }, cookies: [denovo.sessao, primeiro.dispositivo] });
    assert.equal(troca.statusCode, 200, troca.body);
    const novo = cookieObrigatorio(troca, COOKIE_DISPOSITIVO);
    assert.notEqual(novo, primeiro.dispositivo);

    const linhas = await autorizacoesDe(primeiro.usuarioId);
    assert.equal(linhas.filter((linha) => linha.revogadoEm === null).length, 1);
    assert.equal((await entrarComPin(primeiro.dispositivo, PIN)).statusCode, 401);
    assert.equal((await entrarComPin(novo, PIN)).statusCode, 401, "o PIN antigo não vale na autorização nova");
    assert.equal((await entrarComPin(novo, OUTRO_PIN)).statusCode, 200);
  });

  it("sessão aberta por SENHA (sem código) não cria PIN; sessão aberta por código de e-mail cria", async () => {
    const conta = await entrarPorCodigo(TEL_SENHA);
    await requisitar("POST", "/identidades/pessoal", { corpo: { nomeExibicao: "pin_senha", nomeUsuario: "pin_senha" }, cookies: [conta.sessao] });
    assert.equal((await requisitar("POST", "/conta/senha", { corpo: { senha: SENHA }, cookies: [conta.sessao] })).statusCode, 200);
    const porSenha = await requisitar("POST", "/autenticacao/entrar", { corpo: { identificador: "pin_senha", senha: SENHA } });
    assert.equal(porSenha.statusCode, 200, porSenha.body);
    const negado = await pin("criar", { corpo: { pin: PIN, confirmacao: PIN }, cookies: [cookieObrigatorio(porSenha, COOKIE_SESSAO)] });
    assert.equal(negado.statusCode, 403, negado.body);
    assert.equal(negado.json().code, "CODIGO_NECESSARIO");

    const ip = novoIp();
    assert.equal((await requisitar("POST", "/api/auth/email-otp/send-verification-otp", { corpo: { email: EMAIL_PIN, type: "sign-in" }, ip })).statusCode, 200);
    const porEmail = await requisitar("POST", "/api/auth/sign-in/email-otp", { corpo: { email: EMAIL_PIN, otp: codigosDeEmail.get(EMAIL_PIN) }, ip });
    assert.equal(porEmail.statusCode, 200, porEmail.body);
    const criado = await pin("criar", { corpo: { pin: PIN, confirmacao: PIN }, cookies: [cookieObrigatorio(porEmail, COOKIE_SESSAO)] });
    assert.equal(criado.statusCode, 200, criado.body);
  });

  it("a janela para criar o PIN fecha: depois dela é preciso entrar com o código de novo", async () => {
    const ana = await entrarPorCodigo(TEL_ANA);
    await banco.update(verifications).set({ expiresAt: new Date(Date.now() - 1000) }).where(like(verifications.identifier, "pin-codigo-comprovado:%"));
    const negado = await pin("criar", { corpo: { pin: PIN, confirmacao: PIN }, cookies: [ana.sessao] });
    assert.equal(negado.statusCode, 403, negado.body);
    assert.equal(negado.json().code, "CODIGO_NECESSARIO");
  });
});

describe("entrar com PIN", () => {
  it("PIN certo no dispositivo certo abre uma sessão normal, na mesma conta, sem enviar código nenhum", async () => {
    const ana = await autorizarNavegador(TEL_ANA);
    const enviadosAntes = codigosEnviados;
    const entrada = await entrarComPin(ana.dispositivo, PIN);
    assert.equal(entrada.statusCode, 200, entrada.body);
    assert.deepEqual(entrada.json(), { autenticado: true });

    const sessao = cookieObrigatorio(entrada, COOKIE_SESSAO);
    assert.notEqual(sessao, ana.sessao, "é uma sessão nova");
    assert.equal(cookieDaResposta(entrada, COOKIE_SESSAO)?.httpOnly, true);
    assert.equal((await contaDaSessao(sessao)).statusCode, 200);
    const [daSessao] = await banco.select({ id: users.id }).from(users).where(eq(users.phoneNumber, TEL_ANA));
    assert.equal(daSessao?.id, ana.usuarioId);
    assert.equal(codigosEnviados, enviadosAntes, "nenhum SMS/e-mail");
    // A credencial do navegador é renovada, e o uso fica registrado.
    assert.equal(cookieDaResposta(entrada, COOKIE_DISPOSITIVO)?.maxAge, VALIDADE_CREDENCIAL_WEB_SEGUNDOS);
    assert.ok((await autorizacaoDoCookie(ana.dispositivo))?.ultimoUsoEm instanceof Date);
  });

  it("o cliente não escolhe a conta: usuário, e-mail ou telefone no corpo são recusados", async () => {
    const [ana, bia] = [await autorizarNavegador(TEL_ANA), await autorizarNavegador(TEL_BIA)];
    for (const extra of [{ usuarioId: bia.usuarioId }, { userId: bia.usuarioId }, { phoneNumber: TEL_BIA }, { email: EMAIL_PIN }]) {
      const entrada = await pin("entrar", { corpo: { pin: PIN, ...extra }, cookies: [ana.dispositivo] });
      // O contrato ignora campos desconhecidos: quem entra é sempre a conta da CREDENCIAL.
      assert.equal(entrada.statusCode, 200, entrada.body);
      const [dona] = await banco.select({ telefone: users.phoneNumber }).from(users).where(eq(users.id, ana.usuarioId));
      const eu = await contaDaSessao(cookieObrigatorio(entrada, COOKIE_SESSAO));
      assert.equal(eu.statusCode, 200);
      assert.equal(dona?.telefone, TEL_ANA);
    }
  });

  it("PIN certo em OUTRO dispositivo, sem credencial ou com credencial inventada não entra — e a resposta é a mesma do PIN errado", async () => {
    const ana = await autorizarNavegador(TEL_ANA, PIN);
    const bia = await autorizarNavegador(TEL_BIA, OUTRO_PIN);
    const inventada = `${COOKIE_DISPOSITIVO}=${"x".repeat(43)}`;

    const respostas = [
      await entrarComPin(bia.dispositivo, PIN), // PIN da Ana no dispositivo da Bia
      await entrarComPin(null, PIN),
      await entrarComPin(inventada, PIN),
      await entrarComPin(ana.dispositivo, "000000"), // dispositivo certo, PIN errado
    ];
    for (const resposta of respostas) {
      assert.equal(resposta.statusCode, 401, resposta.body);
      assert.equal(cookieDaResposta(resposta, COOKIE_SESSAO), undefined);
    }
    assert.equal(new Set(respostas.map(publico)).size, 1, "as quatro respostas são idênticas");
    // Nada na resposta fala de conta, dispositivo ou tentativas restantes.
    for (const proibido of ["tentativa", "restam", ana.usuarioId, "revog", "dispositivo não"]) assert.ok(!respostas[0]?.body.includes(proibido), proibido);
  });

  it("no navegador, credencial mandada pelo corpo é ignorada: só o cookie protegido vale", async () => {
    const ana = await autorizarNavegador(TEL_ANA);
    const peloCorpo = await pin("entrar", { corpo: { pin: PIN, credencial: valorDoCookie(ana.dispositivo) } });
    assert.equal(peloCorpo.statusCode, 401, peloCorpo.body);
  });

  it("conta removida: a autorização some junto e o PIN deixa de entrar, com a resposta de sempre", async () => {
    const conta = await autorizarNavegador(TEL_REMOVIDO);
    await banco.delete(users).where(eq(users.id, conta.usuarioId));
    const entrada = await entrarComPin(conta.dispositivo, PIN);
    assert.equal(publico(entrada), publico(await entrarComPin(null, PIN)));
    assert.deepEqual((await pin("situacao", { cookies: [conta.dispositivo] })).json(), { autorizado: false, biometria: false });
  });
});

describe("tentativas, bloqueio progressivo e revogação", () => {
  it("3º erro bloqueia 1 min, 4º bloqueia 5 min, acerto zera; 5 erros seguidos revogam — e o código continua funcionando", async () => {
    const conta = await autorizarNavegador(TEL_BLOQUEIO);
    const errar = () => entrarComPin(conta.dispositivo, "000000");
    const estado = async () => {
      const [linha] = await autorizacoesDe(conta.usuarioId);
      assert.ok(linha);
      return linha;
    };

    assert.equal((await errar()).statusCode, 401);
    assert.equal((await errar()).statusCode, 401);
    assert.equal((await estado()).bloqueadoAte, null);

    // 3º erro: bloqueio de 1 minuto.
    const antes = Date.now();
    const terceiro = await errar();
    assert.equal(terceiro.statusCode, 429, terceiro.body);
    assert.equal(terceiro.json().code, "PIN_BLOQUEADO");
    let linha = await estado();
    assert.equal(linha.tentativasErradas, 3);
    const esperaMs = (linha.bloqueadoAte?.getTime() ?? 0) - antes;
    assert.ok(esperaMs >= 59_000 && esperaMs <= 62_000, `bloqueio de ~60 s, veio ${esperaMs} ms`);

    // Durante o bloqueio nem o PIN certo entra, e a tentativa não conta.
    const duranteBloqueio = await entrarComPin(conta.dispositivo, PIN);
    assert.equal(duranteBloqueio.statusCode, 429, duranteBloqueio.body);
    assert.equal(cookieDaResposta(duranteBloqueio, COOKIE_SESSAO), undefined);
    assert.equal((await estado()).tentativasErradas, 3);
    // A mensagem não diz por quanto tempo nem quantas tentativas restam.
    assert.ok(!/\d/.test(String(duranteBloqueio.json().message)), duranteBloqueio.body);

    // 4º erro (passado o bloqueio): 5 minutos.
    await encerrarBloqueio(conta.usuarioId);
    const antesDoQuarto = Date.now();
    assert.equal((await errar()).statusCode, 429);
    linha = await estado();
    const segundaEsperaMs = (linha.bloqueadoAte?.getTime() ?? 0) - antesDoQuarto;
    assert.ok(segundaEsperaMs >= 299_000 && segundaEsperaMs <= 302_000, `bloqueio de ~300 s, veio ${segundaEsperaMs} ms`);

    // Passado o bloqueio, o PIN certo entra e ZERA a contagem.
    await encerrarBloqueio(conta.usuarioId);
    assert.equal((await entrarComPin(conta.dispositivo, PIN)).statusCode, 200);
    linha = await estado();
    assert.deepEqual([linha.tentativasErradas, linha.bloqueadoAte, linha.revogadoEm], [0, null, null]);

    // 5 erros seguidos: a autorização é revogada.
    for (let erro = 1; erro <= 5; erro++) {
      await encerrarBloqueio(conta.usuarioId);
      const resposta = await errar();
      assert.equal(resposta.statusCode, erro === 3 || erro === 4 ? 429 : 401, `erro ${erro}: ${resposta.body}`);
    }
    linha = await estado();
    assert.ok(linha.revogadoEm instanceof Date);
    assert.deepEqual((await pin("situacao", { cookies: [conta.dispositivo] })).json(), { autorizado: false, biometria: false });
    // Revogado, nem o PIN certo entra — e responde como um dispositivo desconhecido.
    assert.equal(publico(await entrarComPin(conta.dispositivo, PIN)), publico(await entrarComPin(null, PIN)));

    // O caminho de volta é o código, e com ele dá para criar um PIN novo neste dispositivo.
    const denovo = await autorizarNavegador(TEL_BLOQUEIO, OUTRO_PIN);
    assert.equal((await entrarComPin(denovo.dispositivo, OUTRO_PIN)).statusCode, 200);
  });

  it("limite por IP: 5 tentativas de PIN por minuto, valha a credencial ou não", async () => {
    const ip = novoIp();
    const inventada = `${COOKIE_DISPOSITIVO}=${"y".repeat(43)}`;
    for (let tentativa = 1; tentativa <= 5; tentativa++) assert.equal((await entrarComPin(inventada, PIN, { ip })).statusCode, 401);
    const alemDoLimite = await entrarComPin(inventada, PIN, { ip });
    assert.equal(alemDoLimite.statusCode, 429, alemDoLimite.body);
    // Limitado por IP, o dispositivo de verdade também espera — sem contar erro contra ele.
    const conta = await autorizarNavegador(TEL_LIMITE);
    assert.equal((await entrarComPin(conta.dispositivo, PIN, { ip })).statusCode, 429);
    assert.equal((await autorizacaoAtivaDe(conta.usuarioId))?.tentativasErradas, 0);
    assert.equal((await entrarComPin(conta.dispositivo, PIN)).statusCode, 200);
  });
});

describe("aplicativo: credencial no armazenamento seguro do aparelho", () => {
  it("ao criar, a credencial vem UMA vez no corpo (sem cookie de dispositivo) e entra pelo corpo", async () => {
    const conta = await entrarPorCodigo(TEL_APP, "app");
    const criacao = await pin("criar", { corpo: { pin: PIN, confirmacao: PIN }, cookies: [conta.sessao], de: "app" });
    assert.equal(criacao.statusCode, 200, criacao.body);
    const { credencial } = criacao.json() as { credencial?: string };
    assert.ok(credencial && credencial.length >= 43);
    assert.equal(cookieDaResposta(criacao, COOKIE_DISPOSITIVO), undefined);
    assert.equal((await autorizacaoAtivaDe(conta.usuarioId))?.credencialHash, sha256(credencial));

    assert.deepEqual((await pin("situacao", { corpo: { credencial }, de: "app" })).json(), { autorizado: true, biometria: false });
    assert.deepEqual((await pin("situacao", { de: "app" })).json(), { autorizado: false, biometria: false });

    const entrada = await pin("entrar", { corpo: { pin: PIN, credencial }, de: "app" });
    assert.equal(entrada.statusCode, 200, entrada.body);
    assert.equal((await contaDaSessao(cookieObrigatorio(entrada, COOKIE_SESSAO))).statusCode, 200);

    // PIN certo sem a credencial do aparelho, ou com a de outro, não entra.
    assert.equal((await pin("entrar", { corpo: { pin: PIN }, de: "app" })).statusCode, 401);
    assert.equal((await pin("entrar", { corpo: { pin: PIN, credencial: "z".repeat(43) }, de: "app" })).statusCode, 401);

    // Remover: o aparelho deixa de aceitar PIN.
    assert.deepEqual((await pin("remover", { corpo: { credencial }, de: "app" })).json(), { autorizado: false, biometria: false });
    assert.equal((await pin("entrar", { corpo: { pin: PIN, credencial }, de: "app" })).statusCode, 401);
  });
});

describe("sair da conta e remover o PIN", () => {
  it("sair encerra a sessão de verdade e PRESERVA a autorização do dispositivo", async () => {
    const conta = await autorizarNavegador(TEL_SAIR);
    const saida = await requisitar("POST", "/api/auth/sign-out", { corpo: {}, cookies: [conta.sessao, conta.dispositivo] });
    assert.equal(saida.statusCode, 200, saida.body);
    // Nenhuma sessão fica ativa.
    assert.equal((await contaDaSessao(conta.sessao)).statusCode, 401);
    // O navegador continua reconhecido, e o PIN abre uma sessão NOVA.
    assert.deepEqual((await pin("situacao", { cookies: [conta.dispositivo] })).json(), { autorizado: true, biometria: false });
    const entrada = await entrarComPin(conta.dispositivo, PIN);
    assert.equal(entrada.statusCode, 200, entrada.body);
    assert.equal((await contaDaSessao(cookieObrigatorio(entrada, COOKIE_SESSAO))).statusCode, 200);
  });

  it("remover o PIN revoga a autorização e apaga o cookie; a resposta é igual para dispositivo desconhecido", async () => {
    const conta = await autorizarNavegador(TEL_SAIR);
    const remocao = await pin("remover", { cookies: [conta.dispositivo] });
    assert.equal(remocao.statusCode, 200, remocao.body);
    assert.equal(cookieDaResposta(remocao, COOKIE_DISPOSITIVO)?.maxAge, 0);
    assert.ok((await autorizacaoDoCookie(conta.dispositivo))?.revogadoEm instanceof Date);
    assert.equal((await entrarComPin(conta.dispositivo, PIN)).statusCode, 401);
    assert.equal((await pin("remover")).body, remocao.body);
    // A sessão que estava aberta não é afetada.
    assert.equal((await contaDaSessao(conta.sessao)).statusCode, 200);
  });
});

describe("biometria do aparelho (só no aplicativo)", () => {
  const BIOMETRIA = "/api/auth/pin/biometria";
  const biometria = (acao: "ativar" | "entrar" | "desativar", pedido: Pedido = {}) => requisitar("POST", `${BIOMETRIA}/${acao}`, { corpo: {}, de: "app", ...pedido });

  /** Entra por código no app, cria o PIN e devolve sessão + credencial do aparelho. */
  async function autorizarAparelho(telefone: string) {
    const conta = await entrarPorCodigo(telefone, "app");
    const criacao = await pin("criar", { corpo: { pin: PIN, confirmacao: PIN }, cookies: [conta.sessao], de: "app" });
    assert.equal(criacao.statusCode, 200, criacao.body);
    return { ...conta, credencial: (criacao.json() as { credencial: string }).credencial };
  }
  async function ativar(aparelho: { sessao: string; credencial: string }) {
    const ativacao = await biometria("ativar", { corpo: { credencial: aparelho.credencial }, cookies: [aparelho.sessao] });
    assert.equal(ativacao.statusCode, 200, ativacao.body);
    return (ativacao.json() as { segredo: string }).segredo;
  }
  const entrar = (credencial: string | undefined, segredo: string | undefined) => biometria("entrar", { corpo: { ...(credencial ? { credencial } : {}), ...(segredo ? { segredo } : {}) } });
  const linhaDe = async (credencial: string) => {
    const [linha] = await banco.select().from(dispositivosAutorizados).where(eq(dispositivosAutorizados.credencialHash, sha256(credencial)));
    assert.ok(linha);
    return linha;
  };

  it("ativar exige sessão, um aparelho já autorizado da PRÓPRIA conta, e não existe no navegador", async () => {
    const [a, b] = [await autorizarAparelho(TEL_BIO_A), await autorizarAparelho(TEL_BIO_B)];
    assert.equal((await biometria("ativar", { corpo: { credencial: a.credencial } })).statusCode, 401);
    // Credencial do aparelho de OUTRA conta, credencial inventada ou ausente: mesma recusa.
    const recusas = [
      await biometria("ativar", { corpo: { credencial: b.credencial }, cookies: [a.sessao] }),
      await biometria("ativar", { corpo: { credencial: "w".repeat(43) }, cookies: [a.sessao] }),
      await biometria("ativar", { cookies: [a.sessao] }),
    ];
    for (const recusa of recusas) assert.equal(recusa.statusCode, 403, recusa.body);
    assert.equal(new Set(recusas.map(publico)).size, 1);
    assert.equal((await linhaDe(b.credencial)).biometriaHash, null);
    // No navegador a biometria não existe (nem para ativar, nem para entrar, nem para desativar).
    for (const acao of ["ativar", "entrar", "desativar"] as const) {
      const pelaWeb = await biometria(acao, { corpo: { credencial: a.credencial, segredo: "s".repeat(43) }, cookies: [a.sessao], de: "web" });
      assert.equal(pelaWeb.statusCode, 404, `${acao}: ${pelaWeb.body}`);
    }
  });

  it("ativar entrega o segredo UMA vez e o banco guarda só o hash dele", async () => {
    const a = await autorizarAparelho(TEL_BIO_A);
    assert.deepEqual((await pin("situacao", { corpo: { credencial: a.credencial }, de: "app" })).json(), { autorizado: true, biometria: false });
    const segredo = await ativar(a);
    assert.ok(segredo.length >= 43, "segredo de 256 bits");
    assert.notEqual(segredo, a.credencial);

    const linha = await linhaDe(a.credencial);
    assert.equal(linha.biometriaHash, sha256(segredo));
    assert.ok(!JSON.stringify(linha).includes(segredo), "segredo em claro no banco");
    assert.deepEqual((await pin("situacao", { corpo: { credencial: a.credencial }, de: "app" })).json(), { autorizado: true, biometria: true });
  });

  it("entrar: credencial do aparelho + segredo abrem uma sessão normal, sem código e sem tocar no PIN", async () => {
    const a = await autorizarAparelho(TEL_BIO_A);
    const segredo = await ativar(a);
    // Dois PINs errados antes: a biometria não zera nem aumenta essa contagem.
    for (let erro = 1; erro <= 2; erro++) assert.equal((await pin("entrar", { corpo: { pin: "000000", credencial: a.credencial }, de: "app" })).statusCode, 401);

    const enviadosAntes = codigosEnviados;
    const entrada = await entrar(a.credencial, segredo);
    assert.equal(entrada.statusCode, 200, entrada.body);
    assert.deepEqual(entrada.json(), { autenticado: true });
    const sessao = cookieObrigatorio(entrada, COOKIE_SESSAO);
    assert.notEqual(sessao, a.sessao);
    assert.equal((await contaDaSessao(sessao)).statusCode, 200);
    assert.equal(codigosEnviados, enviadosAntes, "nenhum SMS/e-mail");
    const linha = await linhaDe(a.credencial);
    assert.equal(linha.usuarioId, a.usuarioId);
    assert.equal(linha.tentativasErradas, 2);
    assert.ok(linha.ultimoUsoEm instanceof Date);

    // PIN bloqueado (3º erro) não impede a biometria; e o PIN continua bloqueado depois dela.
    assert.equal((await pin("entrar", { corpo: { pin: "000000", credencial: a.credencial }, de: "app" })).statusCode, 429);
    assert.equal((await entrar(a.credencial, segredo)).statusCode, 200);
    assert.equal((await pin("entrar", { corpo: { pin: PIN, credencial: a.credencial }, de: "app" })).statusCode, 429);
  });

  it("segredo errado, de OUTRO aparelho, sem credencial ou sem biometria ativa: mesma recusa, sem sessão", async () => {
    const [a, b] = [await autorizarAparelho(TEL_BIO_A), await autorizarAparelho(TEL_BIO_B)];
    const [segredoA, segredoB] = [await ativar(a), await ativar(b)];
    const semBiometria = await autorizarAparelho(TEL_BIO_B);

    const respostas = [
      await entrar(a.credencial, "e".repeat(43)), // segredo inventado
      await entrar(a.credencial, segredoB), // segredo de outro aparelho
      await entrar(b.credencial, segredoA), // credencial de outro aparelho
      await entrar(undefined, segredoA), // só o segredo, sem o aparelho
      await entrar(a.credencial, undefined),
      await entrar("c".repeat(43), segredoA), // aparelho desconhecido
      await entrar(semBiometria.credencial, segredoA), // aparelho sem biometria ativada
    ];
    for (const resposta of respostas) {
      assert.equal(resposta.statusCode, 401, resposta.body);
      assert.equal(cookieDaResposta(resposta, COOKIE_SESSAO), undefined);
      for (const segredo of [segredoA, segredoB, a.credencial]) assert.ok(!resposta.body.includes(segredo), "segredo na resposta");
    }
    assert.equal(new Set(respostas.map(publico)).size, 1, "as respostas são idênticas");
    assert.equal(respostas[0]?.json().code, "BIOMETRIA_NAO_ACEITA");
    // E os segredos certos, cada um no seu aparelho, entram.
    assert.equal((await entrar(a.credencial, segredoA)).statusCode, 200);
    assert.equal((await entrar(b.credencial, segredoB)).statusCode, 200);
  });

  it("ativar de novo troca o segredo; desativar desliga só a biometria (o PIN continua)", async () => {
    const a = await autorizarAparelho(TEL_BIO_A);
    const antigo = await ativar(a);
    const novo = await ativar(a);
    assert.notEqual(novo, antigo);
    assert.equal((await entrar(a.credencial, antigo)).statusCode, 401);
    assert.equal((await entrar(a.credencial, novo)).statusCode, 200);

    const desativacao = await biometria("desativar", { corpo: { credencial: a.credencial } });
    assert.deepEqual(desativacao.json(), { biometria: false });
    assert.equal((await biometria("desativar", { corpo: { credencial: "d".repeat(43) } })).body, desativacao.body);
    assert.equal((await linhaDe(a.credencial)).biometriaHash, null);
    assert.equal((await entrar(a.credencial, novo)).statusCode, 401);
    assert.equal((await pin("entrar", { corpo: { pin: PIN, credencial: a.credencial }, de: "app" })).statusCode, 200);
  });

  it("dispositivo revogado não entra por biometria: remover o PIN, 5 erros de PIN ou recriar o PIN", async () => {
    // Remover o PIN do aparelho.
    const removido = await autorizarAparelho(TEL_BIO_REVOGADO);
    const segredoRemovido = await ativar(removido);
    await pin("remover", { corpo: { credencial: removido.credencial }, de: "app" });
    const aposRemover = await entrar(removido.credencial, segredoRemovido);
    assert.equal(aposRemover.statusCode, 401, aposRemover.body);
    assert.equal(publico(aposRemover), publico(await entrar("c".repeat(43), segredoRemovido)));

    // 5 erros seguidos de PIN revogam a autorização — e a biometria cai junto.
    const errado = await autorizarAparelho(TEL_BIO_REVOGADO);
    const segredoErrado = await ativar(errado);
    for (let erro = 1; erro <= 5; erro++) {
      await banco.update(dispositivosAutorizados).set({ bloqueadoAte: null }).where(eq(dispositivosAutorizados.credencialHash, sha256(errado.credencial)));
      await pin("entrar", { corpo: { pin: "000000", credencial: errado.credencial }, de: "app" });
    }
    assert.ok((await linhaDe(errado.credencial)).revogadoEm instanceof Date);
    assert.equal((await entrar(errado.credencial, segredoErrado)).statusCode, 401);

    // Recriar o PIN (depois de entrar com o código) gera outra autorização: a biometria antiga não vale nela.
    const antes = await autorizarAparelho(TEL_BIO_REVOGADO);
    const segredoAntes = await ativar(antes);
    const denovo = await entrarPorCodigo(TEL_BIO_REVOGADO, "app");
    const recriado = await pin("criar", { corpo: { pin: PIN, confirmacao: PIN, credencial: antes.credencial }, cookies: [denovo.sessao], de: "app" });
    const novaCredencial = (recriado.json() as { credencial: string }).credencial;
    assert.equal((await entrar(antes.credencial, segredoAntes)).statusCode, 401);
    assert.equal((await entrar(novaCredencial, segredoAntes)).statusCode, 401);
    assert.deepEqual((await pin("situacao", { corpo: { credencial: novaCredencial }, de: "app" })).json(), { autorizado: true, biometria: false });
  });

  it("conta removida não entra por biometria", async () => {
    const conta = await autorizarAparelho(TEL_BIO_REMOVIDO);
    const segredo = await ativar(conta);
    await banco.delete(users).where(eq(users.id, conta.usuarioId));
    assert.equal(publico(await entrar(conta.credencial, segredo)), publico(await entrar("c".repeat(43), segredo)));
  });

  it("sair encerra a sessão e PRESERVA a biometria do aparelho; o PIN segue como alternativa", async () => {
    const conta = await autorizarAparelho(TEL_BIO_SAIR);
    const segredo = await ativar(conta);
    assert.equal((await requisitar("POST", "/api/auth/sign-out", { corpo: {}, cookies: [conta.sessao], de: "app" })).statusCode, 200);
    assert.equal((await contaDaSessao(conta.sessao)).statusCode, 401);
    assert.deepEqual((await pin("situacao", { corpo: { credencial: conta.credencial }, de: "app" })).json(), { autorizado: true, biometria: true });
    assert.equal((await entrar(conta.credencial, segredo)).statusCode, 200);
    assert.equal((await pin("entrar", { corpo: { pin: PIN, credencial: conta.credencial }, de: "app" })).statusCode, 200);
  });

  it("o PIN certo, sozinho, nunca ativa nem substitui a biometria", async () => {
    const conta = await autorizarAparelho(TEL_BIO_PIN);
    // Sem sessão não se ativa, mesmo tendo a credencial do aparelho.
    assert.equal((await biometria("ativar", { corpo: { credencial: conta.credencial } })).statusCode, 401);
    // E o PIN não serve como segredo da biometria.
    assert.equal((await entrar(conta.credencial, PIN.repeat(8))).statusCode, 401);
  });
});

describe("duas contas no mesmo aparelho", () => {
  const BIOMETRIA = "/api/auth/pin/biometria";
  const app = (pedido: Pedido): Pedido => ({ de: "app", ...pedido });

  /** Entra por código no app, cria o PIN (apresentando, se houver, a credencial que o aparelho guardava) e ativa a biometria. */
  async function autorizar(telefone: string, codigoPin: string, credencialGuardada?: string) {
    const conta = await entrarPorCodigo(telefone, "app");
    const criacao = await pin("criar", app({ corpo: { pin: codigoPin, confirmacao: codigoPin, ...(credencialGuardada ? { credencial: credencialGuardada } : {}) }, cookies: [conta.sessao] }));
    assert.equal(criacao.statusCode, 200, criacao.body);
    const credencial = (criacao.json() as { credencial: string }).credencial;
    const ativacao = await requisitar("POST", `${BIOMETRIA}/ativar`, app({ corpo: { credencial }, cookies: [conta.sessao] }));
    assert.equal(ativacao.statusCode, 200, ativacao.body);
    return { ...conta, credencial, segredo: (ativacao.json() as { segredo: string }).segredo };
  }
  const entrarComPinNoApp = (credencial: string, codigoPin: string) => pin("entrar", app({ corpo: { pin: codigoPin, credencial } }));
  const entrarComBiometria = (credencial: string, segredo: string) => requisitar("POST", `${BIOMETRIA}/entrar`, app({ corpo: { credencial, segredo } }));
  const linha = async (credencial: string) => {
    const [autorizacao] = await banco.select().from(dispositivosAutorizados).where(eq(dispositivosAutorizados.credencialHash, sha256(credencial)));
    assert.ok(autorizacao);
    return autorizacao;
  };
  const donoDaSessao = async (resposta: LightMyRequestResponse) => {
    const sessao = cookieObrigatorio(resposta, COOKIE_SESSAO);
    const eu = await requisitar("GET", "/api/auth/get-session", { cookies: [sessao], de: "app" });
    return (eu.json() as { user: { id: string } }).user.id;
  };

  it("A e B têm autorizações independentes: nenhuma credencial, PIN ou biometria de uma abre a outra", async () => {
    const a = await autorizar(TEL_MULTI_A, PIN);
    // A saiu; B entrou por código no MESMO aparelho e criou o PIN dela. Mesmo que o aparelho
    // apresentasse a credencial de A nesse pedido, o servidor não a revoga: ela é de outra conta.
    assert.equal((await requisitar("POST", "/api/auth/sign-out", app({ corpo: {}, cookies: [a.sessao] }))).statusCode, 200);
    const b = await autorizar(TEL_MULTI_B, OUTRO_PIN, a.credencial);

    assert.notEqual(a.usuarioId, b.usuarioId);
    assert.notEqual(a.credencial, b.credencial);
    assert.notEqual(a.segredo, b.segredo);
    const [deA, deB] = [await linha(a.credencial), await linha(b.credencial)];
    assert.deepEqual([deA.usuarioId, deA.revogadoEm, deB.usuarioId, deB.revogadoEm], [a.usuarioId, null, b.usuarioId, null]);
    assert.equal(deA.biometriaHash, sha256(a.segredo), "a biometria de A continua a mesma");

    // Cada um entra na PRÓPRIA conta.
    assert.equal(await donoDaSessao(await entrarComPinNoApp(a.credencial, PIN)), a.usuarioId);
    assert.equal(await donoDaSessao(await entrarComPinNoApp(b.credencial, OUTRO_PIN)), b.usuarioId);
    assert.equal(await donoDaSessao(await entrarComBiometria(a.credencial, a.segredo)), a.usuarioId);
    assert.equal(await donoDaSessao(await entrarComBiometria(b.credencial, b.segredo)), b.usuarioId);

    // Cruzado, nada entra: PIN de A no dispositivo de B (e vice-versa), biometria de A com o dispositivo de B.
    for (const cruzado of [await entrarComPinNoApp(b.credencial, PIN), await entrarComPinNoApp(a.credencial, OUTRO_PIN), await entrarComBiometria(b.credencial, a.segredo), await entrarComBiometria(a.credencial, b.segredo)]) {
      assert.equal(cruzado.statusCode, 401, cruzado.body);
      assert.equal(cookieDaResposta(cruzado, COOKIE_SESSAO), undefined);
    }
    // A sessão de B não ativa biometria no dispositivo de A.
    const invasao = await requisitar("POST", `${BIOMETRIA}/ativar`, app({ corpo: { credencial: a.credencial }, cookies: [b.sessao] }));
    assert.equal(invasao.statusCode, 403, invasao.body);
    assert.equal((await linha(a.credencial)).biometriaHash, sha256(a.segredo));
  });

  it("revogar A não revoga B, e revogar B não revoga A", async () => {
    for (const quem of ["a", "b"] as const) {
      const a = await autorizar(TEL_MULTI_A, PIN);
      const b = await autorizar(TEL_MULTI_B, OUTRO_PIN);
      const [revogada, preservada] = quem === "a" ? [a, b] : [b, a];
      const pinPreservado = quem === "a" ? OUTRO_PIN : PIN;

      assert.equal((await pin("remover", app({ corpo: { credencial: revogada.credencial } }))).statusCode, 200);
      assert.ok((await linha(revogada.credencial)).revogadoEm instanceof Date);
      assert.equal((await entrarComBiometria(revogada.credencial, revogada.segredo)).statusCode, 401);

      const intacta = await linha(preservada.credencial);
      assert.deepEqual([intacta.revogadoEm, intacta.biometriaHash], [null, sha256(preservada.segredo)]);
      assert.equal((await entrarComPinNoApp(preservada.credencial, pinPreservado)).statusCode, 200);
      assert.equal((await entrarComBiometria(preservada.credencial, preservada.segredo)).statusCode, 200);
    }
  });

  it("voltar a A por código não mexe na autorização que A já tinha neste aparelho", async () => {
    const a = await autorizar(TEL_MULTI_A, PIN);
    await autorizar(TEL_MULTI_B, OUTRO_PIN);
    // A entra de novo por código (troca explícita de conta) e NÃO recria o PIN.
    const denovo = await entrarPorCodigo(TEL_MULTI_A, "app");
    assert.equal(denovo.usuarioId, a.usuarioId);
    const intacta = await linha(a.credencial);
    assert.deepEqual([intacta.revogadoEm, intacta.biometriaHash], [null, sha256(a.segredo)]);
    assert.deepEqual((await pin("situacao", app({ corpo: { credencial: a.credencial } }))).json(), { autorizado: true, biometria: true });
    assert.equal((await entrarComBiometria(a.credencial, a.segredo)).statusCode, 200);
  });
});
