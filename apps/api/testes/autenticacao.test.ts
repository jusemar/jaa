import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { criarConexaoBanco } from "@jaa/banco";
import { identidades, rateLimits, sessions, users, verifications } from "@jaa/banco/schema";
import { betterAuth } from "better-auth";
import { testUtils } from "better-auth/plugins";
import { and, count, eq, inArray, like, sql } from "drizzle-orm";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { criarAplicacao } from "../src/aplicacao.js";
import { criarOpcoesAutenticacao } from "../src/features/autenticacao/autenticacao.js";
import { derivarEmailTecnico, NOME_TECNICO_CONTA } from "../src/features/autenticacao/lib/conta-tecnica.js";
import { carregarAmbiente } from "../src/lib/ambiente.js";

/*
 * Teste de integração real: Fastify + Better Auth + PostgreSQL LOCAL do Jaa.
 * Os códigos OTP são capturados pelo utilitário oficial `testUtils({ captureOTP: true })`,
 * presente somente nesta instância de teste. Nenhum SMS é enviado.
 * Todos os dados usam telefones e IPs reservados abaixo e são removidos ao final.
 */

const ORIGEM_WEB = "http://localhost:3000";
const PREFIXO_IP_TESTE = "198.51.100."; // TEST-NET-2 (RFC 5737)

const TELEFONES_TESTE = Array.from({ length: 14 }, (_, i) => `+55319876500${String(i + 1).padStart(2, "0")}`);
const [TEL_PRINCIPAL, TEL_OTP_INCORRETO, TEL_OTP_EXPIRADO, TEL_MARIA, TEL_OUTRA_CONTA, ...TEL_RATE_LIMIT] =
  TELEFONES_TESTE as [string, string, string, string, string, ...string[]];

const ambiente = carregarAmbiente();
const conexao = criarConexaoBanco(ambiente.DATABASE_URL);
const { banco } = conexao;

const opcoes = criarOpcoesAutenticacao({
  banco,
  ambiente,
  entregadorOtp: { enviar: async () => {} },
});
const autenticacao = betterAuth({
  ...opcoes,
  plugins: [...opcoes.plugins, testUtils({ captureOTP: true })],
});

let app: FastifyInstance;

async function obterOtp(telefone: string): Promise<string> {
  const contexto = await autenticacao.$context;
  const codigo = contexto.test.getOTP?.(telefone);
  assert.ok(codigo, `OTP não capturado para ${telefone}`);
  return codigo;
}

function requisitar(opcoesRequisicao: {
  metodo: "GET" | "POST";
  url: string;
  ip: string;
  corpo?: unknown;
  cookie?: string;
  cabecalhos?: Record<string, string>;
}): Promise<LightMyRequestResponse> {
  return app.inject({
    method: opcoesRequisicao.metodo,
    url: opcoesRequisicao.url,
    remoteAddress: opcoesRequisicao.ip,
    headers: {
      origin: ORIGEM_WEB,
      ...(opcoesRequisicao.corpo !== undefined ? { "content-type": "application/json" } : {}),
      ...(opcoesRequisicao.cookie ? { cookie: opcoesRequisicao.cookie } : {}),
      ...opcoesRequisicao.cabecalhos,
    },
    ...(opcoesRequisicao.corpo !== undefined ? { payload: JSON.stringify(opcoesRequisicao.corpo) } : {}),
  });
}

const solicitarOtp = (telefone: string, ip: string, cabecalhos?: Record<string, string>) =>
  requisitar({ metodo: "POST", url: "/api/auth/phone-number/send-otp", ip, corpo: { phoneNumber: telefone }, cabecalhos });

const verificarOtp = (telefone: string, codigo: string, ip: string) =>
  requisitar({ metodo: "POST", url: "/api/auth/phone-number/verify", ip, corpo: { phoneNumber: telefone, code: codigo } });

