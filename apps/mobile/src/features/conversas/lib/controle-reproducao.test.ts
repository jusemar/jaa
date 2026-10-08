/// <reference types="node" />
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { tipoAudioAceito } from "@jaa/contratos";
import { configurarReprodutor, encerrarNoFim, lerSituacao, type ReprodutorNativo, type SituacaoReproducao } from "./controle-reproducao.ts";
import { criarReprodutorUnico } from "./reprodutor-unico.ts";
import { criarCacheUrlsImagens } from "./urls-imagens.ts";
import configuracaoExpo from "../../../../app.config.ts";

const fonte = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), "utf8");
const semComentarios = (codigo: string) => codigo.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");

/** Reprodutor falso que se comporta como o ExoPlayer no FIM: se receber seekTo(0) ainda "querendo tocar", recomeça. */
function reprodutorFalso() {
  const chamadas: string[] = [];
  const reprodutor: ReprodutorNativo & { querTocar: boolean } = {
    loop: true,
    volume: 0,
    muted: true,
    playing: false,
    querTocar: false,
    play() {
      chamadas.push("play");
      this.querTocar = true;
      this.playing = true;
    },
    pause() {
      chamadas.push("pause");
      this.querTocar = false;
      this.playing = false;
    },
    async seekTo(segundos: number) {
      chamadas.push(`seekTo(${segundos})`);
      // O comportamento que causava a repetição: voltar ao início com a intenção de tocar ligada.
      if (this.querTocar) this.playing = true;
    },
    setPlaybackRate(velocidade: number) {
      chamadas.push(`rate(${velocidade})`);
    },
  };
  return { reprodutor, chamadas };
}

const situacao = (extra: Partial<SituacaoReproducao> = {}): SituacaoReproducao => ({ playing: true, currentTime: 2, isLoaded: true, didJustFinish: false, error: null, ...extra });

describe("configuração do reprodutor", () => {
  it("toca UMA vez (sem loop), sem mudo e com volume cheio", () => {
    const { reprodutor } = reprodutorFalso();
    configurarReprodutor(reprodutor);
    assert.deepEqual([reprodutor.loop, reprodutor.volume, reprodutor.muted], [false, 1, false]);
    const player = fonte("../components/player-audio.tsx");
    assert.ok(player.includes("configurarReprodutor(novo);"));
    assert.ok(!/loop\s*[:=]\s*true|volume\s*=\s*0\b|muted\s*=\s*true/.test(semComentarios(player)));
  });
});

