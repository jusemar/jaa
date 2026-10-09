import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { criarEntregadorOtpEmailDesenvolvimento } from "../src/features/autenticacao/entrega-otp/entregador-otp-email-desenvolvimento.js";
import { ASSUNTO_EMAIL_AVISO, ASSUNTO_EMAIL_OTP, conteudoEmailOtp, criarEntregadorOtpEmailResend } from "../src/features/autenticacao/entrega-otp/entregador-otp-email-resend.js";
import { criarEntregadorOtpEmail } from "../src/features/autenticacao/entrega-otp/entregador-otp-email.js";
import { criarEntregadorOtp } from "../src/features/autenticacao/entrega-otp/entregador-otp.js";
import { ErroEntregaOtp } from "../src/features/autenticacao/entrega-otp/erro-entrega-otp.js";
import { ehEmailTecnico, mascararEmail, normalizarEmail } from "../src/features/autenticacao/lib/email.js";
import { carregarAmbiente } from "../src/lib/ambiente.js";

/*
 * NENHUM E-MAIL REAL: o Resend é sempre substituído por uma função `buscar` falsa, e a fábrica por
 * ambiente (`criarEntregadorOtpEmail`) só é CRIADA aqui, nunca usada para enviar.
 */

const CHAVE = "re_chave_falsa_de_teste_0123456789";
const REMETENTE = "Jaaa <codigo@exemplo.com.br>";
const EMAIL = "ana.teste@exemplo.com";
const CODIGO = "482913";
const VALIDADE = 300;

interface Chamada {
  url: string;
  opcoes: RequestInit;
}

function resend(responder: (chamada: Chamada) => Response | Promise<Response>, extras: { timeoutMs?: number } = {}) {
  const chamadas: Chamada[] = [];
  const entregador = criarEntregadorOtpEmailResend({
    chaveApi: CHAVE,
    remetente: REMETENTE,
    ...extras,
    buscar: async (url, opcoes) => {
      const chamada = { url: String(url), opcoes: opcoes ?? {} };
      chamadas.push(chamada);
      return responder(chamada);
    },
  });
  return { entregador, chamadas };
}

const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
const aceito = () => json({ id: "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794" });
const enviar = (entregador: ReturnType<typeof resend>["entregador"], email = EMAIL) => entregador.enviar({ email, codigo: CODIGO, validadeSegundos: VALIDADE });

async function falha(promessa: Promise<void>): Promise<ErroEntregaOtp> {
  try {
    await promessa;
  } catch (erro) {
    assert.ok(erro instanceof ErroEntregaOtp, "a falha deve ser um ErroEntregaOtp");
    return erro;
  }
  assert.fail("o envio deveria ter falhado");
}

// Nada do que identifica a pessoa, o código ou a conta pode aparecer no erro (ele vai para o log).
function semDadosSensiveis(erro: ErroEntregaOtp) {
  const texto = `${erro.message} ${erro.stack ?? ""} ${JSON.stringify(erro)}`;
  for (const proibido of [CHAVE, CODIGO, EMAIL]) assert.ok(!texto.includes(proibido), `o erro expõe "${proibido}"`);
}

