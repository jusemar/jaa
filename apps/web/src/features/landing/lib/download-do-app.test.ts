import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { urlOficialDoApk } from "./download-do-app.ts";

describe("download do aplicativo", () => {
  it("usa o endereço oficial configurado, sem alterá-lo", () => {
    assert.equal(urlOficialDoApk("https://arquivos.exemplo.com/app/android/jaaa.apk"), "https://arquivos.exemplo.com/app/android/jaaa.apk");
  });

  it("só uma URL HTTPS completa vale: sem ela não há link", () => {
    for (const valor of [undefined, "", "http://exemplo.com/jaaa.apk", "exemplo.com/jaaa.apk", "/download/jaaa.apk", "javascript:alert(1)"]) {
      assert.equal(urlOficialDoApk(valor), null, String(valor));
    }
  });
});
