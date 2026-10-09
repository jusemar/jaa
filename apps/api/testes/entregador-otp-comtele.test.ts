import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ErroEntregaOtp, TAMANHO_MAXIMO_SMS, criarEntregadorOtpComtele, mensagemSmsOtp } from "../src/features/autenticacao/entrega-otp/entregador-otp-comtele.js";
import { criarEntregadorOtp } from "../src/features/autenticacao/entrega-otp/entregador-otp.js";
import { carregarAmbiente } from "../src/lib/ambiente.js";

/*
 * NENHUM SMS REAL: a Comtele é sempre substituída por uma função `buscar` falsa, e a fábrica por
 * ambiente (`criarEntregadorOtp`) só é CRIADA aqui, nunca usada para enviar.
 */

const CHAVE = "00000000-aaaa-bbbb-cccc-000000000000";
const TELEFONE = "+5531987650001";
const CODIGO = "482913";

interface Chamada {
  url: string;
  opcoes: RequestInit;
}

function comtele(responder: (chamada: Chamada) => Response | Promise<Response>, extras: { timeoutMs?: number } = {}) {
  const chamadas: Chamada[] = [];
  const entregador = criarEntregadorOtpComtele({
    chaveApi: CHAVE,
    rota: 17,
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
const aceito = () => json({ hasError: false, message: null, object: null, totalRecords: 1, errors: null });

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
  for (const proibido of [CHAVE, CODIGO, "5531987650001", "31987650001"]) assert.ok(!texto.includes(proibido), `o erro expõe "${proibido}"`);
}

describe("entregador de OTP da Comtele", () => {
  it("envia o código do Better Auth, sem alterá-lo, no contrato da API da Comtele", async () => {
    const { entregador, chamadas } = comtele(aceito);
    await entregador.enviar({ telefone: TELEFONE, codigo: CODIGO });

    assert.equal(chamadas.length, 1);
    const [chamada] = chamadas as [Chamada];
    assert.equal(chamada.url, "https://api.comtele.com.br/messages/sms/send");
    assert.equal(chamada.opcoes.method, "POST");
    assert.deepEqual(chamada.opcoes.headers, { "x-api-key": CHAVE, "content-type": "application/json" });
    assert.deepEqual(JSON.parse(String(chamada.opcoes.body)), {
      // 55 + DDD + número, sem "+".
      receivers: ["5531987650001"],
      contactGroups: [],
      message: `Jaaa: seu codigo de verificacao e ${CODIGO}. Nao compartilhe com ninguem.`,
      route: 17,
      tag: "jaaa-otp",
      custom: "jaaa-otp",
      scheduleDate: null,
    });
    assert.ok(!chamada.url.includes(CHAVE), "a chave nunca vai na URL");
  });

  it("a mensagem cabe em um único SMS e não usa caracteres fora do alfabeto básico", () => {
    const mensagem = mensagemSmsOtp("123456");
    assert.ok(mensagem.length <= TAMANHO_MAXIMO_SMS);
    assert.match(mensagem, /^[\x20-\x7e]+$/);
    assert.ok(mensagem.includes("Jaaa") && mensagem.includes("123456"));
  });

  it("erro HTTP da Comtele é falha de entrega, com o status e sem dados sensíveis", async () => {
    const { entregador } = comtele(() => json({ hasError: true, message: `Chave ${CHAVE} inválida para 5531987650001`, errors: null }, 401));
    const erro = await falha(entregador.enviar({ telefone: TELEFONE, codigo: CODIGO }));
    assert.equal(erro.motivo, "http");
    assert.equal(erro.status, 401);
    assert.match(erro.message, /Comtele respondeu 401/);
    semDadosSensiveis(erro);
  });

  it("200 com hasError=true é envio RECUSADO, e o detalhe do provedor é limpo antes de virar erro", async () => {
    const { entregador } = comtele(() => json({ hasError: true, message: "Saldo insuficiente", errors: [`Mensagem: codigo ${CODIGO} para 31987650001`] }));
    const erro = await falha(entregador.enviar({ telefone: TELEFONE, codigo: CODIGO }));
    assert.equal(erro.motivo, "recusado");
    assert.match(erro.message, /Saldo insuficiente/);
    semDadosSensiveis(erro);
  });

  it("200 sem a confirmação explícita (corpo vazio, HTML, JSON estranho) não conta como entregue", async () => {
    for (const resposta of [() => new Response("", { status: 200 }), () => new Response("<html>ok</html>", { status: 200 }), () => json({ ok: true }), () => json({ hasError: "false" })]) {
      const { entregador } = comtele(resposta);
      const erro = await falha(entregador.enviar({ telefone: TELEFONE, codigo: CODIGO }));
      assert.equal(erro.motivo, "resposta_invalida");
    }
  });

  it("falha de rede é erro seguro (o erro original, com a requisição, não é repassado)", async () => {
    const { entregador } = comtele(() => {
      throw new Error(`connect ECONNREFUSED x-api-key=${CHAVE} body=${CODIGO}`);
    });
    const erro = await falha(entregador.enviar({ telefone: TELEFONE, codigo: CODIGO }));
    assert.equal(erro.motivo, "rede");
    assert.equal(erro.cause, undefined);
    semDadosSensiveis(erro);
  });

  it("tem timeout explícito: sem resposta, a chamada é abortada e vira falha", async () => {
    const { entregador } = comtele(
      ({ opcoes }) =>
        new Promise<Response>((_, rejeitar) => {
          opcoes.signal?.addEventListener("abort", () => rejeitar(new Error("aborted")));
        }),
      { timeoutMs: 20 },
    );
    const erro = await falha(entregador.enviar({ telefone: TELEFONE, codigo: CODIGO }));
    assert.equal(erro.motivo, "tempo_esgotado");
    semDadosSensiveis(erro);
  });

  it("telefone fora do E.164 de celular brasileiro não gera chamada nenhuma", async () => {
    for (const telefone of ["31987650001", "+5531333300001", "+14155550100", ""]) {
      const { entregador, chamadas } = comtele(aceito);
      const erro = await falha(entregador.enviar({ telefone, codigo: CODIGO }));
      assert.equal(erro.motivo, "telefone_invalido");
      assert.equal(chamadas.length, 0);
    }
  });
});

describe("seleção do entregador de OTP pelo ambiente", () => {
  const base = {
    NODE_ENV: "development",
    DATABASE_URL: "postgres://localhost/jaa",
    BETTER_AUTH_SECRET: "x".repeat(32),
    BETTER_AUTH_URL: "http://localhost:3333",
    ORIGENS_WEB_PERMITIDAS: "http://localhost:3000",
  };

  it("desenvolvimento continua valendo localmente, mesmo com a chave da Comtele presente", () => {
    const ambiente = carregarAmbiente({ ...base, OTP_ENTREGA: "desenvolvimento", COMTELE_API_KEY: CHAVE });
    assert.equal(ambiente.OTP_ENTREGA, "desenvolvimento");
    assert.doesNotThrow(() => criarEntregadorOtp(ambiente));
  });

  it("comtele é aceita em desenvolvimento e em produção quando está completa", () => {
    for (const NODE_ENV of ["development", "production"]) {
      const ambiente = carregarAmbiente({ ...base, NODE_ENV, OTP_ENTREGA: "comtele", COMTELE_API_KEY: CHAVE, COMTELE_ROTA: "17" });
      assert.deepEqual([ambiente.OTP_ENTREGA, ambiente.COMTELE_ROTA], ["comtele", 17]);
      assert.doesNotThrow(() => criarEntregadorOtp(ambiente));
    }
  });

  it("comtele sem chave ou sem rota impede a API de subir, sem expor valores", () => {
    assert.throws(() => carregarAmbiente({ ...base, OTP_ENTREGA: "comtele" }), /COMTELE_API_KEY[\s\S]*COMTELE_ROTA/);
    assert.throws(() => carregarAmbiente({ ...base, OTP_ENTREGA: "comtele", COMTELE_ROTA: "17", COMTELE_API_KEY: "" }), /COMTELE_API_KEY/);
    assert.throws(
      () => carregarAmbiente({ ...base, NODE_ENV: "production", OTP_ENTREGA: "comtele", COMTELE_API_KEY: CHAVE }),
      (erro: Error) => /COMTELE_ROTA/.test(erro.message) && !erro.message.includes(CHAVE),
    );
    assert.throws(() => carregarAmbiente({ ...base, OTP_ENTREGA: "comtele", COMTELE_API_KEY: CHAVE, COMTELE_ROTA: "premium" }), /COMTELE_ROTA/);
  });

  it("produção continua recusando o entregador de desenvolvimento, com ou sem Comtele configurada", () => {
    const producao = { ...base, NODE_ENV: "production", OTP_ENTREGA: "desenvolvimento" };
    assert.throws(() => carregarAmbiente(producao), /OTP_ENTREGA=desenvolvimento é proibido/);
    assert.throws(() => carregarAmbiente({ ...producao, COMTELE_API_KEY: CHAVE, COMTELE_ROTA: "17" }), /OTP_ENTREGA=desenvolvimento é proibido/);
  });

  it("segunda barreira: a fábrica recusa a Comtele incompleta mesmo sem passar pela validação", () => {
    const ambiente = carregarAmbiente({ ...base, OTP_ENTREGA: "desenvolvimento" });
    assert.throws(() => criarEntregadorOtp({ ...ambiente, OTP_ENTREGA: "comtele" }), /COMTELE_API_KEY e COMTELE_ROTA/);
  });
});