function extrairCookieSessao(resposta: LightMyRequestResponse): string {
  const cookie = resposta.cookies.find((c) => c.name === "better-auth.session_token");
  assert.ok(cookie?.value, "cookie de sessão ausente");
  return `${cookie.name}=${cookie.value}`;
}

async function entrarComTelefone(telefoneDigitado: string, telefoneE164: string, ip: string) {
  const envio = await solicitarOtp(telefoneDigitado, ip);
  assert.equal(envio.statusCode, 200, envio.body);
  const verificacao = await verificarOtp(telefoneDigitado, await obterOtp(telefoneE164), ip);
  assert.equal(verificacao.statusCode, 200, verificacao.body);
  return { cookie: extrairCookieSessao(verificacao), usuario: verificacao.json().user as { id: string } };
}

async function contarUsuarios(telefone: string) {
  const [linha] = await banco.select({ total: count() }).from(users).where(eq(users.phoneNumber, telefone));
  return linha?.total ?? 0;
}

async function contarIdentidadesPessoais(usuarioId: string) {
  const [linha] = await banco
    .select({ total: count() })
    .from(identidades)
    .where(and(eq(identidades.usuarioId, usuarioId), eq(identidades.tipo, "pessoal")));
  return linha?.total ?? 0;
}

async function limparDadosDeTeste() {
  const usuariosTeste = banco.select({ id: users.id }).from(users).where(inArray(users.phoneNumber, TELEFONES_TESTE));
  await banco.delete(identidades).where(inArray(identidades.usuarioId, usuariosTeste));
  await banco.delete(users).where(inArray(users.phoneNumber, TELEFONES_TESTE)); // sessions/accounts em cascata
  await banco.delete(verifications).where(inArray(verifications.identifier, TELEFONES_TESTE));
  await banco.delete(rateLimits).where(like(rateLimits.key, `${PREFIXO_IP_TESTE}%`));
}

before(async () => {
  await limparDadosDeTeste();
  app = await criarAplicacao({ ambiente, banco, autenticacao, logger: false });
  await app.ready();
});

after(async () => {
  await limparDadosDeTeste();
  await app.close();
  await conexao.encerrar();
});

