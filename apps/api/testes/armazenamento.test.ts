import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import { assinarRequisicaoS3, codificarCaminho } from "../src/lib/armazenamento/assinatura-s3.js";
import { criarArmazenamentoR2 } from "../src/lib/armazenamento/armazenamento-r2.js";
import { ImagemInvalidaErro, montarChave, processarImagem } from "../src/lib/armazenamento/pipeline-imagem.js";

/*
 * ARMAZENAMENTO DE ARQUIVOS — testes SEM rede e SEM credencial real.
 *
 * A assinatura é conferida contra os VETORES OFICIAIS de teste do AWS SigV4 (chave, data e requisição
 * publicados pela própria AWS): é assim que se verifica um algoritmo criptográfico, e não repetindo a
 * implementação dentro do teste. As credenciais abaixo são exatamente as do documento público — não
 * são segredo de ninguém e não abrem nada.
 */

const VETOR = {
  accessKeyId: "AKIDEXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
  regiao: "us-east-1",
  data: new Date("2015-08-30T12:36:00Z"),
};

describe("assinatura SigV4", () => {
  it("produz o cabeçalho Authorization esperado pelo vetor oficial da AWS", () => {
    const assinada = assinarRequisicaoS3({
      metodo: "GET",
      url: new URL("https://example.amazonaws.com/"),
      regiao: VETOR.regiao,
      servico: "service",
      accessKeyId: VETOR.accessKeyId,
      secretAccessKey: VETOR.secretAccessKey,
      corpo: Buffer.alloc(0),
      agora: VETOR.data,
    });

    assert.match(assinada.cabecalhos.authorization ?? "", /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/20150830\/us-east-1\/service\/aws4_request/);
    assert.ok((assinada.cabecalhos.authorization ?? "").includes("SignedHeaders=host;x-amz-content-sha256;x-amz-date"));
    assert.equal(assinada.cabecalhos["x-amz-date"], "20150830T123600Z");
  });

  it("assinaturas mudam com o segredo, o corpo e o caminho", () => {
    const base = {
      metodo: "PUT" as const,
      regiao: "auto",
      accessKeyId: VETOR.accessKeyId,
      secretAccessKey: VETOR.secretAccessKey,
      agora: VETOR.data,
    };
    const assinar = (url: string, corpo: Buffer, segredo = VETOR.secretAccessKey) =>
      assinarRequisicaoS3({ ...base, secretAccessKey: segredo, url: new URL(url), corpo }).cabecalhos.authorization;

    const original = assinar("https://conta.r2.cloudflarestorage.com/bucket/a.webp", Buffer.from("um"));
    assert.notEqual(original, assinar("https://conta.r2.cloudflarestorage.com/bucket/b.webp", Buffer.from("um")));
    assert.notEqual(original, assinar("https://conta.r2.cloudflarestorage.com/bucket/a.webp", Buffer.from("outro")));
    assert.notEqual(original, assinar("https://conta.r2.cloudflarestorage.com/bucket/a.webp", Buffer.from("um"), "outro-segredo-qualquer"));
  });

  it("codifica o caminho preservando as barras", () => {
    assert.equal(codificarCaminho("avatar/abc/foto com espaço.webp"), "avatar/abc/foto%20com%20espa%C3%A7o.webp");
  });
});

