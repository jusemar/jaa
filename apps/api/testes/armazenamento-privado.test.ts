import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { carregarAmbiente, situacaoArmazenamentoPrivado, situacaoArmazenamentoPublico } from "../src/lib/ambiente.js";
import {
  ArmazenamentoNaoConfiguradoErro,
  VALIDADE_PADRAO_URL_ASSINADA_SEGUNDOS,
} from "../src/lib/armazenamento/armazenamento-arquivos.js";
import { criarArmazenamentoR2Privado } from "../src/lib/armazenamento/armazenamento-r2.js";
import { assinarRequisicaoS3, assinarUrlS3 } from "../src/lib/armazenamento/assinatura-s3.js";
import { criarArmazenamento, criarArmazenamentoPrivado } from "../src/lib/armazenamento/criar-armazenamento.js";

/*
 * BUCKET PRIVADO e URL ASSINADA DE LEITURA — sem rede e sem credencial real.
 *
 * A URL assinada é conferida contra o VETOR OFICIAL publicado pela AWS para "presigned URL" (S3,
 * GET examplebucket/test.txt em 24/05/2013). As chaves abaixo são as do documento público e não
 * abrem nada. As do Jaa nos demais testes são inventadas e óbvias.
 */

const VETOR_PRESIGNED = {
  url: "https://examplebucket.s3.amazonaws.com/test.txt",
  accessKeyId: "AKIAIOSFODNN7EXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  agora: new Date("2013-05-24T00:00:00Z"),
  esperada:
    "https://examplebucket.s3.amazonaws.com/test.txt?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404",
};

const SEGREDO_FALSO = "segredo-privado-de-teste-que-nunca-pode-aparecer";
const AGORA = new Date("2026-10-03T12:00:00Z");

function privadoDeTeste(configuracao: { endpoint?: string; buscar?: typeof fetch } = {}) {
  return criarArmazenamentoR2Privado({
    contaId: "conta-teste",
    bucket: "jaa-privado",
    accessKeyId: "id-privado-teste",
    secretAccessKey: SEGREDO_FALSO,
    ...configuracao,
  });
}

const parametros = (url: string) => new URL(url).searchParams;