describe("cenário principal: telefone → OTP → conta → sessão → identidade → logout → novo login", () => {
  const ip = `${PREFIXO_IP_TESTE}1`;
  let cookie = "";
  let usuarioId = "";
  let identidadeId = "";

  it("solicita OTP com telefone em formato nacional e cria conta ao verificar", async () => {
    assert.equal(await contarUsuarios(TEL_PRINCIPAL), 0);

    const envio = await solicitarOtp("(31) 98765-0001", ip);
    assert.equal(envio.statusCode, 200);
    assert.deepEqual(envio.json(), { message: "code sent" });

    const codigo = await obterOtp(TEL_PRINCIPAL);
    assert.match(codigo, /^\d{6}$/);

    const verificacao = await verificarOtp("(31) 98765-0001", codigo, ip);
    assert.equal(verificacao.statusCode, 200, verificacao.body);
    const corpo = verificacao.json();
    assert.equal(corpo.user.phoneNumber, TEL_PRINCIPAL);
    assert.equal(corpo.user.phoneNumberVerified, true);

    cookie = extrairCookieSessao(verificacao);
    usuarioId = corpo.user.id;

    const [conta] = await banco.select().from(users).where(eq(users.phoneNumber, TEL_PRINCIPAL));
    assert.ok(conta);
    assert.equal(await contarUsuarios(TEL_PRINCIPAL), 1);
    assert.equal(conta.phoneNumberVerified, true);
    // Dados técnicos exigidos pelo Better Auth: nenhum deles pode expor o telefone.
    assert.equal(conta.email, derivarEmailTecnico(TEL_PRINCIPAL, ambiente.BETTER_AUTH_SECRET));
    assert.match(conta.email, /^[0-9a-f]{64}@email-tecnico\.jaa\.invalid$/);
    assert.equal(conta.name, NOME_TECNICO_CONTA);
    for (const trecho of [TEL_PRINCIPAL, TEL_PRINCIPAL.slice(1), TEL_PRINCIPAL.slice(3), TEL_PRINCIPAL.slice(5)]) {
      assert.ok(!conta.email.includes(trecho), `e-mail técnico contém "${trecho}"`);
      assert.ok(!conta.name.includes(trecho), `nome técnico contém "${trecho}"`);
    }
  });

  it("OTP é consumido após uso", async () => {
    const reutilizado = await verificarOtp(TEL_PRINCIPAL, await obterOtp(TEL_PRINCIPAL), ip);
    assert.equal(reutilizado.statusCode, 400);
  });

  it("sessão autenticada é reconhecida pelo servidor", async () => {
    const sessao = await requisitar({ metodo: "GET", url: "/api/auth/get-session", ip, cookie });
    assert.equal(sessao.statusCode, 200);
    assert.equal(sessao.json().user.id, usuarioId);
  });

  it("cadastro está incompleto enquanto não houver identidade pessoal", async () => {
    const conta = await requisitar({ metodo: "GET", url: "/usuarios/eu", ip, cookie });
    assert.equal(conta.statusCode, 200);
    assert.deepEqual(conta.json(), {
      telefoneMascarado: "(31) •••••-0001",
      cadastroCompleto: false,
      identidadePessoal: null,
    });
  });

  it("cria a identidade pessoal com nome e @usuario normalizados", async () => {
    const criacao = await requisitar({
      metodo: "POST",
      url: "/identidades/pessoal",
      ip,
      cookie,
      corpo: { nomeExibicao: "  Junior   Rocha ", nomeUsuario: "@Junior_Teste" },
    });
    assert.equal(criacao.statusCode, 201, criacao.body);
    const identidade = criacao.json();
    assert.equal(identidade.nomeExibicao, "Junior Rocha");
    assert.equal(identidade.nomeUsuario, "junior_teste");
    identidadeId = identidade.id;
  });

  it("repetir a mesma criação é idempotente e não duplica", async () => {
    const repeticao = await requisitar({
      metodo: "POST",
      url: "/identidades/pessoal",
      ip,
      cookie,
      corpo: { nomeExibicao: "Junior Rocha", nomeUsuario: "junior_teste" },
    });
    assert.equal(repeticao.statusCode, 200);
    assert.equal(repeticao.json().id, identidadeId);
    assert.equal(await contarIdentidadesPessoais(usuarioId), 1);
  });

  it("recusa uma segunda identidade pessoal diferente para a mesma conta", async () => {
    const segunda = await requisitar({
      metodo: "POST",
      url: "/identidades/pessoal",
      ip,
      cookie,
      corpo: { nomeExibicao: "Outro Nome", nomeUsuario: "outro_teste" },
    });
    assert.equal(segunda.statusCode, 409);
    assert.equal(segunda.json().codigo, "IDENTIDADE_PESSOAL_JA_EXISTE");
    assert.equal(await contarIdentidadesPessoais(usuarioId), 1);
  });

  it("cadastro completo e rota protegida acessível com sessão", async () => {
    const conta = await requisitar({ metodo: "GET", url: "/usuarios/eu", ip, cookie });
    assert.equal(conta.json().cadastroCompleto, true);
    assert.equal(conta.json().identidadePessoal.id, identidadeId);

    const protegida = await requisitar({ metodo: "GET", url: "/autenticacao/teste-protegido", ip, cookie });
    assert.equal(protegida.statusCode, 200);
    assert.equal(protegida.json().autenticado, true);
  });

  it("logout invalida a sessão no servidor (não apenas no cookie)", async () => {
    const saida = await requisitar({ metodo: "POST", url: "/api/auth/sign-out", ip, cookie, corpo: {} });
    assert.equal(saida.statusCode, 200);

    const [sessoes] = await banco.select({ total: count() }).from(sessions).where(eq(sessions.userId, usuarioId));
    assert.equal(sessoes?.total, 0);

    // Reutilizar o cookie antigo depois do logout.
    const comCookieAntigo = await requisitar({ metodo: "GET", url: "/autenticacao/teste-protegido", ip, cookie });
    assert.equal(comCookieAntigo.statusCode, 401);

    const semSessao = await requisitar({ metodo: "GET", url: "/autenticacao/teste-protegido", ip });
    assert.equal(semSessao.statusCode, 401);
    assert.deepEqual(semSessao.json(), { codigo: "NAO_AUTENTICADO", mensagem: "Sessão ausente ou expirada." });

    const contaSemSessao = await requisitar({ metodo: "GET", url: "/usuarios/eu", ip });
    assert.equal(contaSemSessao.statusCode, 401);
  });

  it("novo login com novo OTP recupera a mesma conta e a mesma identidade", async () => {
    const segundoLogin = await entrarComTelefone("+55 31 98765-0001", TEL_PRINCIPAL, ip);
    assert.equal(segundoLogin.usuario.id, usuarioId);

    const conta = await requisitar({ metodo: "GET", url: "/usuarios/eu", ip, cookie: segundoLogin.cookie });
    assert.equal(conta.json().cadastroCompleto, true);
    assert.equal(conta.json().identidadePessoal.id, identidadeId);

    assert.equal(await contarUsuarios(TEL_PRINCIPAL), 1);
    assert.equal(await contarIdentidadesPessoais(usuarioId), 1);
  });
});

