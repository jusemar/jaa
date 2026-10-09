import "./apoio/exigir-banco-de-teste.js";
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { criarConexaoBanco } from "@jaa/banco";
import { identidades, rateLimits, users, verifications } from "@jaa/banco/schema";
import { betterAuth } from "better-auth";
import { testUtils } from "better-auth/plugins";
import { count, desc, eq, inArray, like, or } from "drizzle-orm";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { criarAplicacao } from "../src/aplicacao.js";
import { MAXIMO_CODIGOS_EMAIL_POR_DESTINATARIO_POR_HORA, OTP_EXPIRA_EM_SEGUNDOS, criarOpcoesAutenticacao } from "../src/features/autenticacao/autenticacao.js";
import type { EntregadorOtpEmail } from "../src/features/autenticacao/entrega-otp/entregador-otp-email.js";
import { ErroEntregaOtp } from "../src/features/autenticacao/entrega-otp/erro-entrega-otp.js";
import { DOMINIO_EMAIL_TECNICO, NOME_TECNICO_CONTA } from "../src/features/autenticacao/lib/conta-tecnica.js";
import { criarAvisoSessoesEncerradas } from "../src/features/autenticacao/lib/sessoes-encerradas.js";
import { criarCanalEventosMensagens } from "../src/features/mensagens/lib/eventos-mensagens.js";
import { carregarAmbiente } from "../src/lib/ambiente.js";

/*
 * OTP POR E-MAIL de ponta a ponta: Fastify + Better Auth (plugin oficial emailOTP) + PostgreSQL de
 * teste. O entregador é FALSO (guarda o que seria enviado): nenhum e-mail real, nenhum SMS real.
 */

const ORIGEM_WEB = "http://localhost:3000";
const PREFIXO_IP = "198.18.7.";
const [TEL_ANA, TEL_BIA, TEL_NOVO] = ["+5531987670001", "+5531987670002", "+5531987670003"] as const;
const TELEFONES = [TEL_ANA, TEL_BIA, TEL_NOVO];
const SUFIXO_EMAIL = "otp-email@teste-jaa.example";
const EMAIL_ANA = `ana.${SUFIXO_EMAIL}`;
const EMAIL_NOVA = `nova.${SUFIXO_EMAIL}`;
const EMAIL_CAROL = `carol.${SUFIXO_EMAIL}`;
const EMAIL_TENTATIVAS = `tentativas.${SUFIXO_EMAIL}`;
const EMAIL_EXPIRADO = `expirado.${SUFIXO_EMAIL}`;
const EMAIL_LIVRE = `livre.${SUFIXO_EMAIL}`;
const SENHA = "senha-boa-do-jaa-2026";

const ambiente = carregarAmbiente();
const ambienteDoTeste = { ...ambiente, ORIGENS_WEB_PERMITIDAS: [ORIGEM_WEB] };
const conexao = criarConexaoBanco(ambiente.DATABASE_URL);
const { banco } = conexao;

// Entregador falso: registra cada envio e pode ser posto para falhar (como o provedor fora do ar).
const enviados: { email: string; codigo: string; validadeSegundos: number }[] = [];
const avisos: string[] = [];
let falhaDoEntregador: Error | null = null;
const entregadorOtpEmail: EntregadorOtpEmail = {
  async enviar(dados) {
    if (falhaDoEntregador) throw falhaDoEntregador;
    enviados.push(dados);
  },
  async avisarEnderecoJaCadastrado({ email }) {
    if (falhaDoEntregador) throw falhaDoEntregador;
    avisos.push(email);
  },
};
const ultimoCodigo = (email: string) => {
  const envio = enviados.findLast((item) => item.email === email);
  assert.ok(envio, `nenhum código enviado para ${email}`);
  return envio.codigo;
};
const codigoErrado = (codigo: string) => codigo.slice(0, 5) + String((Number(codigo[5]) + 1) % 10);

function montar(comEmail: boolean) {
  const opcoes = criarOpcoesAutenticacao({
    banco,
    ambiente: ambienteDoTeste,
    entregadorOtp: { enviar: async () => {} },
    entregadorOtpEmail: comEmail ? entregadorOtpEmail : null,
    sessoesEncerradas: criarAvisoSessoesEncerradas(),
  });
  const autenticacao = betterAuth({ ...opcoes, plugins: [...opcoes.plugins, testUtils({ captureOTP: true })] });
  return { autenticacao, opcoes };
}

const comEmail = montar(true);
const semEmail = montar(false);
let app: FastifyInstance;
let appSemEmail: FastifyInstance;
let ultimoIp = 0;
const novoIp = () => `${PREFIXO_IP}${++ultimoIp}`;