describe("URL assinada (SigV4 pela query string)", () => {
  it("reproduz byte a byte o vetor oficial da AWS para presigned GET", () => {
    const url = assinarUrlS3({
      url: new URL(VETOR_PRESIGNED.url),
      regiao: "us-east-1",
      accessKeyId: VETOR_PRESIGNED.accessKeyId,
      secretAccessKey: VETOR_PRESIGNED.secretAccessKey,
      validadeSegundos: 86400,
      agora: VETOR_PRESIGNED.agora,
    });
    assert.equal(url, VETOR_PRESIGNED.esperada);
  });

  it("traz todos os parâmetros exigidos, só `host` assinado, e nunca o segredo", () => {
    const url = privadoDeTeste().urlAssinadaLeitura("conversas/c1/a.webp", { agora: AGORA });
    const consulta = parametros(url);
    assert.equal(consulta.get("X-Amz-Algorithm"), "AWS4-HMAC-SHA256");
    assert.equal(consulta.get("X-Amz-Credential"), "id-privado-teste/20261003/auto/s3/aws4_request");
    assert.equal(consulta.get("X-Amz-Date"), "20261003T120000Z");
    assert.equal(consulta.get("X-Amz-Expires"), String(VALIDADE_PADRAO_URL_ASSINADA_SEGUNDOS));
    assert.equal(consulta.get("X-Amz-SignedHeaders"), "host");
    assert.match(consulta.get("X-Amz-Signature") ?? "", /^[0-9a-f]{64}$/);
    assert.ok(!url.includes(SEGREDO_FALSO), "o segredo nunca entra na URL");
    assert.ok(!url.includes(encodeURIComponent(SEGREDO_FALSO)));
  });

  it("horário controlado: mesma entrada → mesma URL; outro horário ou validade → outra assinatura", () => {
    const privado = privadoDeTeste();
    const a = privado.urlAssinadaLeitura("conversas/c1/a.webp", { agora: AGORA });
    assert.equal(privado.urlAssinadaLeitura("conversas/c1/a.webp", { agora: AGORA }), a);
    assert.notEqual(privado.urlAssinadaLeitura("conversas/c1/a.webp", { agora: new Date(AGORA.getTime() + 1000) }), a);
    assert.notEqual(privado.urlAssinadaLeitura("conversas/c1/a.webp", { agora: AGORA, validadeSegundos: 600 }), a);
    assert.notEqual(privado.urlAssinadaLeitura("conversas/c1/b.webp", { agora: AGORA }), a);
  });

  it("chave simples e com diretórios: caminho = /<bucket>/<chave>, barras preservadas", () => {
    const privado = privadoDeTeste();
    assert.equal(new URL(privado.urlAssinadaLeitura("arquivo.webp", { agora: AGORA })).pathname, "/jaa-privado/arquivo.webp");
    assert.equal(new URL(privado.urlAssinadaLeitura("conversas/c1/m2/a.webp", { agora: AGORA })).pathname, "/jaa-privado/conversas/c1/m2/a.webp");
  });

  it("caracteres especiais são codificados UMA vez (sem %2520) e a assinatura independe de como a URL foi escrita", () => {
    const url = privadoDeTeste().urlAssinadaLeitura("conversas/c1/foto de João (1)+x.webp", { agora: AGORA });
    const caminho = url.slice(url.indexOf("/jaa-privado/"), url.indexOf("?"));
    assert.equal(caminho, "/jaa-privado/conversas/c1/foto%20de%20Jo%C3%A3o%20%281%29%2Bx.webp");
    assert.ok(!url.includes("%25"), "nada codificado duas vezes");

    // O mesmo objeto, com a URL montada crua ou já codificada, gera a MESMA assinatura.
    const base = { regiao: "auto", accessKeyId: "id", secretAccessKey: SEGREDO_FALSO, validadeSegundos: 300, agora: AGORA };
    const crua = assinarUrlS3({ ...base, url: new URL("https://h.example/b/foto de João.webp") });
    const codificada = assinarUrlS3({ ...base, url: new URL("https://h.example/b/foto%20de%20Jo%C3%A3o.webp") });
    assert.equal(crua, codificada);
  });

  it("a mesma canonicalização vale para a assinatura por cabeçalho (PUT/DELETE)", () => {
    const base = { metodo: "PUT" as const, regiao: "auto", accessKeyId: "id", secretAccessKey: SEGREDO_FALSO, corpo: Buffer.from("x"), agora: AGORA };
    const crua = assinarRequisicaoS3({ ...base, url: new URL("https://h.example/b/foto de João.webp") });
    const codificada = assinarRequisicaoS3({ ...base, url: new URL("https://h.example/b/foto%20de%20Jo%C3%A3o.webp") });
    assert.equal(crua.cabecalhos.authorization, codificada.cabecalhos.authorization);
  });

  it("endpoint derivado da conta e endpoint customizado", () => {
    assert.equal(new URL(privadoDeTeste().urlAssinadaLeitura("a.webp", { agora: AGORA })).host, "conta-teste.r2.cloudflarestorage.com");
    const customizado = privadoDeTeste({ endpoint: "https://r2.homologacao.example:8443/" }).urlAssinadaLeitura("a.webp", { agora: AGORA });
    assert.equal(new URL(customizado).host, "r2.homologacao.example:8443");
    assert.equal(new URL(customizado).pathname, "/jaa-privado/a.webp");
  });

  it("validade: padrão de 20 min; o Jaa limita entre 1 min e 1 h; o SigV4 entre 1 s e 7 dias", () => {
    const privado = privadoDeTeste();
    assert.equal(VALIDADE_PADRAO_URL_ASSINADA_SEGUNDOS, 1200);
    assert.equal(parametros(privado.urlAssinadaLeitura("a.webp", { agora: AGORA, validadeSegundos: 60 })).get("X-Amz-Expires"), "60");
    assert.equal(parametros(privado.urlAssinadaLeitura("a.webp", { agora: AGORA, validadeSegundos: 3600 })).get("X-Amz-Expires"), "3600");
    for (const invalida of [59, 3601, 0, 1.5, Number.NaN]) {
      assert.throws(() => privado.urlAssinadaLeitura("a.webp", { agora: AGORA, validadeSegundos: invalida }), RangeError);
    }
    const base = { url: new URL("https://h.example/b/a"), regiao: "auto", accessKeyId: "id", secretAccessKey: SEGREDO_FALSO, agora: AGORA };
    assert.throws(() => assinarUrlS3({ ...base, validadeSegundos: 0 }), RangeError);
    assert.throws(() => assinarUrlS3({ ...base, validadeSegundos: 7 * 24 * 3600 + 1 }), RangeError);
  });

  it("credencial errada gera outra assinatura, e nenhuma das duas expõe o segredo", () => {
    const base = { url: new URL("https://h.example/b/a.webp"), regiao: "auto", accessKeyId: "id", validadeSegundos: 300, agora: AGORA };
    const certa = assinarUrlS3({ ...base, secretAccessKey: SEGREDO_FALSO });
    const errada = assinarUrlS3({ ...base, secretAccessKey: "outro-segredo-falso" });
    assert.notEqual(parametros(certa).get("X-Amz-Signature"), parametros(errada).get("X-Amz-Signature"));
    assert.ok(!errada.includes("outro-segredo-falso") && !certa.includes(SEGREDO_FALSO));
  });
});