describe("fim normal da faixa", () => {
  it("o defeito: no fim o reprodutor ainda quer tocar, e só voltar ao início o faz recomeçar", async () => {
    const { reprodutor } = reprodutorFalso();
    reprodutor.play();
    reprodutor.playing = false; // chegou ao fim
    await reprodutor.seekTo(0);
    assert.equal(reprodutor.playing, true, "é isto que o Jaaa NÃO pode fazer");
  });

  it("a correção: pausa ANTES de voltar ao início; fica parado e não chama play", async () => {
    const { reprodutor, chamadas } = reprodutorFalso();
    reprodutor.play();
    reprodutor.playing = false;
    chamadas.length = 0;
    encerrarNoFim(reprodutor);
    await Promise.resolve();
    assert.deepEqual(chamadas, ["pause", "seekTo(0)"]);
    assert.equal(reprodutor.playing, false);
    assert.equal(reprodutor.querTocar, false);
  });

  it("tocar de novo é só pelo toque: depois do fim, play manual funciona normalmente", async () => {
    const { reprodutor, chamadas } = reprodutorFalso();
    reprodutor.play();
    encerrarNoFim(reprodutor);
    await Promise.resolve();
    reprodutor.play();
    assert.deepEqual(chamadas, ["play", "pause", "seekTo(0)", "play"]);
    assert.equal(reprodutor.playing, true);
  });

  it("fim NÃO é erro: é lido como \"terminou\"; erro real é lido como erro", () => {
    assert.deepEqual(lerSituacao(situacao({ playing: false, didJustFinish: true, currentTime: 6.6 })), { tipo: "terminou" });
    assert.deepEqual(lerSituacao(situacao()), { tipo: "andamento", tocando: true, tempoAtual: 2 });
    assert.deepEqual(lerSituacao(situacao({ playing: false })), { tipo: "andamento", tocando: false, tempoAtual: 2 });
    assert.deepEqual(lerSituacao(situacao({ error: "Response code: 403" })), { tipo: "erro" });
    assert.deepEqual(lerSituacao(situacao({ error: "x", didJustFinish: true })), { tipo: "erro" });
  });

  it("no player: o fim volta ao estado inicial e não renova URL, não recria o reprodutor nem toca", () => {
    const player = semComentarios(fonte("../components/player-audio.tsx"));
    const fim = player.slice(player.indexOf('if (leitura.tipo === "terminou") {'), player.indexOf("setTocando(leitura.tocando);"));
    assert.ok(fim.includes("encerrarNoFim(novo);") && fim.includes("setTocando(false);") && fim.includes("setTempoAtual(0);"));
    assert.ok(!/aoFalhar|\.play\(|createAudioPlayer|\.remove\(/.test(fim), "nada de renovar, recriar ou tocar no fim");
    assert.equal(player.match(/\.play\(\)/g)?.length, 1, "o único play() é o do toque no botão");
    const erro = player.slice(player.indexOf('if (leitura.tipo === "erro") {'), player.indexOf("if (situacao.isLoaded && !carregou)"));
    assert.ok(erro.includes("avisos.current.aoFalhar?.();"), "só o erro real pede renovação");
    assert.ok(!/useEffect\([^)]*=>[\s\S]{0,200}\.play\(/.test(player), "nenhum efeito chama play");
  });
});

describe("erro real e renovação da URL", () => {
  it("renova UMA vez; falhando de novo, indisponível — e o fim normal não passa por aqui", async () => {
    let pedidos = 0;
    const cache = criarCacheUrlsImagens({
      agora: () => Date.parse("2026-10-04T16:20:00.000Z"),
      buscar: async (ids) => ids.map((mensagemId) => ({ mensagemId, url: `https://privado.teste.invalid/${mensagemId}?v=${++pedidos}`, expiraEm: "2026-10-04T16:40:00.000Z" })),
    });
    await cache.garantir(["a"]);
    // Três áudios tocados até o fim: nenhuma renovação.
    for (let i = 0; i < 3; i += 1) assert.equal(lerSituacao(situacao({ didJustFinish: true })).tipo, "terminou");
    assert.equal(pedidos, 1);
    await cache.aoFalharCarregamento("a");
    assert.equal(pedidos, 2);
    await cache.aoFalharCarregamento("a");
    assert.deepEqual([pedidos, cache.estado("a").situacao], [2, "indisponivel"]);
  });
});

describe("um áudio por vez", () => {
  it("o segundo pausa o primeiro; terminar o segundo não reinicia o primeiro", async () => {
    const unico = criarReprodutorUnico();
    const primeiro = reprodutorFalso();
    const segundo = reprodutorFalso();
    const pausarPrimeiro = () => primeiro.reprodutor.pause();
    const pausarSegundo = () => segundo.reprodutor.pause();

    unico.assumir(pausarPrimeiro);
    primeiro.reprodutor.play();
    unico.assumir(pausarSegundo);
    segundo.reprodutor.play();
    assert.equal(primeiro.reprodutor.playing, false, "o primeiro foi pausado");

    encerrarNoFim(segundo.reprodutor);
    unico.liberar(pausarSegundo);
    await Promise.resolve();
    assert.deepEqual([primeiro.reprodutor.playing, segundo.reprodutor.playing], [false, false]);
    assert.deepEqual(primeiro.chamadas, ["play", "pause"], "nada tocou o primeiro de novo");
  });
});

describe("modo de áudio e formatos", () => {
  const nativo = fonte("./audio-nativo.ts");

  it("reprodução: saída normal de mídia, sem gravação, sem fone de chamada e sem segundo plano", () => {
    assert.ok(nativo.includes("export const MODO_DE_REPRODUCAO = { allowsRecording: false, playsInSilentMode: true, shouldPlayInBackground: false, shouldRouteThroughEarpiece: false } as const;"));
  });

  it("depois de gravar, o modo de reprodução é restaurado (o de gravação não vaza para o player)", () => {
    const parar = nativo.slice(nativo.indexOf("async parar() {"), nativo.indexOf("agora: () => Date.now()"));
    assert.ok(parar.includes("finally") && parar.includes("setAudioModeAsync(MODO_DE_REPRODUCAO)"));
    assert.ok(nativo.includes("?.setAudioModeAsync(MODO_DE_REPRODUCAO)"), "e é reaplicado antes de tocar");
    assert.equal(nativo.match(/allowsRecording: true/g)?.length, 1, "gravação só é ligada ao iniciar uma gravação");
  });

  it("WebM/Opus (Web) e MP4/AAC (app) usam o MESMO player, pela URL, sem tratamento por formato", () => {
    assert.deepEqual([tipoAudioAceito("audio/webm;codecs=opus"), tipoAudioAceito("audio/mp4")], ["audio/webm", "audio/mp4"]);
    const player = semComentarios(fonte("../components/player-audio.tsx"));
    assert.ok(player.includes("audio.createAudioPlayer({ uri: url }"));
    assert.ok(!/webm|mp4|m4a|opus|aac/i.test(player), "o player não decide nada pelo formato");
  });
});

describe("permissão de microfone na configuração FONTE do Expo", () => {
  const app = { expo: configuracaoExpo } as unknown as { expo: { plugins: unknown[]; android: { permissions: string[]; blockedPermissions: string[] } } };
  const plugin = (nome: string) => app.expo.plugins.find((item) => Array.isArray(item) && item[0] === nome) as [string, Record<string, unknown>] | undefined;

  it("RECORD_AUDIO declarada e não bloqueada; expo-audio a adiciona", () => {
    assert.ok(app.expo.android.permissions.includes("android.permission.RECORD_AUDIO"));
    assert.ok(!app.expo.android.blockedPermissions.includes("android.permission.RECORD_AUDIO"));
    assert.equal(plugin("expo-audio")?.[1].recordAudioAndroid, true);
    assert.ok(String(plugin("expo-audio")?.[1].microphonePermission).includes("mensagem de voz"));
  });

  it("nenhum plugin desliga o microfone (era o expo-image-picker com microphonePermission: false que removia a permissão)", () => {
    for (const item of app.expo.plugins) {
      if (Array.isArray(item)) assert.notEqual((item[1] as Record<string, unknown>).microphonePermission, false, String(item[0]));
    }
    assert.equal(typeof plugin("expo-image-picker")?.[1].microphonePermission, "string");
  });
});