describe("OTP incorreto e tentativas", () => {
  const ip = `${PREFIXO_IP_TESTE}2`;

  it("código errado é recusado, não cria conta e esgota após 3 tentativas", async () => {
    assert.equal((await solicitarOtp(TEL_OTP_INCORRETO, ip)).statusCode, 200);
    const correto = await obterOtp(TEL_OTP_INCORRETO);
    const errado = correto.slice(0, 5) + String((Number(correto[5]) + 1) % 10);

    for (let tentativa = 1; tentativa <= 3; tentativa++) {
      const resposta = await verificarOtp(TEL_OTP_INCORRETO, errado, ip);
      assert.equal(resposta.statusCode, 400);
      assert.equal(resposta.json().code, "INVALID_OTP");
    }

    // Após esgotar as tentativas, nem o código correto é aceito.
    const aposEsgotar = await verificarOtp(TEL_OTP_INCORRETO, correto, ip);
    assert.equal(aposEsgotar.statusCode, 403);
    assert.equal(aposEsgotar.json().code, "TOO_MANY_ATTEMPTS");
    assert.equal(await contarUsuarios(TEL_OTP_INCORRETO), 0);
  });
});

describe("OTP expirado", () => {
  const ip = `${PREFIXO_IP_TESTE}3`;

  it("código expirado é recusado", async () => {
    assert.equal((await solicitarOtp(TEL_OTP_EXPIRADO, ip)).statusCode, 200);
    const codigo = await obterOtp(TEL_OTP_EXPIRADO);

    // Simula a passagem do tempo apenas no registro de verificação deste telefone de teste.
    await banco
      .update(verifications)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(verifications.identifier, TEL_OTP_EXPIRADO));

    const resposta = await verificarOtp(TEL_OTP_EXPIRADO, codigo, ip);
    assert.equal(resposta.statusCode, 400);
    assert.equal(resposta.json().code, "OTP_EXPIRED");
    assert.equal(await contarUsuarios(TEL_OTP_EXPIRADO), 0);
  });
});

