import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CABECALHOS_DO_APK, CHAVE_DO_APK, conferirApk, prepararEnvioDoApk, urlPublicaDoApk } from "../src/lib/armazenamento/apk-do-aplicativo.js";

const ZIP = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(2 * 1024 * 1024)]);
const DESTINO = { contaId: "conta", bucket: "bucket-publico", accessKeyId: "AKIAEXEMPLO", secretAccessKey: "segredo-de-teste", urlPublica: "https://arquivos.exemplo.com/" };

describe("APK do aplicativo no armazenamento público", () => {
  it("o endereço é fixo e termina em jaaa.apk", () => {
    assert.equal(CHAVE_DO_APK, "app/android/jaaa.apk");
    assert.equal(urlPublicaDoApk(DESTINO.urlPublica), "https://arquivos.exemplo.com/app/android/jaaa.apk");
  });

  it("o objeto é gravado com o nome jaaa.apk, tipo de APK e sem cache preso", () => {
    assert.equal(CABECALHOS_DO_APK["content-disposition"], 'attachment; filename="jaaa.apk"');
    assert.equal(CABECALHOS_DO_APK["content-type"], "application/vnd.android.package-archive");
    assert.equal(CABECALHOS_DO_APK["cache-control"], "no-cache");
  });

  it("aceita um APK e informa tamanho e SHA-256", () => {
    const conferencia = conferirApk("Jaaa-0.6.0.APK", ZIP);
    assert.equal(conferencia.ok, true);
    if (conferencia.ok) {
      assert.equal(conferencia.tamanhoBytes, ZIP.length);
      assert.match(conferencia.sha256, /^[0-9a-f]{64}$/);
    }
  });

  it("recusa extensão errada, arquivo minúsculo e conteúdo que não é ZIP", () => {
    assert.equal(conferirApk("jaaa.aab", ZIP).ok, false);
    assert.equal(conferirApk("jaaa.apk", ZIP.subarray(0, 100)).ok, false);
    assert.equal(conferirApk("jaaa.apk", Buffer.alloc(2 * 1024 * 1024)).ok, false);
  });

  it("o envio é um PUT assinado na chave fixa, com nome, tipo e cache ASSINADOS", () => {
    const envio = prepararEnvioDoApk(DESTINO, ZIP, new Date("2026-01-01T00:00:00Z"));
    assert.equal(envio.metodo, "PUT");
    assert.equal(envio.url, "https://conta.r2.cloudflarestorage.com/bucket-publico/app/android/jaaa.apk");
    assert.equal(envio.cabecalhos["content-disposition"], 'attachment; filename="jaaa.apk"');
    assert.match(envio.cabecalhos.authorization ?? "", /SignedHeaders=cache-control;content-disposition;content-type;host;x-amz-content-sha256;x-amz-date/);
    assert.ok(!JSON.stringify(envio).includes(DESTINO.secretAccessKey));
  });

  it("respeita o endpoint alternativo", () => {
    const envio = prepararEnvioDoApk({ ...DESTINO, endpoint: "https://s3.exemplo.com/" }, ZIP);
    assert.equal(envio.url, "https://s3.exemplo.com/bucket-publico/app/android/jaaa.apk");
  });
});