function requisitar(servidor: FastifyInstance, metodo: "GET" | "POST", url: string, opcoes: { corpo?: unknown; cookie?: string; ip?: string } = {}): Promise<LightMyRequestResponse> {
  return servidor.inject({
    method: metodo,
    url,
    remoteAddress: opcoes.ip ?? novoIp(),
    headers: {
      origin: ORIGEM_WEB,
      ...(opcoes.corpo !== undefined ? { "content-type": "application/json" } : {}),
      ...(opcoes.cookie ? { cookie: opcoes.cookie } : {}),
    },
    ...(opcoes.corpo !== undefined ? { payload: JSON.stringify(opcoes.corpo) } : {}),
  });
}
const auth = (caminho: string, corpo: unknown, cookie?: string) => requisitar(app, "POST", `/api/auth${caminho}`, { corpo, ...(cookie ? { cookie } : {}) });
const pedirCodigo = (email: string) => auth("/email-otp/send-verification-otp", { email, type: "sign-in" });
const entrarComSenha = (identificador: string, senha: string) => requisitar(app, "POST", "/autenticacao/entrar", { corpo: { identificador, senha } });

function cookieDeSessao(resposta: LightMyRequestResponse): string {
  const cookie = resposta.cookies.find((item) => item.name === "better-auth.session_token");
  assert.ok(cookie?.value, "cookie de sessão ausente");
  return `${cookie.name}=${cookie.value}`;
}
const temSessao = (resposta: LightMyRequestResponse) => resposta.cookies.some((item) => item.name === "better-auth.session_token" && item.value);

async function codigoDoTelefone(telefone: string, cookie?: string) {
  const envio = await requisitar(app, "POST", "/api/auth/phone-number/send-otp", { corpo: { phoneNumber: telefone }, ...(cookie ? { cookie } : {}) });
  assert.equal(envio.statusCode, 200, envio.body);
  const codigo = (await comEmail.autenticacao.$context).test.getOTP?.(telefone);
  assert.ok(codigo, "código do telefone não capturado");
  return codigo;
}

const criarIdentidade = async (cookie: string, nomeUsuario: string) => {
  const identidade = await requisitar(app, "POST", "/identidades/pessoal", { corpo: { nomeExibicao: nomeUsuario, nomeUsuario }, cookie });
  assert.equal(identidade.statusCode, 201, identidade.body);
};

// Entrada pelo fluxo de SEMPRE (celular + código), que precisa continuar intacto.
async function entrarPorTelefone(telefone: string, nomeUsuario: string) {
  const verificacao = await requisitar(app, "POST", "/api/auth/phone-number/verify", { corpo: { phoneNumber: telefone, code: await codigoDoTelefone(telefone) } });
  assert.equal(verificacao.statusCode, 200, verificacao.body);
  const cookie = cookieDeSessao(verificacao);
  await criarIdentidade(cookie, nomeUsuario);
  return { cookie, usuarioId: (verificacao.json().user as { id: string }).id };
}

// Entrada/cadastro por E-MAIL: pede o código e confirma.
async function entrarPorEmail(email: string) {
  await zerarLimitesDeEmail();
  assert.equal((await pedirCodigo(email)).statusCode, 200);
  const entrada = await auth("/sign-in/email-otp", { email, otp: ultimoCodigo(email) });
  assert.equal(entrada.statusCode, 200, entrada.body);
  return { cookie: cookieDeSessao(entrada), usuarioId: (entrada.json().user as { id: string }).id };
}

const contasCom = (condicao: ReturnType<typeof eq>) => banco.select().from(users).where(condicao);
const contaDoTelefone = async (telefone: string) => {
  const [conta] = await contasCom(eq(users.phoneNumber, telefone));
  assert.ok(conta, "conta não encontrada");
  return conta;
};
const contaDoEmail = async (email: string) => (await contasCom(eq(users.email, email)))[0];
async function totalDeContasDeTeste() {
  const [linha] = await banco.select({ total: count() }).from(users).where(or(inArray(users.phoneNumber, TELEFONES), like(users.email, `%${SUFIXO_EMAIL}`)));
  return linha?.total ?? 0;
}

// Os limites por destinatário/IP são testados de propósito em pontos próprios; fora deles, zerados.
const zerarLimitesDeEmail = () => banco.delete(rateLimits).where(like(rateLimits.key, "jaa:otp-email%"));
const zerarIntervaloDeUmMinuto = () => banco.delete(rateLimits).where(like(rateLimits.key, "jaa:otp-email:%"));

async function limpar() {
  const contas = banco.select({ id: users.id }).from(users).where(or(inArray(users.phoneNumber, TELEFONES), like(users.email, `%${SUFIXO_EMAIL}`)));
  await banco.delete(identidades).where(inArray(identidades.usuarioId, contas));
  await banco.delete(users).where(or(inArray(users.phoneNumber, TELEFONES), like(users.email, `%${SUFIXO_EMAIL}`)));
  await banco.delete(verifications).where(or(inArray(verifications.identifier, TELEFONES), like(verifications.identifier, `%${SUFIXO_EMAIL}`)));
  await banco.delete(rateLimits).where(or(like(rateLimits.key, `${PREFIXO_IP}%`), like(rateLimits.key, "jaa:otp-email%"), like(rateLimits.key, `jaa:entrar-por-email:${PREFIXO_IP}%`)));
}

