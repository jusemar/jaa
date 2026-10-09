import "./apoio/exigir-banco-de-teste.js";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { criarConexaoBanco } from "@jaa/banco";
import { identidades, rateLimits, users, verifications } from "@jaa/banco/schema";
import { betterAuth } from "better-auth";
import { testUtils } from "better-auth/plugins";
import { eq, inArray, like, or } from "drizzle-orm";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { criarAplicacao } from "../src/aplicacao.js";
import { criarOpcoesAutenticacao, type Autenticacao } from "../src/features/autenticacao/autenticacao.js";
import { criarAvisoSessoesEncerradas } from "../src/features/autenticacao/lib/sessoes-encerradas.js";
import { criarCanalEventosMensagens } from "../src/features/mensagens/lib/eventos-mensagens.js";
import { carregarAmbiente } from "../src/lib/ambiente.js";

/*
 * TELEFONE DA CONTA (Perfil → Conta e segurança) de ponta a ponta: Fastify + Better Auth + PostgreSQL
 * de teste. Os entregadores de código são FALSOS e contados: nenhum SMS e nenhum e-mail real.
 */

const ORIGEM_WEB = "http://localhost:3000";
const PREFIXO_IP = "198.18.9.";
const TELEFONES = Array.from({ length: 12 }, (_, indice) => `+55319877100${String(indice + 1).padStart(2, "0")}`);
const [TEL_ANA, TEL_NOVO_DA_ANA, TEL_BIA, TEL_DO_EMAIL, TEL_DISPUTADO, TEL_LIVRE, TEL_CAROL, TEL_CORRIDA, TEL_DUDA, TEL_LIMITE, TEL_FALHA, TEL_EXPIRADO] = TELEFONES as [
  string, string, string, string, string, string, string, string, string, string, string, string,
];
const SUFIXO_EMAIL = "telefone-conta@teste-jaa.example";
const EMAIL_SO_EMAIL = `so-email.${SUFIXO_EMAIL}`;

const ambiente = carregarAmbiente();
const ambienteDoTeste = { ...ambiente, ORIGENS_WEB_PERMITIDAS: [ORIGEM_WEB] };
const conexao = criarConexaoBanco(ambiente.DATABASE_URL);
const { banco } = conexao;

// Entregadores falsos e CONTADOS: número de outra conta não pode gerar SMS nenhum.
const smsEnviados: string[] = [];
let smsFalha = false;
const codigosDeEmail = new Map<string, string>();
const opcoes = criarOpcoesAutenticacao({
  banco,
  ambiente: ambienteDoTeste,
  entregadorOtp: {
    enviar: async ({ telefone }) => {
      if (smsFalha) throw new Error("Comtele respondeu 500.");
      smsEnviados.push(telefone);
    },
  },
  entregadorOtpEmail: { enviar: async ({ email, codigo }) => void codigosDeEmail.set(email, codigo), avisarEnderecoJaCadastrado: async () => {} },
  sessoesEncerradas: criarAvisoSessoesEncerradas(),
});
const autenticacaoReal = betterAuth({ ...opcoes, plugins: [...opcoes.plugins, testUtils({ captureOTP: true })] });

// Para simular a CORRIDA: no momento de gravar, outra conta já ficou com o número e a gravação falha.
let aoGravarTelefone: (() => Promise<Response | null>) | null = null;
const autenticacao: Autenticacao = {
  api: autenticacaoReal.api,
  handler: async (requisicao) => {
    if (aoGravarTelefone && new URL(requisicao.url).pathname.endsWith("/phone-number/verify")) {
      const forjada = await aoGravarTelefone();
      if (forjada) return forjada;
    }
    return autenticacaoReal.handler(requisicao);
  },
};

let app: FastifyInstance;
let ultimoIp = 0;
const novoIp = () => `${PREFIXO_IP}${++ultimoIp}`;

function requisitar(metodo: "GET" | "POST" | "PATCH", url: string, { corpo, cookie, ip }: { corpo?: unknown; cookie?: string; ip?: string } = {}): Promise<LightMyRequestResponse> {
  return app.inject({
    method: metodo,
    url,
    remoteAddress: ip ?? novoIp(),
    headers: { origin: ORIGEM_WEB, ...(corpo !== undefined ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}) },
    ...(corpo !== undefined ? { payload: JSON.stringify(corpo) } : {}),
  });
}