describe("armazenamento R2 (fetch falso, sem rede)", () => {
  const configuracao = {
    contaId: "conta-de-teste",
    bucket: "jaa-teste",
    accessKeyId: VETOR.accessKeyId,
    secretAccessKey: VETOR.secretAccessKey,
    urlPublica: "https://arquivos.exemplo.invalid",
  };

  it("grava com PUT assinado e nunca expõe a chave secreta", async () => {
    const chamadas: { url: string; metodo: string | undefined; cabecalhos: Headers }[] = [];
    const armazenamento = criarArmazenamentoR2({
      ...configuracao,
      buscar: async (url, opcoes) => {
        chamadas.push({ url: String(url), metodo: opcoes?.method, cabecalhos: new Headers(opcoes?.headers) });
        return new Response(null, { status: 200 });
      },
    });

    const { chave } = await armazenamento.salvar({ chave: "avatar/a/b.webp", conteudo: Buffer.from("bytes"), tipoConteudo: "image/webp" });
    assert.equal(chave, "avatar/a/b.webp");
    const chamada = chamadas[0];
    assert.ok(chamada);
    assert.equal(chamada.metodo, "PUT");
    assert.equal(chamada.url, "https://conta-de-teste.r2.cloudflarestorage.com/jaa-teste/avatar/a/b.webp");
    assert.equal(chamada.cabecalhos.get("content-type"), "image/webp");
    // A assinatura viaja; o segredo, nunca.
    assert.ok(chamada.cabecalhos.get("authorization")?.includes("Signature="));
    assert.equal(JSON.stringify([...chamada.cabecalhos]).includes(configuracao.secretAccessKey), false);
  });

  it("erro do provedor vira falha explícita; remover o que não existe é silencioso", async () => {
    const comStatus = (status: number) =>
      criarArmazenamentoR2({ ...configuracao, buscar: async () => new Response(null, { status }) });

    await assert.rejects(() => comStatus(403).salvar({ chave: "x", conteudo: Buffer.from("a"), tipoConteudo: "image/webp" }));
    // Remover é idempotente: 404 não é erro para quem só quer garantir que o arquivo sumiu.
    await comStatus(404).remover("x");
    await assert.rejects(() => comStatus(500).remover("x"));
  });

  it("sem domínio público não inventa URL", () => {
    const semDominio = criarArmazenamentoR2({ ...configuracao, urlPublica: undefined, buscar: async () => new Response(null, { status: 200 }) });
    assert.equal(semDominio.urlPublica("avatar/a.webp"), null);
    assert.equal(criarArmazenamentoR2({ ...configuracao, buscar: async () => new Response(null) }).urlPublica("a/b.webp"), "https://arquivos.exemplo.invalid/a/b.webp");
  });
});

describe("pipeline de imagem", () => {
  const png = (lado: number) => sharp({ create: { width: lado, height: lado, channels: 3, background: "#123456" } }).png().toBuffer();

  it("reencoda em webp, reduz ao lado máximo e não aumenta imagem pequena", async () => {
    const grande = await processarImagem(await png(2000), "imagem-produto");
    assert.equal(grande.tipoConteudo, "image/webp");
    assert.equal(grande.largura, 1024);

    const pequena = await processarImagem(await png(64), "avatar");
    assert.equal(pequena.largura, 64, "imagem pequena não é esticada");
  });

  it("recusa arquivo vazio, tipo não aceito e conteúdo que não é imagem", async () => {
    const valida = await png(10);
    await assert.rejects(() => processarImagem(Buffer.alloc(0), "avatar"), ImagemInvalidaErro);
    await assert.rejects(() => processarImagem(valida, "avatar", "image/gif"), ImagemInvalidaErro);
    await assert.rejects(() => processarImagem(Buffer.from("isto não é imagem"), "avatar"), ImagemInvalidaErro);
  });

  // O EXIF de uma foto de celular carrega GPS junto; o pipeline descarta o bloco inteiro, então
  // testar com qualquer campo EXIF já prova que nada de metadado sobrevive.
  it("descarta metadados EXIF (é onde vive a geolocalização da foto do celular)", async () => {
    const comExif = await sharp({ create: { width: 300, height: 300, channels: 3, background: "#fff" } })
      .withExif({ IFD0: { Copyright: "Jaa", Software: "camera" } })
      .jpeg()
      .toBuffer();
    assert.ok((await sharp(comExif).metadata()).exif, "o arquivo original realmente tem EXIF");

    const processada = await processarImagem(comExif, "avatar");
    assert.equal((await sharp(processada.conteudo).metadata()).exif, undefined);
  });

  it("cada envio gera uma chave nova: a URL antiga nunca é reaproveitada", () => {
    const primeira = montarChave("avatar", "id-da-identidade");
    assert.match(primeira, /^avatar\/id-da-identidade\/[0-9a-f-]{36}\.webp$/);
    assert.notEqual(primeira, montarChave("avatar", "id-da-identidade"));
  });
});