let ana: { cookie: string; usuarioId: string };

before(async () => {
  await limpar();
  const comum = { ambiente: ambienteDoTeste, banco, eventosMensagens: criarCanalEventosMensagens(), logger: false } as const;
  app = await criarAplicacao({ ...comum, ambiente: { ...ambienteDoTeste, OTP_EMAIL_ENTREGA: "resend" }, autenticacao: comEmail.autenticacao });
  appSemEmail = await criarAplicacao({ ...comum, ambiente: { ...ambienteDoTeste, OTP_EMAIL_ENTREGA: undefined }, autenticacao: semEmail.autenticacao });
  await Promise.all([app.ready(), appSemEmail.ready()]);
  ana = await entrarPorTelefone(TEL_ANA, "ana_otp_email");
});

beforeEach(async () => {
  falhaDoEntregador = null;
  await zerarLimitesDeEmail();
});

after(async () => {
  await Promise.all([app.close(), appSemEmail.close()]);
  await limpar();
  await conexao.encerrar();
});

describe("canais de código ligados no servidor", () => {
  it("com o e-mail desligado (padrão), as rotas de e-mail não existem e só o telefone é oferecido", async () => {
    for (const caminho of ["/email-otp/send-verification-otp", "/sign-in/email-otp", "/email-otp/request-email-change", "/email-otp/change-email"]) {
      const resposta = await requisitar(appSemEmail, "POST", `/api/auth${caminho}`, { corpo: { email: EMAIL_ANA, newEmail: EMAIL_ANA, type: "sign-in", otp: "000000" }, cookie: ana.cookie });
      assert.equal(resposta.statusCode, 404, `${caminho}: ${resposta.body}`);
    }
    assert.deepEqual((await requisitar(appSemEmail, "GET", "/autenticacao/metodos")).json(), { telefone: true, email: false });
    assert.deepEqual((await requisitar(appSemEmail, "GET", "/conta/email", { cookie: ana.cookie })).json(), { email: null, disponivel: false });
    assert.equal(enviados.length, 0);
  });

  it("com o e-mail ligado, a consulta pública oferece os dois canais", async () => {
    assert.deepEqual((await requisitar(app, "GET", "/autenticacao/metodos")).json(), { telefone: true, email: true });
  });

  it("o plugin oficial usa os mesmos 300 s, 6 dígitos e 3 tentativas do telefone, com cadastro por e-mail aberto", () => {
    const plugin = comEmail.opcoes.plugins.find((item) => item.id === "email-otp");
    assert.ok(plugin && "options" in plugin, "plugin de e-mail não registrado");
    const opcoes = plugin.options as { expiresIn?: number; otpLength?: number; allowedAttempts?: number; disableSignUp?: boolean };
    assert.deepEqual([OTP_EXPIRA_EM_SEGUNDOS, opcoes.expiresIn, opcoes.otpLength, opcoes.allowedAttempts, Boolean(opcoes.disableSignUp)], [300, 300, 6, 3, false]);
    assert.equal(semEmail.opcoes.plugins.some((item) => item.id === "email-otp"), false);
  });
});