function cookieDeSessao(resposta: LightMyRequestResponse): string {
  const cookie = resposta.cookies.find((item) => item.name === "better-auth.session_token");
  assert.ok(cookie?.value, "cookie de sessão ausente");
  return `${cookie.name}=${cookie.value}`;
}
const codigoDoSms = async (telefone: string) => {
  const codigo = (await autenticacaoReal.$context).test.getOTP?.(telefone);
  assert.ok(codigo, `código não capturado para ${telefone}`);
  return codigo;
};
const codigoErrado = (codigo: string) => codigo.slice(0, 5) + String((Number(codigo[5]) + 1) % 10);

let serie = 0;
async function comIdentidade(cookie: string) {
  const nomeUsuario = `tel_conta_${++serie}`;
  const identidade = await requisitar("POST", "/identidades/pessoal", { corpo: { nomeExibicao: nomeUsuario, nomeUsuario }, cookie });
  // 409 = a conta já tinha identidade (entrou de novo): nada a fazer.
  assert.ok(identidade.statusCode === 201 || identidade.statusCode === 409, identidade.body);
}

/** Conta que nasce pelo CELULAR (fluxo de sempre). */
async function contaPorTelefone(telefone: string) {
  const ip = novoIp();
  assert.equal((await requisitar("POST", "/api/auth/phone-number/send-otp", { corpo: { phoneNumber: telefone }, ip })).statusCode, 200);
  const verificacao = await requisitar("POST", "/api/auth/phone-number/verify", { corpo: { phoneNumber: telefone, code: await codigoDoSms(telefone) }, ip });
  assert.equal(verificacao.statusCode, 200, verificacao.body);
  const cookie = cookieDeSessao(verificacao);
  await comIdentidade(cookie);
  return { cookie, usuarioId: (verificacao.json().user as { id: string }).id };
}

/** Conta que nasce por E-MAIL: sem telefone. */
async function contaPorEmail(email: string) {
  await zerarLimites();
  const ip = novoIp();
  assert.equal((await requisitar("POST", "/api/auth/email-otp/send-verification-otp", { corpo: { email, type: "sign-in" }, ip })).statusCode, 200);
  const entrada = await requisitar("POST", "/api/auth/sign-in/email-otp", { corpo: { email, otp: codigosDeEmail.get(email) }, ip });
  assert.equal(entrada.statusCode, 200, entrada.body);
  const cookie = cookieDeSessao(entrada);
  await comIdentidade(cookie);
  return { cookie, usuarioId: (entrada.json().user as { id: string }).id };
}

const pedirCodigo = (cookie: string | undefined, telefone: unknown) => requisitar("POST", "/conta/telefone/codigo", { corpo: { telefone }, ...(cookie ? { cookie } : {}) });
const confirmar = (cookie: string | undefined, telefone: unknown, codigo: unknown) => requisitar("POST", "/conta/telefone", { corpo: { telefone, codigo }, ...(cookie ? { cookie } : {}) });
const telefoneNoPerfil = async (cookie: string) => (await requisitar("GET", "/conta/telefone", { cookie })).json() as { telefone: string | null };
const conta = async (usuarioId: string) => {
  const [linha] = await banco.select().from(users).where(eq(users.id, usuarioId));
  assert.ok(linha);
  return linha;
};
// O intervalo de 1 minuto por número e o teto por conta são testados em pontos próprios.
const zerarLimites = () => banco.delete(rateLimits).where(or(like(rateLimits.key, "jaa:conta-telefone:%"), like(rateLimits.key, "jaa:otp-email%"), like(rateLimits.key, `${PREFIXO_IP}%`)));