describe("entregador de OTP por e-mail do Resend", () => {
  it("envia o código do Better Auth, sem alterá-lo, no contrato da API do Resend", async () => {
    const { entregador, chamadas } = resend(aceito);
    await enviar(entregador);

    assert.equal(chamadas.length, 1);
    const [chamada] = chamadas as [Chamada];
    assert.equal(chamada.url, "https://api.resend.com/emails");
    assert.equal(chamada.opcoes.method, "POST");
    assert.deepEqual(chamada.opcoes.headers, { authorization: `Bearer ${CHAVE}`, "content-type": "application/json" });
    assert.ok(!chamada.url.includes(CHAVE), "a chave nunca vai na URL");

    const corpo = JSON.parse(String(chamada.opcoes.body)) as { from: string; to: string[]; subject: string; text: string; html: string };
    assert.deepEqual(Object.keys(corpo).sort(), ["from", "html", "subject", "text", "to"]);
    assert.equal(corpo.from, REMETENTE);
    assert.deepEqual(corpo.to, [EMAIL]);
    assert.equal(corpo.subject, "Seu código de verificação Jaaa");
    assert.ok(corpo.text.includes(`Seu código de verificação é: ${CODIGO}`));
    assert.ok(corpo.html.includes(CODIGO));
  });

  it("a mensagem diz o código, os 5 minutos e o aviso de não compartilhar, em texto e em HTML", () => {
    const { assunto, texto, html } = conteudoEmailOtp("123456", 300);
    assert.equal(assunto, ASSUNTO_EMAIL_OTP);
    for (const parte of [texto, html]) {
      assert.ok(parte.includes("123456"));
      assert.ok(parte.includes("Este código expira em 5 minutos."));
      assert.ok(parte.includes("Não compartilhe este código com ninguém."));
    }
    assert.ok(conteudoEmailOtp("123456", 60).texto.includes("expira em 1 minuto."));
    // Só dígitos entram no HTML, venha o que vier.
    assert.ok(!conteudoEmailOtp("12<b>34", 300).html.includes("<b>34"));
  });

  it("aviso de e-mail já cadastrado: mesmo canal e mesmo contrato, sem código nenhum", async () => {
    const { entregador, chamadas } = resend(aceito);
    await entregador.avisarEnderecoJaCadastrado({ email: EMAIL });
    const [chamada] = chamadas as [Chamada];
    assert.equal(chamada.url, "https://api.resend.com/emails");
    const corpo = JSON.parse(String(chamada.opcoes.body)) as { from: string; to: string[]; subject: string; text: string; html: string };
    assert.deepEqual([corpo.from, corpo.to, corpo.subject], [REMETENTE, [EMAIL], ASSUNTO_EMAIL_AVISO]);
    assert.ok(corpo.text.includes("já pertence a uma conta") && corpo.text.includes("nada foi alterado"));
    assert.ok(!/\d{6}/.test(corpo.text + corpo.html), "o aviso não leva código");

    // Falha do aviso é falha igual à do código (é o que mantém as respostas indistinguíveis).
    const fora = resend(() => json({ statusCode: 500, name: "application_error", message: "x" }, 500));
    const erro = await falha(fora.entregador.avisarEnderecoJaCadastrado({ email: EMAIL }));
    assert.deepEqual([erro.motivo, erro.status], ["http", 500]);
    semDadosSensiveis(erro);
  });

  it("erro HTTP do Resend é falha de entrega, com status e motivo, sem dados sensíveis", async () => {
    const { entregador } = resend(() => json({ statusCode: 403, name: "validation_error", message: `The exemplo.com.br domain is not verified (to ${EMAIL}, key ${CHAVE})` }, 403));
    const erro = await falha(enviar(entregador));
    assert.equal(erro.motivo, "http");
    assert.equal(erro.status, 403);
    assert.match(erro.message, /Resend respondeu 403\. Detalhe: validation_error: The exemplo\.com\.br domain is not verified/);
    semDadosSensiveis(erro);
  });

  it("limite e indisponibilidade do Resend (429, 500) também são falha", async () => {
    for (const status of [429, 500]) {
      const { entregador } = resend(() => json({ statusCode: status, name: "erro", message: "falhou" }, status));
      const erro = await falha(enviar(entregador));
      assert.deepEqual([erro.motivo, erro.status], ["http", status]);
    }
  });

  it("200 sem o id do e-mail (corpo vazio, HTML, JSON estranho) não conta como enviado", async () => {
    for (const resposta of [() => new Response("", { status: 200 }), () => new Response("<html>ok</html>", { status: 200 }), () => json({ ok: true }), () => json({ id: "" }), () => json({ id: 123 })]) {
      const { entregador } = resend(resposta);
      const erro = await falha(enviar(entregador));
      assert.equal(erro.motivo, "resposta_invalida");
      semDadosSensiveis(erro);
    }
  });

  it("falha de rede é erro seguro (o erro original, com a requisição, não é repassado)", async () => {
    const { entregador } = resend(() => {
      throw new Error(`connect ECONNREFUSED Bearer ${CHAVE} to=${EMAIL} otp=${CODIGO}`);
    });
    const erro = await falha(enviar(entregador));
    assert.equal(erro.motivo, "rede");
    assert.equal(erro.cause, undefined);
    semDadosSensiveis(erro);
  });

  it("tem timeout explícito: sem resposta, a chamada é abortada e vira falha", async () => {
    const { entregador } = resend(
      ({ opcoes }) =>
        new Promise<Response>((_, rejeitar) => {
          opcoes.signal?.addEventListener("abort", () => rejeitar(new Error("aborted")));
        }),
      { timeoutMs: 20 },
    );
    const erro = await falha(enviar(entregador));
    assert.equal(erro.motivo, "tempo_esgotado");
    semDadosSensiveis(erro);
  });

  it("e-mail vazio, inválido ou fora da forma canônica não gera chamada nenhuma", async () => {
    for (const email of ["", "   ", "sem-arroba", "a@b", "Ana.Teste@Exemplo.com", " ana@exemplo.com", "x@email-tecnico.jaa.invalid"]) {
      const { entregador, chamadas } = resend(aceito);
      const erro = await falha(enviar(entregador, email));
      assert.equal(erro.motivo, "email_invalido");
      assert.equal(chamadas.length, 0);
    }
  });
});

describe("regra de e-mail do Jaa", () => {
  it("normaliza (pontas e maiúsculas) e recusa vazio, inválido, longo demais e o domínio técnico", () => {
    assert.equal(normalizarEmail("  Ana.Teste@Exemplo.COM "), "ana.teste@exemplo.com");
    for (const invalido of ["", "  ", "ana", "ana@", "@exemplo.com", "ana@exemplo", "a b@exemplo.com", `${"a".repeat(250)}@exemplo.com`, "abc@email-tecnico.jaa.invalid"]) {
      assert.equal(normalizarEmail(invalido), null, invalido);
    }
    assert.equal(ehEmailTecnico("ABC@Email-Tecnico.Jaa.Invalid"), true);
    assert.equal(ehEmailTecnico(EMAIL), false);
  });

  it("mascara o e-mail para exibição em terminal", () => {
    assert.equal(mascararEmail(EMAIL), "a•••@exemplo.com");
    assert.equal(mascararEmail("sem-arroba"), "•••");
  });
});