describe("armazenamento privado (R2)", () => {
  it("não tem endereço público: só URL assinada", () => {
    const privado = privadoDeTeste();
    assert.equal("urlPublica" in privado, false);
    assert.equal(typeof privado.urlAssinadaLeitura, "function");
  });

  it("grava e remove no bucket PRIVADO, com o token privado e sem expor o segredo", async () => {
    const chamadas: { metodo: string; url: string; cabecalhos: Record<string, string> }[] = [];
    const buscar = (async (url: string, init: RequestInit) => {
      chamadas.push({ metodo: String(init.method), url, cabecalhos: init.headers as Record<string, string> });
      return new Response(null, { status: init.method === "DELETE" ? 404 : 200 });
    }) as typeof fetch;
    const privado = privadoDeTeste({ buscar });

    assert.deepEqual(await privado.salvar({ chave: "conversas/c1/a.webp", conteudo: Buffer.from("bytes"), tipoConteudo: "image/webp" }), { chave: "conversas/c1/a.webp" });
    await privado.remover("conversas/c1/a.webp"); // 404 no DELETE = já não existe: idempotente

    assert.deepEqual(chamadas.map((chamada) => [chamada.metodo, chamada.url]), [
      ["PUT", "https://conta-teste.r2.cloudflarestorage.com/jaa-privado/conversas/c1/a.webp"],
      ["DELETE", "https://conta-teste.r2.cloudflarestorage.com/jaa-privado/conversas/c1/a.webp"],
    ]);
    assert.match(chamadas[0]?.cabecalhos.authorization ?? "", /Credential=id-privado-teste\//);
    assert.ok(!JSON.stringify(chamadas).includes(SEGREDO_FALSO));
  });
});

/*
 * CONFIGURAÇÃO: público e privado são avaliados SEPARADAMENTE. R2_CONTA_ID (e R2_ENDPOINT) são
 * compartilhados e, sozinhos, não começam a configuração de nenhum dos dois.
 */
const BASE_AMBIENTE = {
  NODE_ENV: "development",
  DATABASE_URL: "postgres://teste",
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3333",
  ORIGENS_WEB_PERMITIDAS: "http://localhost:3334",
  OTP_ENTREGA: "desenvolvimento",
};
const PUBLICO = {
  R2_BUCKET: "jaa-publico",
  R2_ACCESS_KEY_ID: "id-publico-teste",
  R2_SECRET_ACCESS_KEY: "segredo-publico-teste",
  R2_URL_PUBLICA: "https://pub-exemplo.r2.dev",
};
const PRIVADO = {
  R2_BUCKET_PRIVADO: "jaa-privado",
  R2_ACCESS_KEY_ID_PRIVADO: "id-privado-teste",
  R2_SECRET_ACCESS_KEY_PRIVADO: SEGREDO_FALSO,
};
const CONTA = { R2_CONTA_ID: "conta-teste" };

const ambiente = (variaveis: Record<string, string>) => carregarAmbiente({ ...BASE_AMBIENTE, ...variaveis });

/** Em produção: devolve as mensagens de erro de armazenamento (vazio = aceito). */
function errosEmProducao(variaveis: Record<string, string>): string[] {
  try {
    // O OTP de desenvolvimento também é recusado em produção, na MESMA validação: o filtro abaixo
    // olha só as linhas de armazenamento.
    carregarAmbiente({ ...BASE_AMBIENTE, NODE_ENV: "production", ...variaveis });
    return [];
  } catch (erro) {
    return String(erro).split("\n").filter((linha) => linha.includes("Armazenamento"));
  }
}

describe("configuração público × privado", () => {
  it("público completo + privado completo: os dois disponíveis, cada um no SEU bucket", () => {
    const amb = ambiente({ ...CONTA, ...PUBLICO, ...PRIVADO });
    assert.deepEqual([situacaoArmazenamentoPublico(amb), situacaoArmazenamentoPrivado(amb)], ["completo", "completo"]);
    assert.equal(criarArmazenamento(amb).nome, "cloudflare-r2");
    const privado = criarArmazenamentoPrivado(amb);
    assert.equal(privado.nome, "cloudflare-r2");
    assert.equal(new URL(privado.urlAssinadaLeitura("a.webp", { agora: AGORA })).pathname, "/jaa-privado/a.webp");
    assert.equal(parametros(privado.urlAssinadaLeitura("a.webp", { agora: AGORA })).get("X-Amz-Credential")?.split("/")[0], "id-privado-teste");
    assert.equal(criarArmazenamento(amb).urlPublica("a.webp"), "https://pub-exemplo.r2.dev/a.webp", "público intacto");
  });

  it("público completo + privado ausente: público funciona, privado indisponível (sem erro)", async () => {
    const amb = ambiente({ ...CONTA, ...PUBLICO });
    assert.deepEqual([situacaoArmazenamentoPublico(amb), situacaoArmazenamentoPrivado(amb)], ["completo", "ausente"]);
    assert.equal(criarArmazenamento(amb).nome, "cloudflare-r2");
    const privado = criarArmazenamentoPrivado(amb);
    assert.equal(privado.nome, "indisponivel");
    assert.throws(() => privado.urlAssinadaLeitura("a.webp"), ArmazenamentoNaoConfiguradoErro);
    await assert.rejects(() => privado.salvar({ chave: "a", conteudo: Buffer.alloc(1), tipoConteudo: "image/webp" }), ArmazenamentoNaoConfiguradoErro);
    assert.deepEqual(errosEmProducao({ ...CONTA, ...PUBLICO }), []);
  });

  it("público ausente + privado completo: privado funciona; R2_CONTA_ID NÃO torna o público 'parcial'", () => {
    const amb = ambiente({ ...CONTA, ...PRIVADO });
    assert.deepEqual([situacaoArmazenamentoPublico(amb), situacaoArmazenamentoPrivado(amb)], ["ausente", "completo"]);
    assert.equal(criarArmazenamento(amb).nome, "indisponivel");
    assert.equal(criarArmazenamentoPrivado(amb).nome, "cloudflare-r2");
    assert.deepEqual(errosEmProducao({ ...CONTA, ...PRIVADO }), [], "a API sobe em produção só com o privado");
  });

  it("nada configurado (ou só a conta): os dois indisponíveis, sem erro", () => {
    for (const variaveis of [{}, CONTA]) {
      const amb = ambiente(variaveis);
      assert.deepEqual([situacaoArmazenamentoPublico(amb), situacaoArmazenamentoPrivado(amb)], ["ausente", "ausente"]);
      assert.equal(criarArmazenamento(amb).nome, "indisponivel");
      assert.equal(criarArmazenamentoPrivado(amb).nome, "indisponivel");
      assert.deepEqual(errosEmProducao(variaveis), []);
    }
  });

  it("privado parcial (ex.: só o bucket, como no .env antes dos segredos): indisponível; erro só em produção", () => {
    for (const variaveis of [{ R2_BUCKET_PRIVADO: "jaa-privado" }, { ...PRIVADO, R2_BUCKET_PRIVADO: "" }, { ...PRIVADO, R2_SECRET_ACCESS_KEY_PRIVADO: "" }]) {
      const amb = ambiente({ ...CONTA, ...PUBLICO, ...variaveis });
      assert.equal(situacaoArmazenamentoPrivado(amb), "parcial");
      assert.equal(criarArmazenamentoPrivado(amb).nome, "indisponivel");
      assert.equal(criarArmazenamento(amb).nome, "cloudflare-r2", "o privado incompleto não derruba o público");
      const erros = errosEmProducao({ ...CONTA, ...PUBLICO, ...variaveis });
      assert.equal(erros.length, 1);
      assert.match(erros[0] ?? "", /Armazenamento privado incompleto/);
    }
  });

  it("privado sem R2_CONTA_ID também é parcial (a conta é compartilhada, mas obrigatória)", () => {
    assert.equal(situacaoArmazenamentoPrivado(ambiente({ ...PRIVADO })), "parcial");
  });

  it("público parcial: erro só do público em produção; o privado completo continua aceito", () => {
    const variaveis = { ...CONTA, ...PRIVADO, R2_BUCKET: "jaa-publico" };
    assert.equal(situacaoArmazenamentoPublico(ambiente(variaveis)), "parcial");
    assert.equal(situacaoArmazenamentoPrivado(ambiente(variaveis)), "completo");
    const erros = errosEmProducao(variaveis);
    assert.equal(erros.length, 1);
    assert.match(erros[0] ?? "", /Armazenamento público incompleto/);
  });

  it("mensagens de erro listam NOMES de variáveis, nunca valores", () => {
    const erros = errosEmProducao({ ...CONTA, R2_BUCKET_PRIVADO: "jaa-privado", R2_ACCESS_KEY_ID_PRIVADO: "id-privado-teste" }).join("\n");
    assert.match(erros, /R2_SECRET_ACCESS_KEY_PRIVADO/);
    for (const valor of ["conta-teste", "jaa-privado", "id-privado-teste"]) assert.ok(!erros.includes(`=${valor}`) && !erros.includes(`: ${valor}`), valor);
  });

  it("linha vazia no .env vale como ausente para as variáveis privadas", () => {
    const amb = ambiente({ ...CONTA, ...PUBLICO, R2_BUCKET_PRIVADO: "", R2_ACCESS_KEY_ID_PRIVADO: "", R2_SECRET_ACCESS_KEY_PRIVADO: "" });
    assert.equal(situacaoArmazenamentoPrivado(amb), "ausente");
  });
});