describe("cadastro novo por e-mail", () => {
  it("pedido de código: e-mail normalizado, 6 dígitos, validade de 300 s, código nunca na resposta", async () => {
    const antes = Date.now();
    const pedido = await pedirCodigo("  Nova.OTP-Email@Teste-Jaa.Example ");
    const depois = Date.now();
    assert.equal(pedido.statusCode, 200, pedido.body);
    const envio = enviados.at(-1);
    assert.deepEqual({ ...envio, codigo: "x" }, { email: EMAIL_NOVA, codigo: "x", validadeSegundos: 300 });
    assert.match(ultimoCodigo(EMAIL_NOVA), /^\d{6}$/);
    assert.ok(!pedido.body.includes(ultimoCodigo(EMAIL_NOVA)));

    const [verificacao] = await banco.select({ expiraEm: verifications.expiresAt }).from(verifications).where(eq(verifications.identifier, `sign-in-otp-${EMAIL_NOVA}`)).orderBy(desc(verifications.expiresAt)).limit(1);
    assert.ok(verificacao, "verificação não gravada");
    const expiraEm = verificacao.expiraEm.getTime();
    assert.ok(expiraEm >= antes + 300_000 && expiraEm <= depois + 300_000, `expiração fora de 300 s: ${expiraEm - antes} ms`);
    // Pedir o código não cria conta.
    assert.equal(await contaDoEmail(EMAIL_NOVA), undefined);
  });

  it("código incorreto não cria conta nem sessão", async () => {
    assert.equal((await pedirCodigo(EMAIL_NOVA)).statusCode, 200);
    const entrada = await auth("/sign-in/email-otp", { email: EMAIL_NOVA, otp: codigoErrado(ultimoCodigo(EMAIL_NOVA)) });
    assert.equal(entrada.statusCode, 400, entrada.body);
    assert.equal(entrada.json().code, "INVALID_OTP");
    assert.equal(temSessao(entrada), false);
    assert.equal(await contaDoEmail(EMAIL_NOVA), undefined);
  });

  it("depois de 3 tentativas erradas, nem o código certo é aceito", async () => {
    assert.equal((await pedirCodigo(EMAIL_TENTATIVAS)).statusCode, 200);
    const codigo = ultimoCodigo(EMAIL_TENTATIVAS);
    for (let tentativa = 1; tentativa <= 3; tentativa++) {
      const errada = await auth("/sign-in/email-otp", { email: EMAIL_TENTATIVAS, otp: codigoErrado(codigo) });
      assert.equal(errada.statusCode, 400, errada.body);
    }
    const aposEsgotar = await auth("/sign-in/email-otp", { email: EMAIL_TENTATIVAS, otp: codigo });
    assert.equal(aposEsgotar.statusCode, 403, aposEsgotar.body);
    assert.equal(aposEsgotar.json().code, "TOO_MANY_ATTEMPTS");
    assert.equal(await contaDoEmail(EMAIL_TENTATIVAS), undefined);
  });

  it("código expirado é recusado e não cria conta", async () => {
    assert.equal((await pedirCodigo(EMAIL_EXPIRADO)).statusCode, 200);
    await banco.update(verifications).set({ expiresAt: new Date(Date.now() - 60_000) }).where(eq(verifications.identifier, `sign-in-otp-${EMAIL_EXPIRADO}`));
    const entrada = await auth("/sign-in/email-otp", { email: EMAIL_EXPIRADO, otp: ultimoCodigo(EMAIL_EXPIRADO) });
    assert.equal(entrada.statusCode, 400, entrada.body);
    assert.equal(await contaDoEmail(EMAIL_EXPIRADO), undefined);
  });

  it("código correto cria a conta e a sessão: e-mail real verificado, SEM telefone e sem e-mail técnico", async () => {
    assert.equal((await pedirCodigo(EMAIL_NOVA)).statusCode, 200);
    const codigo = ultimoCodigo(EMAIL_NOVA);
    // Nada além de e-mail e código vem do cliente: nome, imagem ou telefone forjados são recusados.
    for (const extra of [{ name: "Nome Forjado" }, { image: "https://exemplo.invalid/x.png" }, { phoneNumber: TEL_BIA, phoneNumberVerified: true }]) {
      const forjada = await auth("/sign-in/email-otp", { email: EMAIL_NOVA, otp: codigo, ...extra });
      assert.equal(forjada.statusCode, 400, forjada.body);
      assert.equal(await contaDoEmail(EMAIL_NOVA), undefined);
    }
    const entrada = await auth("/sign-in/email-otp", { email: EMAIL_NOVA.toUpperCase(), otp: codigo });
    assert.equal(entrada.statusCode, 200, entrada.body);
    const cookie = cookieDeSessao(entrada);

    const conta = await contaDoEmail(EMAIL_NOVA);
    assert.ok(conta, "conta não criada");
    assert.deepEqual([conta.email, conta.emailVerified, conta.phoneNumber, conta.name, conta.image], [EMAIL_NOVA, true, null, NOME_TECNICO_CONTA, null]);
    assert.ok(!conta.email.endsWith(DOMINIO_EMAIL_TECNICO));

    // Mesmo caminho do cadastro por celular: falta só a identidade pessoal.
    const eu = await requisitar(app, "GET", "/usuarios/eu", { cookie });
    assert.deepEqual(eu.json(), { telefoneMascarado: null, cadastroCompleto: false, identidadePessoal: null });
    await criarIdentidade(cookie, "nova_otp_email");
    assert.deepEqual((await requisitar(app, "GET", "/conta/email", { cookie })).json(), { email: EMAIL_NOVA, disponivel: true });

    // Código de uso único.
    const repetida = await auth("/sign-in/email-otp", { email: EMAIL_NOVA, otp: codigo });
    assert.equal(repetida.statusCode, 400, repetida.body);
  });

  it("o mesmo e-mail de novo ENTRA na mesma conta — nunca cria outra", async () => {
    const antes = await contaDoEmail(EMAIL_NOVA);
    const outraVez = await entrarPorEmail(EMAIL_NOVA);
    assert.equal(outraVez.usuarioId, antes?.id);
    assert.equal((await contasCom(eq(users.email, EMAIL_NOVA))).length, 1);
  });

  it("conta sem telefone também entra com senha, pelo e-mail ou pelo @usuario", async () => {
    const nova = await entrarPorEmail(EMAIL_NOVA);
    const definida = await requisitar(app, "POST", "/conta/senha", { corpo: { senha: SENHA }, cookie: nova.cookie });
    assert.equal(definida.statusCode, 200, definida.body);

    for (const identificador of [EMAIL_NOVA, ` ${EMAIL_NOVA.toUpperCase()} `, "nova_otp_email", "@nova_otp_email"]) {
      const entrada = await entrarComSenha(identificador, SENHA);
      assert.equal(entrada.statusCode, 200, `${identificador}: ${entrada.body}`);
      const eu = await requisitar(app, "GET", "/usuarios/eu", { cookie: cookieDeSessao(entrada) });
      assert.equal(eu.json().identidadePessoal.nomeUsuario, "nova_otp_email");
    }
    // Senha errada, e-mail sem conta e e-mail técnico respondem igual.
    const tecnico = (await contaDoTelefone(TEL_ANA)).email;
    const respostas = [await entrarComSenha(EMAIL_NOVA, "nao-e-a-senha"), await entrarComSenha(EMAIL_LIVRE, SENHA), await entrarComSenha(tecnico, SENHA)];
    for (const resposta of respostas) {
      assert.equal(resposta.statusCode, 401, resposta.body);
      assert.equal(temSessao(resposta), false);
    }
    assert.equal(new Set(respostas.map((resposta) => resposta.body)).size, 1, "as três respostas são idênticas");
    // A rota pública de e-mail + senha do Better Auth continua desligada.
    assert.equal((await auth("/sign-in/email", { email: EMAIL_NOVA, password: SENHA })).statusCode, 404);
  });
});