describe("@usuario: unicidade, maiúsculas e formato", () => {
  const ip = `${PREFIXO_IP_TESTE}4`;
  let cookieMaria = "";
  let usuarioMaria = "";
  let cookieOutra = "";

  before(async () => {
    const maria = await entrarComTelefone(TEL_MARIA, TEL_MARIA, ip);
    cookieMaria = maria.cookie;
    usuarioMaria = maria.usuario.id;
    const criacao = await requisitar({
      metodo: "POST",
      url: "/identidades/pessoal",
      ip,
      cookie: cookieMaria,
      corpo: { nomeExibicao: "Maria", nomeUsuario: "maria_teste" },
    });
    assert.equal(criacao.statusCode, 201, criacao.body);
    cookieOutra = (await entrarComTelefone(TEL_OUTRA_CONTA, TEL_OUTRA_CONTA, ip)).cookie;
  });

  for (const variacao of ["maria_teste", "MARIA_TESTE", "@Maria_Teste", "  maria_TESTE "]) {
    it(`"${variacao}" já pertence a outra conta`, async () => {
      const resposta = await requisitar({
        metodo: "POST",
        url: "/identidades/pessoal",
        ip,
        cookie: cookieOutra,
        corpo: { nomeExibicao: "Outra Pessoa", nomeUsuario: variacao },
      });
      assert.equal(resposta.statusCode, 409);
      assert.equal(resposta.json().codigo, "NOME_USUARIO_INDISPONIVEL");
    });
  }

  for (const reservado of ["jaa", "admin", "@Suporte", "SEGURANCA", " security "]) {
    it(`nome reservado "${reservado}" é recusado`, async () => {
      const resposta = await requisitar({
        metodo: "POST",
        url: "/identidades/pessoal",
        ip,
        cookie: cookieOutra,
        corpo: { nomeExibicao: "Outra Pessoa", nomeUsuario: reservado },
      });
      assert.equal(resposta.statusCode, 400);
      assert.deepEqual(resposta.json(), {
        codigo: "DADOS_INVALIDOS",
        mensagem: "Este @usuario não está disponível.",
      });
    });
  }

  for (const invalido of ["ab", "1maria", "_maria", "júnior", "maria rocha", "maria.rocha", "a".repeat(31)]) {
    it(`formato inválido "${invalido}" é recusado`, async () => {
      const resposta = await requisitar({
        metodo: "POST",
        url: "/identidades/pessoal",
        ip,
        cookie: cookieOutra,
        corpo: { nomeExibicao: "Outra Pessoa", nomeUsuario: invalido },
      });
      assert.equal(resposta.statusCode, 400);
      assert.equal(resposta.json().codigo, "DADOS_INVALIDOS");
    });
  }

  it("criar identidade exige sessão", async () => {
    const resposta = await requisitar({
      metodo: "POST",
      url: "/identidades/pessoal",
      ip,
      corpo: { nomeExibicao: "Sem Sessão", nomeUsuario: "sem_sessao" },
    });
    assert.equal(resposta.statusCode, 401);
  });

  it("o banco recusa diretamente @usuario fora da forma canônica e segunda identidade pessoal", async () => {
    await assert.rejects(
      banco.insert(identidades).values({
        usuarioId: usuarioMaria,
        tipo: "pessoal",
        nomeExibicao: "Maria",
        nomeUsuario: "Maria_Maiuscula",
      }),
      (erro: Error) => /identidades_nome_usuario_formato/.test(String(erro.cause)),
    );
    await assert.rejects(
      banco.insert(identidades).values({
        usuarioId: usuarioMaria,
        tipo: "pessoal",
        nomeExibicao: "Maria",
        nomeUsuario: "maria_segunda",
      }),
      (erro: Error) => /identidades_pessoal_por_usuario_unico/.test(String(erro.cause)),
    );
    assert.equal(await contarIdentidadesPessoais(usuarioMaria), 1);
  });
});