describe("seleção do entregador de OTP por e-mail pelo ambiente", () => {
  const base = {
    NODE_ENV: "development",
    DATABASE_URL: "postgres://localhost/jaa",
    BETTER_AUTH_SECRET: "x".repeat(32),
    BETTER_AUTH_URL: "http://localhost:3333",
    ORIGENS_WEB_PERMITIDAS: "http://localhost:3000",
    OTP_ENTREGA: "desenvolvimento",
  };

  it("sem configuração (ou 'desativado'), o código por e-mail fica desligado e nada muda no SMS", () => {
    for (const extra of [{}, { OTP_EMAIL_ENTREGA: "desativado" }, { OTP_EMAIL_ENTREGA: "" }, { RESEND_API_KEY: CHAVE, RESEND_REMETENTE: REMETENTE }]) {
      const ambiente = carregarAmbiente({ ...base, ...extra });
      assert.equal(criarEntregadorOtpEmail(ambiente), null);
      assert.doesNotThrow(() => criarEntregadorOtp(ambiente));
    }
  });

  it("resend é aceito em desenvolvimento e em produção quando está completo, junto com a Comtele", () => {
    for (const NODE_ENV of ["development", "production"]) {
      const ambiente = carregarAmbiente({ ...base, NODE_ENV, OTP_ENTREGA: "comtele", COMTELE_API_KEY: "chave-comtele", COMTELE_ROTA: "17", OTP_EMAIL_ENTREGA: "resend", RESEND_API_KEY: CHAVE, RESEND_REMETENTE: REMETENTE });
      assert.deepEqual([ambiente.OTP_ENTREGA, ambiente.OTP_EMAIL_ENTREGA, ambiente.RESEND_REMETENTE], ["comtele", "resend", REMETENTE]);
      assert.ok(criarEntregadorOtpEmail(ambiente));
      assert.doesNotThrow(() => criarEntregadorOtp(ambiente));
    }
  });

  it("resend sem chave ou sem remetente impede a API de subir, sem expor valores", () => {
    assert.throws(() => carregarAmbiente({ ...base, OTP_EMAIL_ENTREGA: "resend" }), /RESEND_API_KEY[\s\S]*RESEND_REMETENTE/);
    assert.throws(() => carregarAmbiente({ ...base, OTP_EMAIL_ENTREGA: "resend", RESEND_REMETENTE: REMETENTE }), /RESEND_API_KEY/);
    assert.throws(
      () => carregarAmbiente({ ...base, NODE_ENV: "production", OTP_ENTREGA: "comtele", COMTELE_API_KEY: "c", COMTELE_ROTA: "17", OTP_EMAIL_ENTREGA: "resend", RESEND_API_KEY: CHAVE }),
      (erro: Error) => /RESEND_REMETENTE/.test(erro.message) && !erro.message.includes(CHAVE),
    );
  });

  it("o remetente precisa ter cara de remetente: `Nome <endereco@dominio>` ou só o endereço", () => {
    const com = (RESEND_REMETENTE: string) => carregarAmbiente({ ...base, OTP_EMAIL_ENTREGA: "resend", RESEND_API_KEY: CHAVE, RESEND_REMETENTE });
    assert.equal(com("codigo@exemplo.com.br").RESEND_REMETENTE, "codigo@exemplo.com.br");
    assert.equal(com("Jaaa <codigo@exemplo.com.br>").RESEND_REMETENTE, REMETENTE);
    for (const invalido of ["Jaaa", "codigo@", "Jaaa <codigo>", "<codigo@exemplo.com.br", "a@b.c d@e.f"]) assert.throws(() => com(invalido), /RESEND_REMETENTE/, invalido);
  });

  it("o entregador de desenvolvimento por e-mail nunca existe em produção", () => {
    assert.ok(criarEntregadorOtpEmail(carregarAmbiente({ ...base, OTP_EMAIL_ENTREGA: "desenvolvimento" })));
    assert.throws(() => carregarAmbiente({ ...base, NODE_ENV: "production", OTP_ENTREGA: "comtele", COMTELE_API_KEY: "c", COMTELE_ROTA: "17", OTP_EMAIL_ENTREGA: "desenvolvimento" }), /OTP_EMAIL_ENTREGA=desenvolvimento é proibido/);
    assert.throws(() => criarEntregadorOtpEmailDesenvolvimento("production"), /não pode ser usado em produção/);
  });

  it("segunda barreira: a fábrica recusa o Resend incompleto mesmo sem passar pela validação", () => {
    const ambiente = carregarAmbiente(base);
    assert.throws(() => criarEntregadorOtpEmail({ ...ambiente, OTP_EMAIL_ENTREGA: "resend" }), /RESEND_API_KEY e RESEND_REMETENTE/);
  });
});