describe("vincular o segundo identificador sem criar outra conta", () => {
  it("conta que nasceu por e-mail confirma um celular: o número entra NA MESMA conta", async () => {
    const nova = await entrarPorEmail(EMAIL_NOVA);
    const total = await totalDeContasDeTeste();
    const codigo = await codigoDoTelefone(TEL_NOVO, nova.cookie);
    // A chamada é a de sempre; por estar autenticada e sem telefone, o servidor VINCULA.
    const verificacao = await requisitar(app, "POST", "/api/auth/phone-number/verify", { corpo: { phoneNumber: TEL_NOVO, code: codigo }, cookie: nova.cookie });
    assert.equal(verificacao.statusCode, 200, verificacao.body);

    const conta = await contaDoTelefone(TEL_NOVO);
    assert.deepEqual([conta.id, conta.email, conta.emailVerified, conta.phoneNumberVerified], [nova.usuarioId, EMAIL_NOVA, true, true]);
    assert.equal(await totalDeContasDeTeste(), total, "nenhuma conta nova");
    assert.ok((await requisitar(app, "GET", "/usuarios/eu", { cookie: nova.cookie })).json().telefoneMascarado);
    // E agora a mesma conta também entra pelo celular.
    const peloTelefone = await requisitar(app, "POST", "/api/auth/phone-number/verify", { corpo: { phoneNumber: TEL_NOVO, code: await codigoDoTelefone(TEL_NOVO) } });
    assert.equal(peloTelefone.json().user.id, nova.usuarioId);
  });

  it("celular que já é de outra conta não é vinculado, nem as contas são unidas", async () => {
    const carol = await entrarPorEmail(EMAIL_CAROL);
    const total = await totalDeContasDeTeste();
    const codigo = await codigoDoTelefone(TEL_ANA, carol.cookie);
    const verificacao = await requisitar(app, "POST", "/api/auth/phone-number/verify", { corpo: { phoneNumber: TEL_ANA, code: codigo }, cookie: carol.cookie });
    assert.equal(verificacao.statusCode, 400, verificacao.body);
    assert.equal(verificacao.json().code, "PHONE_NUMBER_EXIST");
    assert.equal((await contaDoEmail(EMAIL_CAROL))?.phoneNumber, null);
    assert.equal((await contaDoTelefone(TEL_ANA)).id, ana.usuarioId);
    assert.equal(await totalDeContasDeTeste(), total);
  });

  it("conta do celular começa sem e-mail real, e o técnico nunca sai pelas rotas do Jaa", async () => {
    assert.deepEqual((await requisitar(app, "GET", "/conta/email", { cookie: ana.cookie })).json(), { email: null, disponivel: true });
    const tecnico = (await contaDoTelefone(TEL_ANA)).email;
    assert.ok(tecnico.endsWith(`@${DOMINIO_EMAIL_TECNICO}`));
    for (const caminho of ["/usuarios/eu", "/conta/contexto", "/conta/email"]) {
      const resposta = await requisitar(app, "GET", caminho, { cookie: ana.cookie });
      assert.ok(!resposta.body.includes(DOMINIO_EMAIL_TECNICO), caminho);
    }
    // Nem serve para pedir código.
    const pedido = await pedirCodigo(tecnico);
    assert.equal(pedido.statusCode, 400, pedido.body);
    assert.equal(pedido.json().code, "INVALID_EMAIL");
  });

  it("cadastrar e-mail exige sessão e um endereço válido", async () => {
    const total = enviados.length;
    assert.equal((await auth("/email-otp/request-email-change", { newEmail: EMAIL_ANA })).statusCode, 401);
    for (const newEmail of ["", "   ", "sem-arroba", "ana@", `abc@${DOMINIO_EMAIL_TECNICO}`, 123]) {
      const resposta = await auth("/email-otp/request-email-change", { newEmail }, ana.cookie);
      assert.equal(resposta.statusCode, 400, `${String(newEmail)}: ${resposta.body}`);
      assert.equal(resposta.json().code, "INVALID_EMAIL");
    }
    assert.equal(enviados.length, total);
  });

  it("conta do celular recebe um e-mail real: mesma conta, técnico substituído só depois do código", async () => {
    const total = await totalDeContasDeTeste();
    const pedido = await auth("/email-otp/request-email-change", { newEmail: "  Ana.OTP-Email@Teste-Jaa.Example " }, ana.cookie);
    assert.equal(pedido.statusCode, 200, pedido.body);
    const codigo = ultimoCodigo(EMAIL_ANA);
    assert.ok((await contaDoTelefone(TEL_ANA)).email.endsWith(`@${DOMINIO_EMAIL_TECNICO}`), "antes de confirmar, nada muda");

    const comErrado = await auth("/email-otp/change-email", { newEmail: EMAIL_ANA, otp: codigoErrado(codigo) }, ana.cookie);
    assert.equal(comErrado.statusCode, 400, comErrado.body);
    assert.ok((await contaDoTelefone(TEL_ANA)).email.endsWith(`@${DOMINIO_EMAIL_TECNICO}`));

    const confirmacao = await auth("/email-otp/change-email", { newEmail: EMAIL_ANA, otp: codigo }, ana.cookie);
    assert.equal(confirmacao.statusCode, 200, confirmacao.body);
    const conta = await contaDoTelefone(TEL_ANA);
    assert.deepEqual([conta.id, conta.email, conta.emailVerified, conta.phoneNumber], [ana.usuarioId, EMAIL_ANA, true, TEL_ANA]);
    assert.equal(await totalDeContasDeTeste(), total, "nenhuma conta nova");
    assert.deepEqual((await requisitar(app, "GET", "/conta/email", { cookie: ana.cookie })).json(), { email: EMAIL_ANA, disponivel: true });

    // A partir daqui o e-mail entra na MESMA conta do celular.
    assert.equal((await entrarPorEmail(EMAIL_ANA)).usuarioId, ana.usuarioId);
  });

  it("e-mail que já é de outra conta não é tomado: o dono recebe um aviso e nada muda", async () => {
    const bia = await entrarPorTelefone(TEL_BIA, "bia_otp_email");
    const [codigosAntes, avisosAntes] = [enviados.length, avisos.length];
    const pedido = await auth("/email-otp/request-email-change", { newEmail: EMAIL_ANA }, bia.cookie);
    assert.equal(pedido.statusCode, 200, pedido.body);
    assert.equal(enviados.length, codigosAntes, "nenhum código é enviado");
    assert.deepEqual(avisos.slice(avisosAntes), [EMAIL_ANA]);

    const tentativa = await auth("/email-otp/change-email", { newEmail: EMAIL_ANA, otp: "000000" }, bia.cookie);
    assert.equal(tentativa.statusCode, 400, tentativa.body);
    assert.ok((await contaDoTelefone(TEL_BIA)).email.endsWith(`@${DOMINIO_EMAIL_TECNICO}`));
    assert.equal((await contaDoEmail(EMAIL_ANA))?.id, ana.usuarioId);
  });
});