async function limpar() {
  const contas = banco.select({ id: users.id }).from(users).where(or(inArray(users.phoneNumber, TELEFONES), like(users.email, `%${SUFIXO_EMAIL}`)));
  await banco.delete(identidades).where(inArray(identidades.usuarioId, contas));
  await banco.delete(users).where(or(inArray(users.phoneNumber, TELEFONES), like(users.email, `%${SUFIXO_EMAIL}`)));
  await banco.delete(verifications).where(or(inArray(verifications.identifier, TELEFONES), like(verifications.identifier, `%${SUFIXO_EMAIL}`)));
  await banco.delete(rateLimits).where(or(like(rateLimits.key, `${PREFIXO_IP}%`), like(rateLimits.key, "jaa:conta-telefone:%"), like(rateLimits.key, "jaa:otp-email%")));
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

describe("telefone da conta: leitura", () => {
  it("exige sessão nas três rotas", async () => {
    assert.equal((await requisitar("GET", "/conta/telefone")).statusCode, 401);
    assert.equal((await pedirCodigo(undefined, TEL_LIVRE)).statusCode, 401);
    assert.equal((await confirmar(undefined, TEL_LIVRE, "123456")).statusCode, 401);
    assert.equal(smsEnviados.includes(TEL_LIVRE), false);
  });

  it("conta do celular vê o próprio número como o lê; conta que nasceu por e-mail não tem telefone", async () => {
    const ana = await contaPorTelefone(TEL_ANA);
    assert.deepEqual(await telefoneNoPerfil(ana.cookie), { telefone: "(31) 98771-0001" });
    const soEmail = await contaPorEmail(EMAIL_SO_EMAIL);
    assert.deepEqual(await telefoneNoPerfil(soEmail.cookie), { telefone: null });
    // Nada interno sai junto: nem o formato E.164, nem o e-mail técnico.
    const cru = await requisitar("GET", "/conta/telefone", { cookie: ana.cookie });
    assert.ok(!cru.body.includes("+55") && !cru.body.includes("invalid") && !cru.body.includes(ana.usuarioId));
  });
});

describe("cadastrar telefone (conta que nasceu por e-mail)", () => {
  it("o SMS vai para o número NOVO, e só o código certo vincula — na MESMA conta", async () => {
    const [antes] = await banco.select({ id: users.id }).from(users).where(eq(users.email, EMAIL_SO_EMAIL));
    assert.ok(antes);
    const entrada = await contaPorEmail(EMAIL_SO_EMAIL);
    assert.equal(entrada.usuarioId, antes.id);
    const enviadosAntes = smsEnviados.length;

    const pedido = await pedirCodigo(entrada.cookie, "(31) 98771-0004");
    assert.equal(pedido.statusCode, 200, pedido.body);
    assert.deepEqual(pedido.json(), { enviado: true });
    assert.deepEqual(smsEnviados.slice(enviadosAntes), [TEL_DO_EMAIL], "um SMS, para o número novo");
    const codigo = await codigoDoSms(TEL_DO_EMAIL);
    assert.ok(!pedido.body.includes(codigo), "o código nunca volta na resposta");
    // Antes do código, nada muda.
    assert.equal((await conta(entrada.usuarioId)).phoneNumber, null);

    const comErrado = await confirmar(entrada.cookie, TEL_DO_EMAIL, codigoErrado(codigo));
    assert.equal(comErrado.statusCode, 400, comErrado.body);
    assert.deepEqual(comErrado.json(), { codigo: "CODIGO_INVALIDO", mensagem: "Código incorreto." });
    assert.equal((await conta(entrada.usuarioId)).phoneNumber, null);
    for (const invalido of ["12345", "1234567", "12a456", ""]) assert.equal((await confirmar(entrada.cookie, TEL_DO_EMAIL, invalido)).statusCode, 400, invalido);

    const confirmacao = await confirmar(entrada.cookie, TEL_DO_EMAIL, codigo);
    assert.equal(confirmacao.statusCode, 200, confirmacao.body);
    assert.deepEqual(confirmacao.json(), { telefone: "(31) 98771-0004" });
    const depois = await conta(entrada.usuarioId);
    assert.deepEqual([depois.id, depois.phoneNumber, depois.phoneNumberVerified, depois.email, depois.emailVerified], [antes.id, TEL_DO_EMAIL, true, EMAIL_SO_EMAIL, true]);
    assert.deepEqual(await telefoneNoPerfil(entrada.cookie), { telefone: "(31) 98771-0004" });
    assert.equal((await banco.select({ id: users.id }).from(users).where(eq(users.phoneNumber, TEL_DO_EMAIL))).length, 1, "nenhuma conta nova");

    // A partir daí o celular entra na MESMA conta.
    const peloCelular = await contaEntrandoPorTelefone(TEL_DO_EMAIL);
    assert.equal(peloCelular, antes.id);
  });
});

async function contaEntrandoPorTelefone(telefone: string): Promise<string> {
  await zerarLimites();
  await banco.delete(verifications).where(eq(verifications.identifier, telefone));
  const ip = novoIp();
  assert.equal((await requisitar("POST", "/api/auth/phone-number/send-otp", { corpo: { phoneNumber: telefone }, ip })).statusCode, 200);
  const verificacao = await requisitar("POST", "/api/auth/phone-number/verify", { corpo: { phoneNumber: telefone, code: await codigoDoSms(telefone) }, ip });
  assert.equal(verificacao.statusCode, 200, verificacao.body);
  return (verificacao.json().user as { id: string }).id;
}

describe("alterar telefone (conta que já tem um)", () => {
  it("o antigo só sai depois do código enviado ao NOVO; a privacidade de busca pelo celular não muda", async () => {
    const ana = { usuarioId: await contaEntrandoPorTelefone(TEL_ANA), cookie: "" };
    ana.cookie = (await contaSessao(TEL_ANA)).cookie;
    // A pessoa tinha DESLIGADO "deixar que me encontrem pelo meu celular".
    const desligar = await requisitar("PATCH", "/perfil/privacidade", { corpo: { buscavelPorTelefone: false }, cookie: ana.cookie });
    assert.equal(desligar.statusCode, 200, desligar.body);
    const privacidadeAntes = (await requisitar("GET", "/perfil", { cookie: ana.cookie })).json().privacidade as Record<string, unknown>;
    const enviadosAntes = smsEnviados.length;

    const pedido = await pedirCodigo(ana.cookie, TEL_NOVO_DA_ANA);
    assert.equal(pedido.statusCode, 200, pedido.body);
    assert.deepEqual(smsEnviados.slice(enviadosAntes), [TEL_NOVO_DA_ANA], "o código vai para o número novo, não para o atual");
    assert.equal((await conta(ana.usuarioId)).phoneNumber, TEL_ANA, "antes de confirmar, o telefone continua o antigo");

    const confirmacao = await confirmar(ana.cookie, TEL_NOVO_DA_ANA, await codigoDoSms(TEL_NOVO_DA_ANA));
    assert.equal(confirmacao.statusCode, 200, confirmacao.body);
    const depois = await conta(ana.usuarioId);
    assert.deepEqual([depois.phoneNumber, depois.phoneNumberVerified], [TEL_NOVO_DA_ANA, true]);
    assert.equal((await banco.select({ id: users.id }).from(users).where(eq(users.phoneNumber, TEL_ANA))).length, 0, "o número antigo fica livre");

    // Telefone da CONTA ≠ preferência de PRIVACIDADE: nada nela foi tocado.
    const privacidadeDepois = (await requisitar("GET", "/perfil", { cookie: ana.cookie })).json().privacidade as Record<string, unknown>;
    assert.deepEqual(privacidadeDepois, privacidadeAntes);
    assert.equal(privacidadeDepois.buscavelPorTelefone, false, "continua desligada: trocar o telefone não religa a busca");
    // A sessão continua valendo, e a conta entra pelo número novo.
    assert.equal(await contaEntrandoPorTelefone(TEL_NOVO_DA_ANA), ana.usuarioId);
  });

  it("o mesmo número de hoje não gera SMS; número inválido também não", async () => {
    const bia = await contaPorTelefone(TEL_BIA);
    const enviadosAntes = smsEnviados.length;
    for (const mesmo of [TEL_BIA, "(31) 98771-0003", "31987710003"]) {
      const resposta = await pedirCodigo(bia.cookie, mesmo);
      assert.equal(resposta.statusCode, 409, resposta.body);
      assert.deepEqual(resposta.json(), { codigo: "TELEFONE_IGUAL", mensagem: "Este já é o telefone da sua conta." });
    }
    for (const invalido of ["", "   ", "123", "(31) 3333-0001", "+14155550100", "abc", 31987710003, null]) {
      const resposta = await pedirCodigo(bia.cookie, invalido);
      assert.equal(resposta.statusCode, 400, `${String(invalido)}: ${resposta.body}`);
      assert.equal(resposta.json().codigo, "TELEFONE_INVALIDO");
    }
    assert.equal(smsEnviados.length, enviadosAntes, "nenhum SMS");
    assert.equal((await conta(bia.usuarioId)).phoneNumber, TEL_BIA);
  });

  it("código expirado não troca o telefone", async () => {
    const bia = await contaSessao(TEL_BIA);
    await zerarLimites();
    assert.equal((await pedirCodigo(bia.cookie, TEL_EXPIRADO)).statusCode, 200);
    const codigo = await codigoDoSms(TEL_EXPIRADO);
    await banco.update(verifications).set({ expiresAt: new Date(Date.now() - 60_000) }).where(eq(verifications.identifier, TEL_EXPIRADO));
    const expirado = await confirmar(bia.cookie, TEL_EXPIRADO, codigo);
    assert.equal(expirado.statusCode, 400, expirado.body);
    assert.equal(expirado.json().codigo, "CODIGO_INVALIDO");
    assert.equal((await conta(bia.usuarioId)).phoneNumber, TEL_BIA);
  });
});

/** Sessão nova para uma conta que já existe pelo celular. */
async function contaSessao(telefone: string) {
  await zerarLimites();
  await banco.delete(verifications).where(eq(verifications.identifier, telefone));
  const ip = novoIp();
  assert.equal((await requisitar("POST", "/api/auth/phone-number/send-otp", { corpo: { phoneNumber: telefone }, ip })).statusCode, 200);
  const verificacao = await requisitar("POST", "/api/auth/phone-number/verify", { corpo: { phoneNumber: telefone, code: await codigoDoSms(telefone) }, ip });
  assert.equal(verificacao.statusCode, 200, verificacao.body);
  return { cookie: cookieDeSessao(verificacao), usuarioId: (verificacao.json().user as { id: string }).id };
}

describe("telefone que já é de outra conta", () => {
  it("é recusado ANTES do envio: nenhum SMS, nenhuma mudança, e nada sobre a outra conta na resposta", async () => {
    const carol = await contaPorTelefone(TEL_CAROL);
    const bia = await contaSessao(TEL_BIA);
    const [donaDoNumero] = await banco.select().from(identidades).where(eq(identidades.usuarioId, carol.usuarioId));
    await zerarLimites();
    const enviadosAntes = smsEnviados.length;

    for (const escrito of [TEL_CAROL, "(31) 98771-0007"]) {
      const resposta = await pedirCodigo(bia.cookie, escrito);
      assert.equal(resposta.statusCode, 409, resposta.body);
      assert.deepEqual(resposta.json(), { codigo: "TELEFONE_EM_USO", mensagem: "Este número já está vinculado a outra conta." });
      for (const dado of [carol.usuarioId, donaDoNumero?.nomeUsuario ?? "x", donaDoNumero?.nomeExibicao ?? "x", "invalid"]) assert.ok(!resposta.body.includes(dado), dado);
    }
    assert.equal(smsEnviados.length, enviadosAntes, "nenhum SMS para número de outra conta");
    // Mesmo tentando confirmar direto, nada é vinculado.
    const direto = await confirmar(bia.cookie, TEL_CAROL, "123456");
    assert.equal(direto.statusCode, 409, direto.body);
    assert.equal((await conta(bia.usuarioId)).phoneNumber, TEL_BIA);
    assert.equal((await conta(carol.usuarioId)).phoneNumber, TEL_CAROL);
  });

  it("número que OUTRA conta pegou entre o SMS e a confirmação: recusa controlada, sem trocar nada", async () => {
    const bia = await contaSessao(TEL_BIA);
    await zerarLimites();
    assert.equal((await pedirCodigo(bia.cookie, TEL_DISPUTADO)).statusCode, 200);
    const codigo = await codigoDoSms(TEL_DISPUTADO);
    // Enquanto a Bia olhava o SMS, a Duda ficou com o número.
    const duda = await contaPorTelefone(TEL_DUDA);
    await banco.update(users).set({ phoneNumber: TEL_DISPUTADO }).where(eq(users.id, duda.usuarioId));

    const confirmacao = await confirmar(bia.cookie, TEL_DISPUTADO, codigo);
    assert.equal(confirmacao.statusCode, 409, confirmacao.body);
    assert.equal(confirmacao.json().codigo, "TELEFONE_EM_USO");
    assert.equal((await conta(bia.usuarioId)).phoneNumber, TEL_BIA);
    assert.equal((await conta(duda.usuarioId)).phoneNumber, TEL_DISPUTADO);
  });

  it("CORRIDA: se a gravação perde para o índice único do banco, a resposta é a mesma — nunca erro técnico", async () => {
    const bia = await contaSessao(TEL_BIA);
    const [duda] = await banco.select({ id: users.id }).from(users).where(eq(users.phoneNumber, TEL_DISPUTADO));
    assert.ok(duda);
    await zerarLimites();
    assert.equal((await pedirCodigo(bia.cookie, TEL_CORRIDA)).statusCode, 200);
    const codigo = await codigoDoSms(TEL_CORRIDA);

    // As conferências passaram para as duas contas; na hora de gravar, a outra chegou primeiro e o
    // banco recusou a segunda gravação (falha interna do provedor de autenticação).
    aoGravarTelefone = async () => {
      await banco.update(users).set({ phoneNumber: TEL_CORRIDA }).where(eq(users.id, duda.id));
      return new Response(JSON.stringify({ message: 'duplicate key value violates unique constraint "users_phone_number_unique"' }), { status: 500 });
    };
    try {
      const confirmacao = await confirmar(bia.cookie, TEL_CORRIDA, codigo);
      assert.equal(confirmacao.statusCode, 409, confirmacao.body);
      assert.deepEqual(confirmacao.json(), { codigo: "TELEFONE_EM_USO", mensagem: "Este número já está vinculado a outra conta." });
      assert.ok(!confirmacao.body.includes("constraint") && !confirmacao.body.includes("duplicate"));
    } finally {
      aoGravarTelefone = null;
    }
    assert.equal((await conta(bia.usuarioId)).phoneNumber, TEL_BIA);
    // E o banco, por si só, nunca aceita o mesmo número em duas contas.
    await assert.rejects(banco.update(users).set({ phoneNumber: TEL_CORRIDA }).where(eq(users.id, bia.usuarioId)));
    assert.equal((await banco.select({ id: users.id }).from(users).where(eq(users.phoneNumber, TEL_CORRIDA))).length, 1);
  });

  it("falha interna que NÃO é disputa de número vira erro genérico, sem detalhe técnico", async () => {
    const bia = await contaSessao(TEL_BIA);
    await zerarLimites();
    assert.equal((await pedirCodigo(bia.cookie, TEL_LIVRE)).statusCode, 200);
    aoGravarTelefone = async () => new Response(JSON.stringify({ message: "connection terminated unexpectedly at pg-pool" }), { status: 500 });
    try {
      const confirmacao = await confirmar(bia.cookie, TEL_LIVRE, await codigoDoSms(TEL_LIVRE));
      assert.equal(confirmacao.statusCode, 500, confirmacao.body);
      assert.equal(confirmacao.json().mensagem, "Não foi possível concluir. Tente novamente.");
      assert.ok(!confirmacao.body.includes("pg-pool"));
    } finally {
      aoGravarTelefone = null;
    }
  });
});

describe("limites e falha de envio", () => {
  it("falha do provedor de SMS: erro genérico, sem citar fornecedor, e nada muda", async () => {
    const bia = await contaSessao(TEL_BIA);
    await zerarLimites();
    smsFalha = true;
    try {
      const pedido = await pedirCodigo(bia.cookie, TEL_FALHA);
      assert.equal(pedido.statusCode, 503, pedido.body);
      assert.deepEqual(pedido.json(), { codigo: "FALHA_AO_ENVIAR_CODIGO", mensagem: "Não foi possível enviar o código. Tente novamente." });
      assert.ok(!pedido.body.includes("Comtele"));
    } finally {
      smsFalha = false;
    }
    assert.equal((await conta(bia.usuarioId)).phoneNumber, TEL_BIA);
  });

  it("um código por minuto para o mesmo número; e teto de 10 pedidos por hora por conta", async () => {
    const bia = await contaSessao(TEL_BIA);
    await zerarLimites();
    await banco.delete(verifications).where(eq(verifications.identifier, TEL_LIMITE));
    assert.equal((await pedirCodigo(bia.cookie, TEL_LIMITE)).statusCode, 200);
    const repetido = await pedirCodigo(bia.cookie, TEL_LIMITE);
    assert.equal(repetido.statusCode, 429, repetido.body);
    assert.equal(repetido.json().mensagem, "Aguarde um minuto antes de pedir um novo código.");

    // Teto por conta: vale mesmo para números de outras contas (a tela não serve para sondar números).
    await zerarLimites();
    const enviadosAntes = smsEnviados.length;
    for (let pedido = 1; pedido <= 10; pedido++) assert.equal((await pedirCodigo(bia.cookie, TEL_CAROL)).statusCode, 409, `pedido ${pedido}`);
    const alemDoTeto = await pedirCodigo(bia.cookie, TEL_CAROL);
    assert.equal(alemDoTeto.statusCode, 429, alemDoTeto.body);
    assert.equal(alemDoTeto.json().codigo, "LIMITE_DE_TENTATIVAS_ATINGIDO");
    assert.equal(smsEnviados.length, enviadosAntes);
  });
});