describe("telefone inválido", () => {
  const ip = `${PREFIXO_IP_TESTE}5`;

  // Um IP por caso: tentativas inválidas também consomem a cota de 5 envios/min por IP.
  for (const [indice, telefone] of ["123", "abc", "(31) 3222-4399", "+5531987650001999", "", "+".repeat(40), "+351 912 345 678", "+1 415 555 2671"].entries()) {
    it(`"${telefone.slice(0, 20)}" é recusado antes de gerar OTP`, async () => {
      const resposta = await solicitarOtp(telefone, `${PREFIXO_IP_TESTE}${20 + indice}`);
      assert.equal(resposta.statusCode, 400);
      assert.equal(resposta.json().code, "INVALID_PHONE_NUMBER");
    });
  }

  it("verificação com telefone inválido é recusada", async () => {
    const resposta = await verificarOtp("123", "123456", ip);
    assert.equal(resposta.statusCode, 400);
    assert.equal(resposta.json().code, "INVALID_PHONE_NUMBER");
  });
});

describe("proteções contra abuso de envio de OTP", () => {
  it("resposta de envio não revela se a conta já existe", async () => {
    const ip = `${PREFIXO_IP_TESTE}6`;
    // TEL_PRINCIPAL já possui conta; TEL_RATE_LIMIT[6] nunca foi usado.
    const existente = await solicitarOtp(TEL_PRINCIPAL, ip);
    const inexistente = await solicitarOtp(TEL_RATE_LIMIT[6] as string, ip);
    assert.equal(existente.statusCode, inexistente.statusCode);
    assert.deepEqual(existente.json(), inexistente.json());
  });

  it("mesmo telefone não recebe outro código antes de 60s, mesmo vindo de outro IP", async () => {
    const telefone = TEL_RATE_LIMIT[5] as string;
    assert.equal((await solicitarOtp(telefone, `${PREFIXO_IP_TESTE}7`)).statusCode, 200);
    const repeticao = await solicitarOtp(telefone, `${PREFIXO_IP_TESTE}8`);
    assert.equal(repeticao.statusCode, 429);
    assert.equal(repeticao.json().code, "OTP_SOLICITADO_RECENTEMENTE");
  });

  it("limita envios por IP (5/min) e ignora cabeçalho de IP forjado pelo cliente", async () => {
    const ip = `${PREFIXO_IP_TESTE}9`;
    for (const telefone of TEL_RATE_LIMIT.slice(0, 5)) {
      assert.equal((await solicitarOtp(telefone, ip)).statusCode, 200);
    }

    // Telefones nunca usados: o 429 só pode vir do limite por IP, não do intervalo por telefone.
    const excedente = await solicitarOtp(TEL_RATE_LIMIT[7] as string, ip);
    assert.equal(excedente.statusCode, 429);
    assert.ok(excedente.headers["x-retry-after"]);
    assert.notEqual(excedente.json().code, "OTP_SOLICITADO_RECENTEMENTE");

    const comIpForjado = await solicitarOtp(TEL_RATE_LIMIT[8] as string, ip, { "x-jaa-ip-cliente": "203.0.113.50" });
    assert.equal(comIpForjado.statusCode, 429);
    assert.ok(comIpForjado.headers["x-retry-after"]);
  });

  it("rotas de senha do plugin de telefone estão desativadas", async () => {
    const ip = `${PREFIXO_IP_TESTE}10`;
    for (const url of [
      "/api/auth/sign-in/phone-number",
      "/api/auth/phone-number/request-password-reset",
      "/api/auth/phone-number/reset-password",
    ]) {
      const resposta = await requisitar({
        metodo: "POST",
        url,
        ip,
        corpo: { phoneNumber: TEL_PRINCIPAL, password: "senha-qualquer", otp: "123456", newPassword: "x" },
      });
      assert.equal(resposta.statusCode, 404, url);
    }
  });

  it("não há login por e-mail e senha", async () => {
    const resposta = await requisitar({
      metodo: "POST",
      url: "/api/auth/sign-up/email",
      ip: `${PREFIXO_IP_TESTE}11`,
      corpo: { email: "teste@exemplo.com", password: "senha-qualquer-123", name: "Teste" },
    });
    assert.notEqual(resposta.statusCode, 200);
    const [linha] = await banco
      .select({ total: count() })
      .from(users)
      .where(sql`${users.email} = 'teste@exemplo.com'`);
    assert.equal(linha?.total, 0);
  });
});