describe("alterar o e-mail da conta pelo Perfil", () => {
  const EMAIL_NOVO_DA_ANA = `ana.novo.${SUFIXO_EMAIL}`;

  it("conta que já tem e-mail troca por outro: código no endereço NOVO, e o antigo só sai depois de confirmar", async () => {
    // Ana já tem EMAIL_ANA (cadastrado acima). Entra de novo e pede a troca.
    const sessao = (await entrarPorEmail(EMAIL_ANA)).cookie;
    assert.deepEqual((await requisitar(app, "GET", "/conta/email", { cookie: sessao })).json(), { email: EMAIL_ANA, disponivel: true });

    const pedido = await auth("/email-otp/request-email-change", { newEmail: EMAIL_NOVO_DA_ANA }, sessao);
    assert.equal(pedido.statusCode, 200, pedido.body);
    const codigo = ultimoCodigo(EMAIL_NOVO_DA_ANA);
    assert.match(codigo, /^\d{6}$/);
    assert.equal(enviados.at(-1)?.validadeSegundos, 300);
    assert.equal(enviados.at(-1)?.email, EMAIL_NOVO_DA_ANA, "o código vai para o endereço novo, não para o atual");
    assert.equal((await contaDoTelefone(TEL_ANA)).email, EMAIL_ANA, "antes de confirmar, nada muda");

    // Código incorreto e código expirado não trocam nada.
    const errado = await auth("/email-otp/change-email", { newEmail: EMAIL_NOVO_DA_ANA, otp: codigoErrado(codigo) }, sessao);
    assert.equal(errado.statusCode, 400, errado.body);
    await banco.update(verifications).set({ expiresAt: new Date(Date.now() - 60_000) }).where(like(verifications.identifier, `change-email-otp-%-${EMAIL_NOVO_DA_ANA}`));
    const expirado = await auth("/email-otp/change-email", { newEmail: EMAIL_NOVO_DA_ANA, otp: codigo }, sessao);
    assert.equal(expirado.statusCode, 400, expirado.body);
    assert.equal((await contaDoTelefone(TEL_ANA)).email, EMAIL_ANA);

    // Novo pedido, código certo: agora troca — na MESMA conta, verificado.
    await zerarLimitesDeEmail();
    assert.equal((await auth("/email-otp/request-email-change", { newEmail: EMAIL_NOVO_DA_ANA }, sessao)).statusCode, 200);
    const confirmacao = await auth("/email-otp/change-email", { newEmail: EMAIL_NOVO_DA_ANA, otp: ultimoCodigo(EMAIL_NOVO_DA_ANA) }, sessao);
    assert.equal(confirmacao.statusCode, 200, confirmacao.body);
    const conta = await contaDoTelefone(TEL_ANA);
    assert.deepEqual([conta.id, conta.email, conta.emailVerified, conta.phoneNumber], [ana.usuarioId, EMAIL_NOVO_DA_ANA, true, TEL_ANA]);
    assert.deepEqual((await requisitar(app, "GET", "/conta/email", { cookie: sessao })).json(), { email: EMAIL_NOVO_DA_ANA, disponivel: true });
    // O endereço antigo deixa de entrar nesta conta; o novo entra.
    assert.equal((await entrarPorEmail(EMAIL_NOVO_DA_ANA)).usuarioId, ana.usuarioId);

    // Volta ao endereço de antes, para os testes seguintes.
    await zerarLimitesDeEmail();
    const volta = (await entrarPorEmail(EMAIL_NOVO_DA_ANA)).cookie;
    await zerarLimitesDeEmail();
    assert.equal((await auth("/email-otp/request-email-change", { newEmail: EMAIL_ANA }, volta)).statusCode, 200);
    assert.equal((await auth("/email-otp/change-email", { newEmail: EMAIL_ANA, otp: ultimoCodigo(EMAIL_ANA) }, volta)).statusCode, 200);
    assert.equal((await contaDoTelefone(TEL_ANA)).email, EMAIL_ANA);
  });

  it("falha do provedor ao alterar: erro genérico, sem citar fornecedor nem o endereço, e o e-mail não muda", async () => {
    const sessao = (await entrarPorEmail(EMAIL_ANA)).cookie;
    await zerarLimitesDeEmail();
    falhaDoEntregador = new ErroEntregaOtp("http", "Resend respondeu 403. Detalhe: validation_error", 403);
    const pedido = await auth("/email-otp/request-email-change", { newEmail: EMAIL_NOVO_DA_ANA }, sessao);
    assert.equal(pedido.statusCode, 503, pedido.body);
    assert.deepEqual(pedido.json(), { code: "FALHA_AO_ENVIAR_CODIGO", message: "Não foi possível enviar o código. Tente novamente." });
    for (const proibido of ["Resend", "validation_error", EMAIL_NOVO_DA_ANA, EMAIL_ANA]) assert.ok(!pedido.body.includes(proibido), proibido);
    assert.equal((await contaDoTelefone(TEL_ANA)).email, EMAIL_ANA);
  });
});

