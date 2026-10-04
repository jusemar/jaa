import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DURACAO_MAXIMA_AUDIO_MS, MENSAGEM_AUDIO_CURTO, MENSAGEM_AUDIO_GRANDE, MENSAGEM_AUDIO_INVALIDO } from "@jaa/contratos";
import { AudioInvalidoErro, duracaoDoMp4, formatoPelosBytes, montarChaveAudio, validarAudio } from "../src/lib/armazenamento/validar-audio.js";
import { mp4Falso, webmFalso } from "./apoio/audios-de-teste.js";

const recusa = (mensagem: string, executar: () => unknown) =>
  assert.throws(executar, (erro) => {
    assert.ok(erro instanceof AudioInvalidoErro);
    assert.equal(erro.message, mensagem);
    return true;
  });

describe("formato pelos bytes", () => {
  it("WebM pelo cabeçalho EBML + DocType webm; MP4 pela caixa ftyp", () => {
    assert.equal(formatoPelosBytes(webmFalso()), "audio/webm");
    assert.equal(formatoPelosBytes(mp4Falso({ duracaoMs: 4000 })), "audio/mp4");
    assert.equal(formatoPelosBytes(mp4Falso({ duracaoMs: 4000, marca: "isom" })), "audio/mp4");
  });

  it("Matroska que não é WebM, QuickTime, 3GPP/AMR, MP3, WAV, OGG, imagem e lixo são recusados", () => {
    const matroska = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x88]), Buffer.from("matroska"), Buffer.alloc(200)]);
    for (const conteudo of [matroska, mp4Falso({ duracaoMs: 1000, marca: "qt  " }), mp4Falso({ duracaoMs: 1000, marca: "3gp4" }), mp4Falso({ duracaoMs: 1000, marca: "3gp5" }), Buffer.from("ID3\u0003\u0000\u0000" + "x".repeat(50)), Buffer.from("RIFF0000WAVEfmt "), Buffer.from("OggS" + "\u0000".repeat(40)), Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]), Buffer.from("x"), Buffer.alloc(0)]) {
      assert.equal(formatoPelosBytes(conteudo), null);
    }
  });
});

describe("duração", () => {
  it("MP4: lida do próprio arquivo, com o moov no começo ou no fim", () => {
    assert.equal(duracaoDoMp4(mp4Falso({ duracaoMs: 12_345, moovNoFim: true })), 12_345);
    assert.equal(duracaoDoMp4(mp4Falso({ duracaoMs: 12_345, moovNoFim: false })), 12_345);
    assert.equal(duracaoDoMp4(mp4Falso({ duracaoMs: 5000, semMvhd: true })), null);
    assert.equal(duracaoDoMp4(webmFalso()), null);
  });

  it("MP4: a duração do ARQUIVO vale; a informada pelo cliente é ignorada", () => {
    assert.equal(validarAudio(mp4Falso({ duracaoMs: 8000 }), "audio/mp4", 1000).duracaoMs, 8000);
    recusa(MENSAGEM_AUDIO_GRANDE, () => validarAudio(mp4Falso({ duracaoMs: DURACAO_MAXIMA_AUDIO_MS + 60_000, bytes: 4_000_000 }), "audio/mp4", 5000));
  });

  it("WebM: vale a do cliente, dentro dos limites e coerente com o tamanho", () => {
    assert.deepEqual({ ...validarAudio(webmFalso(16_000), "audio/webm;codecs=opus", 4000), conteudo: undefined }, { conteudo: undefined, tipoConteudo: "audio/webm", duracaoMs: 4000 });
    recusa(MENSAGEM_AUDIO_CURTO, () => validarAudio(webmFalso(2000), "audio/webm", 200));
    recusa(MENSAGEM_AUDIO_GRANDE, () => validarAudio(webmFalso(3_000_000), "audio/webm", DURACAO_MAXIMA_AUDIO_MS + 10_000));
    // 5 MB "em 1 segundo" (duração declarada menor que a real) e 2 KB "em 5 minutos" (maior que a real).
    recusa(MENSAGEM_AUDIO_INVALIDO, () => validarAudio(webmFalso(5_000_000), "audio/webm", 1000));
    recusa(MENSAGEM_AUDIO_INVALIDO, () => validarAudio(webmFalso(2000), "audio/webm", 300_000));
  });

  it("10 minutos exatos (com a folga do cronômetro) passam e ficam no teto", () => {
    assert.equal(validarAudio(webmFalso(2_400_000), "audio/webm", DURACAO_MAXIMA_AUDIO_MS + 800).duracaoMs, DURACAO_MAXIMA_AUDIO_MS);
  });
});

describe("MIME declarado × bytes", () => {
  it("MIME fora da lista, bytes de outro formato ou os dois discordando: recusado", () => {
    recusa(MENSAGEM_AUDIO_INVALIDO, () => validarAudio(webmFalso(), "audio/mpeg", 4000));
    recusa(MENSAGEM_AUDIO_INVALIDO, () => validarAudio(webmFalso(), "audio/mp4", 4000));
    recusa(MENSAGEM_AUDIO_INVALIDO, () => validarAudio(mp4Falso({ duracaoMs: 4000 }), "audio/webm", 4000));
    recusa(MENSAGEM_AUDIO_INVALIDO, () => validarAudio(Buffer.from("isto não é áudio, mas diz que é"), "audio/webm", 4000));
    recusa(MENSAGEM_AUDIO_INVALIDO, () => validarAudio(Buffer.alloc(0), "audio/webm", 4000));
    assert.equal(validarAudio(mp4Falso({ duracaoMs: 4000 }), "audio/x-m4a", 4000).tipoConteudo, "audio/mp4");
  });
});

describe("chave do objeto", () => {
  it("gerada pelo servidor, por conversa, com a extensão do formato validado", () => {
    assert.match(montarChaveAudio("conv-1", "audio/webm"), /^audio-conversa\/conv-1\/[0-9a-f-]{36}\.webm$/);
    assert.match(montarChaveAudio("conv-1", "audio/mp4"), /^audio-conversa\/conv-1\/[0-9a-f-]{36}\.m4a$/);
    assert.notEqual(montarChaveAudio("c", "audio/webm"), montarChaveAudio("c", "audio/webm"));
  });
});