describe("a resposta do pedido de código não revela se o e-mail tem conta", () => {
  // Corpo e status; cabeçalhos de limite e data variam por requisição e não entram na comparação.
  const publico = (resposta: LightMyRequestResponse) => `${resposta.statusCode} ${resposta.body}`;

  it("entrar/cadastrar: e-mail COM conta e SEM conta têm a mesma resposta, com o provedor no ar ou fora", async () => {
    const [comConta, semConta] = [await pedirCodigo(EMAIL_ANA), await pedirCodigo(EMAIL_LIVRE)];
    assert.equal(comConta.statusCode, 200, comConta.body);
    assert.equal(publico(comConta), publico(semConta));
    // Os dois recebem código de verdade.
    assert.deepEqual(enviados.slice(-2).map((envio) => envio.email), [EMAIL_ANA, EMAIL_LIVRE]);

    await zerarLimitesDeEmail();
    falhaDoEntregador = new ErroEntregaOtp("tempo_esgotado", "Resend não respondeu em 8000 ms.");
    const [comContaFora, semContaFora] = [await pedirCodigo(EMAIL_ANA), await pedirCodigo(EMAIL_LIVRE)];
    assert.equal(comContaFora.statusCode, 503, comContaFora.body);
    assert.equal(comContaFora.json().code, "FALHA_AO_ENVIAR_CODIGO");
    assert.equal(publico(comContaFora), publico(semContaFora));
    assert.ok(!comContaFora.body.includes("Resend"), "o provedor não é exposto ao cliente");
  });

  it("cadastrar e-mail na conta: endereço LIVRE e endereço de OUTRA conta têm a mesma resposta, no ar ou fora", async () => {
    const bia = { cookie: cookieDeSessao(await requisitar(app, "POST", "/api/auth/phone-number/verify", { corpo: { phoneNumber: TEL_BIA, code: await codigoDoTelefone(TEL_BIA) } })) };
    const pedir = (newEmail: string) => auth("/email-otp/request-email-change", { newEmail }, bia.cookie);

    const [livre, deOutraConta] = [await pedir(EMAIL_LIVRE), await pedir(EMAIL_ANA)];
    assert.equal(livre.statusCode, 200, livre.body);
    assert.equal(publico(livre), publico(deOutraConta));

    await zerarLimitesDeEmail();
    falhaDoEntregador = new ErroEntregaOtp("http", "Resend respondeu 500.", 500);
    const [livreFora, deOutraContaFora] = [await pedir(EMAIL_LIVRE), await pedir(EMAIL_ANA)];
    assert.equal(livreFora.statusCode, 503, livreFora.body);
    assert.equal(publico(livreFora), publico(deOutraContaFora));
  });
});

describe("limites do código por e-mail", () => {
  it("um código por minuto por destinatário, de onde quer que venha o pedido", async () => {
    const total = enviados.length;
    assert.equal((await pedirCodigo(EMAIL_LIVRE)).statusCode, 200);
    const repetido = await pedirCodigo(EMAIL_LIVRE);
    assert.equal(repetido.statusCode, 429, repetido.body);
    assert.equal(repetido.json().code, "OTP_SOLICITADO_RECENTEMENTE");
    assert.equal(enviados.length, total + 1);
  });

  it("teto por hora por destinatário", async () => {
    for (let pedido = 1; pedido <= MAXIMO_CODIGOS_EMAIL_POR_DESTINATARIO_POR_HORA; pedido++) {
      await zerarIntervaloDeUmMinuto();
      assert.equal((await pedirCodigo(EMAIL_LIVRE)).statusCode, 200, `pedido ${pedido}`);
    }
    await zerarIntervaloDeUmMinuto();
    const alemDoTeto = await pedirCodigo(EMAIL_LIVRE);
    assert.equal(alemDoTeto.statusCode, 429, alemDoTeto.body);
    assert.equal(alemDoTeto.json().code, "MUITOS_PEDIDOS_DE_CODIGO");
  });

  it("limite por IP do plugin: 3 pedidos por minuto, o 4º é recusado", async () => {
    const ip = novoIp();
    const pedir = (indice: number) => requisitar(app, "POST", "/api/auth/email-otp/send-verification-otp", { corpo: { email: `ip${indice}.${SUFIXO_EMAIL}`, type: "sign-in" }, ip });
    for (let indice = 1; indice <= 3; indice++) assert.equal((await pedir(indice)).statusCode, 200);
    assert.equal((await pedir(4)).statusCode, 429);
  });
});

describe("superfície do plugin de e-mail que o Jaa não usa", () => {
  it("só o tipo de ENTRADA é aceito; e-mail inválido é recusado antes de qualquer envio", async () => {
    const total = enviados.length;
    for (const type of ["email-verification", "forget-password", "change-email"]) {
      const resposta = await auth("/email-otp/send-verification-otp", { email: EMAIL_ANA, type });
      assert.equal(resposta.statusCode, 400, `${type}: ${resposta.body}`);
    }
    for (const email of ["", "sem-arroba", "a@b"]) {
      const resposta = await pedirCodigo(email);
      assert.equal(resposta.json().code, "INVALID_EMAIL", resposta.body);
    }
    assert.equal(enviados.length, total);
  });

  it("verificação avulsa e recuperação de senha por e-mail ficam desligadas", async () => {
    for (const caminho of ["/email-otp/verify-email", "/email-otp/check-verification-otp", "/email-otp/request-password-reset", "/forget-password/email-otp", "/email-otp/reset-password"]) {
      const resposta = await auth(caminho, { email: EMAIL_ANA, otp: "000000", password: "uma-senha-qualquer-2026", type: "sign-in" });
      assert.equal(resposta.statusCode, 404, `${caminho}: ${resposta.body}`);
    }
  });
});
