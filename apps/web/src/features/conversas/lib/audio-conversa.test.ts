import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { CABECALHO_IDENTIDADE_ATUANTE, DURACAO_MAXIMA_AUDIO_MS, ORDEM_CAMPOS_ENVIO_AUDIO, PREVIA_AUDIO, TAMANHO_MAXIMO_AUDIO_BYTES, TAXA_BITS_AUDIO_WEB, mensagemSchema, type Mensagem } from "@jaa/contratos";
import { definirIdentidadeAtuante } from "../../../lib/identidade-atuante.ts";
import { enviarMensagemAudio, pedirUrlsAudios } from "./api-conversas.ts";
import {
  camposDoEnvioDeAudio,
  destinoDaTentativaDeAudio,
  escolherTipoDeGravacao,
  fracaoTocada,
  idsDeAudiosVisiveis,
  mensagemDeFalhaAudio,
  modoDoCompositor,
  nomeDoArquivoDeAudio,
  podeGravar,
  proximaVelocidade,
  rotuloVelocidade,
  tentativaDeAudioJaChegou,
  validarAudioGravado,
} from "./audio-conversa.ts";
import { MENSAGEM_FALHA_GRAVACAO, iniciarGravacao, type AmbienteDeGravacao, type GravadorNativo } from "./gravador-audio.ts";
import { conteudoParaPrevia, idsDeImagensVisiveis } from "./imagem-conversa.ts";
import { criarReprodutorUnico } from "./reprodutor-unico.ts";
import { criarCacheUrlsImagens } from "./urls-imagens.ts";

const EU = "eeeeeeee-0000-4000-8000-000000000000";
const OUTRA = "ffffffff-0000-4000-8000-000000000000";
const CONVERSA = "aaaaaaaa-0000-4000-8000-000000000000";
const ID_CLIENTE = "11111111-1111-4111-8111-111111111111";
const id = (n: number) => `01a0a394-${String(n).padStart(4, "0")}-7000-8000-000000000000`;

function audio(n: number, extra: Partial<Mensagem> = {}): Mensagem {
  return {
    id: id(n),
    conversaId: CONVERSA,
    remetenteIdentidadeId: EU,
    tipo: "audio",
    conteudo: "",
    criadoEm: "2026-10-04T16:17:00.000Z",
    estado: "enviada",
    mensagemRespondida: null,
    editadaEm: null,
    excluidaEm: null,
    pedido: null,
    anexo: { id: id(n + 500), tipo: "audio", duracaoMs: 4000 },
    ...extra,
  };
}

// ---------- Gravador falso ----------
function ambienteFalso(opcoes: { tipos?: string[]; erroMicrofone?: string; semApi?: boolean } = {}) {
  let relogio = 1_000_000;
  const faixas = [{ parada: false, stop() { this.parada = true; } }];
  const agendados: { executar: () => void; emMs: number; cancelado: boolean }[] = [];
  const gravadores: (GravadorNativo & { opcoes: { mimeType: string; audioBitsPerSecond: number }; emitir: (bytes: number) => void })[] = [];
  const ambiente: AmbienteDeGravacao = {
    obterMicrofone: opcoes.semApi
      ? null
      : async () => {
          if (opcoes.erroMicrofone) throw Object.assign(new Error("x"), { name: opcoes.erroMicrofone });
          return { getTracks: () => faixas };
        },
    criarGravador: opcoes.semApi
      ? null
      : (_fluxo, opcoesGravador) => {
          const gravador = {
            state: "inactive",
            mimeType: opcoesGravador.mimeType,
            opcoes: opcoesGravador,
            ondataavailable: null as GravadorNativo["ondataavailable"],
            onstop: null as GravadorNativo["onstop"],
            onerror: null as GravadorNativo["onerror"],
            start() { this.state = "recording"; },
            stop() { this.state = "inactive"; this.onstop?.(); },
            emitir(bytes: number) { this.ondataavailable?.({ data: new Blob([new Uint8Array(bytes)]) }); },
          };
          gravadores.push(gravador);
          return gravador;
        },
    suportaTipo: (tipo) => (opcoes.tipos ?? ["audio/webm;codecs=opus", "audio/webm"]).includes(tipo),
    agora: () => relogio,
    agendar: (executar, emMs) => {
      const agendamento = { executar, emMs, cancelado: false };
      agendados.push(agendamento);
      return agendamento;
    },
    cancelarAgendamento: (agendamento) => {
      if (agendamento) (agendamento as { cancelado: boolean }).cancelado = true;
    },
    criarBlob: (partes, tipo) => new Blob(partes, { type: tipo }),
  };
  return { ambiente, faixas, agendados, gravadores, avancar: (ms: number) => (relogio += ms) };
}

describe("gravação", () => {
  it("escolhe o formato que o navegador grava: Opus/WebM primeiro, MP4 no Safari; sem suporte, nada", () => {
    assert.equal(escolherTipoDeGravacao((tipo) => ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].includes(tipo)), "audio/webm;codecs=opus");
    assert.equal(escolherTipoDeGravacao((tipo) => tipo === "audio/mp4"), "audio/mp4");
    assert.equal(escolherTipoDeGravacao(() => false), null);
    assert.deepEqual([nomeDoArquivoDeAudio("audio/webm;codecs=opus"), nomeDoArquivoDeAudio("audio/mp4")], ["audio.webm", "audio.m4a"]);
  });

  it("iniciar: pede o microfone, grava no formato escolhido e na taxa de voz", async () => {
    const { ambiente, gravadores } = ambienteFalso();
    const inicio = await iniciarGravacao(ambiente, () => {});
    assert.equal(inicio.ok, true);
    assert.deepEqual(gravadores[0]!.opcoes, { mimeType: "audio/webm;codecs=opus", audioBitsPerSecond: TAXA_BITS_AUDIO_WEB });
    assert.equal(gravadores[0]!.state, "recording");
  });

  it("parar: devolve o áudio com a duração medida e SOLTA o microfone; parar de novo devolve o mesmo", async () => {
    const { ambiente, gravadores, faixas, avancar, agendados } = ambienteFalso();
    const inicio = await iniciarGravacao(ambiente, () => {});
    assert.ok(inicio.ok);
    gravadores[0]!.emitir(4000);
    avancar(3200);
    gravadores[0]!.emitir(8000);
    const gravado = await inicio.gravacao.parar();
    assert.deepEqual([gravado.tipo, gravado.duracaoMs, gravado.arquivo.size, gravado.arquivo.type], ["audio/webm;codecs=opus", 3200, 12_000, "audio/webm;codecs=opus"]);
    assert.equal(faixas[0]!.parada, true);
    assert.equal(agendados[0]!.cancelado, true, "o limite de duração é desarmado");
    assert.equal(await inicio.gravacao.parar(), gravado);
  });

  it("cancelar: descarta o que foi gravado e solta o microfone", async () => {
    const { ambiente, gravadores, faixas } = ambienteFalso();
    const inicio = await iniciarGravacao(ambiente, () => {});
    assert.ok(inicio.ok);
    gravadores[0]!.emitir(4000);
    inicio.gravacao.cancelar();
    assert.equal(faixas[0]!.parada, true);
    assert.equal((await inicio.gravacao.parar()).arquivo.size, 0);
  });

  it("limite de 10 minutos: para SOZINHA, com o áudio pronto para ouvir e enviar", async () => {
    const { ambiente, gravadores, agendados, avancar } = ambienteFalso();
    let sozinha: Promise<{ duracaoMs: number; arquivo: Blob }> | null = null;
    const inicio = await iniciarGravacao(ambiente, (resultado) => (sozinha = resultado));
    assert.ok(inicio.ok);
    assert.equal(agendados[0]!.emMs, DURACAO_MAXIMA_AUDIO_MS);
    gravadores[0]!.emitir(50_000);
    avancar(DURACAO_MAXIMA_AUDIO_MS + 300);
    agendados[0]!.executar();
    assert.ok(sozinha);
    const gravado = await (sozinha as Promise<{ duracaoMs: number; arquivo: Blob }>);
    assert.deepEqual([gravado.duracaoMs, gravado.arquivo.size], [DURACAO_MAXIMA_AUDIO_MS, 50_000]);
  });

  it("permissão negada, sem microfone e navegador sem suporte: falha clara, nada gravando", async () => {
    assert.deepEqual(await iniciarGravacao(ambienteFalso({ erroMicrofone: "NotAllowedError" }).ambiente, () => {}), { ok: false, falha: "permissao-negada" });
    assert.deepEqual(await iniciarGravacao(ambienteFalso({ erroMicrofone: "NotFoundError" }).ambiente, () => {}), { ok: false, falha: "sem-microfone" });
    assert.deepEqual(await iniciarGravacao(ambienteFalso({ semApi: true }).ambiente, () => {}), { ok: false, falha: "nao-suportado" });
    assert.deepEqual(await iniciarGravacao(ambienteFalso({ tipos: ["audio/ogg"] }).ambiente, () => {}), { ok: false, falha: "nao-suportado" });
    assert.ok(MENSAGEM_FALHA_GRAVACAO["permissao-negada"].includes("microfone"));
  });

  it("áudio gravado: curto demais, vazio, grande demais ou de formato não aceito não segue para envio", () => {
    assert.equal(validarAudioGravado({ tipo: "audio/webm;codecs=opus", tamanhoBytes: 12_000, duracaoMs: 3000 }), null);
    assert.ok(validarAudioGravado({ tipo: "audio/webm", tamanhoBytes: 500, duracaoMs: 200 }));
    assert.ok(validarAudioGravado({ tipo: "audio/webm", tamanhoBytes: 0, duracaoMs: 3000 }));
    assert.ok(validarAudioGravado({ tipo: "audio/webm", tamanhoBytes: TAMANHO_MAXIMO_AUDIO_BYTES + 1, duracaoMs: 3000 }));
    assert.ok(validarAudioGravado({ tipo: "audio/ogg", tamanhoBytes: 5000, duracaoMs: 3000 }));
  });
});

describe("compositor: um modo por vez", () => {
  const base = { editando: false, gravando: false, audioPronto: false, imagemSelecionada: false, temTexto: false };

  it("normal → texto → imagem → gravando → áudio pronto → edição, nessa precedência", () => {
    assert.equal(modoDoCompositor(base), "normal");
    assert.equal(modoDoCompositor({ ...base, temTexto: true }), "texto");
    assert.equal(modoDoCompositor({ ...base, temTexto: true, imagemSelecionada: true }), "imagem");
    assert.equal(modoDoCompositor({ ...base, gravando: true, temTexto: true }), "gravando");
    assert.equal(modoDoCompositor({ ...base, audioPronto: true }), "audio-pronto");
    assert.equal(modoDoCompositor({ ...base, editando: true, audioPronto: true, gravando: true }), "edicao");
  });

  it("o microfone só aparece no modo normal, sem bloqueio e sem nada pendente", () => {
    const livre = { modo: "normal" as const, bloqueada: false, midiaPendente: false, textoPendente: false };
    assert.equal(podeGravar(livre), true);
    for (const modo of ["texto", "imagem", "gravando", "audio-pronto", "edicao"] as const) assert.equal(podeGravar({ ...livre, modo }), false, modo);
    assert.equal(podeGravar({ ...livre, bloqueada: true }), false);
    assert.equal(podeGravar({ ...livre, midiaPendente: true }), false, "foto ou áudio em envio se resolve antes");
    assert.equal(podeGravar({ ...livre, textoPendente: true }), false);
  });
});

// ---------- Envio ----------
const fetchOriginal = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = fetchOriginal;
  definirIdentidadeAtuante(null);
});

function falsificarFetch(respostas: { status: number; corpo: unknown }[]) {
  const chamadas: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    chamadas.push({ url, init });
    const resposta = respostas[Math.min(chamadas.length - 1, respostas.length - 1)]!;
    return new Response(JSON.stringify(resposta.corpo), { status: resposta.status });
  }) as typeof fetch;
  return chamadas;
}
const partes = (chamada: { init: RequestInit }) => [...(chamada.init.body as FormData).entries()].map(([nome, valor]) => [nome, typeof valor === "string" ? valor : `<arquivo:${valor.name}:${valor.type}>`]);
const gravado = () => new Blob([new Uint8Array(12_000)], { type: "audio/webm;codecs=opus" });

describe("envio do áudio", () => {
  it("multipart na ordem do contrato: idCliente, resposta, duracaoMs e o arquivo POR ÚLTIMO; sem Content-Type manual", async () => {
    const chamadas = falsificarFetch([{ status: 201, corpo: audio(9) }]);
    definirIdentidadeAtuante("bbbbbbbb-0000-4000-8000-000000000000");
    const resposta = await enviarMensagemAudio(CONVERSA, { idCliente: ID_CLIENTE, arquivo: gravado(), duracaoMs: 4000.4, mensagemRespondidaId: id(1) });
    assert.deepEqual(resposta.ok && resposta.dados.anexo, { id: id(509), tipo: "audio", duracaoMs: 4000 });
    assert.ok(chamadas[0]!.url.endsWith(`/conversas/${CONVERSA}/mensagens/audio`));
    assert.deepEqual(partes(chamadas[0]!), [["idCliente", ID_CLIENTE], ["mensagemRespondidaId", id(1)], ["duracaoMs", "4000"], ["arquivo", "<arquivo:audio.webm:audio/webm;codecs=opus>"]]);
    assert.deepEqual(partes(chamadas[0]!).map(([nome]) => nome), [...ORDEM_CAMPOS_ENVIO_AUDIO]);
    const cabecalhos = chamadas[0]!.init.headers as Record<string, string>;
    assert.ok(!Object.keys(cabecalhos).some((nome) => nome.toLowerCase() === "content-type"));
    assert.equal(cabecalhos[CABECALHO_IDENTIDADE_ATUANTE], "bbbbbbbb-0000-4000-8000-000000000000");
    assert.equal(chamadas[0]!.init.credentials, "include");
  });

  it("sem resposta: só idCliente, duracaoMs e o arquivo", () => {
    assert.deepEqual(camposDoEnvioDeAudio({ idCliente: ID_CLIENTE, duracaoMs: 61_500 }), [["idCliente", ID_CLIENTE], ["duracaoMs", "61500"]]);
  });

  it("retry: a MESMA tentativa reenvia o mesmo idCliente, duração e arquivo; 200 idempotente é sucesso", async () => {
    const chamadas = falsificarFetch([{ status: 503, corpo: null }, { status: 200, corpo: audio(9) }]);
    const tentativa = { idCliente: ID_CLIENTE, arquivo: gravado(), duracaoMs: 4000 };
    const primeira = await enviarMensagemAudio(CONVERSA, tentativa);
    assert.equal(primeira.ok, false);
    assert.equal(destinoDaTentativaDeAudio(primeira as never), "manter");
    const retry = await enviarMensagemAudio(CONVERSA, tentativa);
    assert.deepEqual(partes(chamadas[0]!), partes(chamadas[1]!));
    assert.deepEqual(retry.ok && retry.dados, mensagemSchema.parse(audio(9)));
  });

  it("destino e mensagens de falha: rede/5xx/429 mantêm para Reenviar; recusa definitiva descarta", () => {
    for (const status of [0, 500, 429]) assert.equal(destinoDaTentativaDeAudio({ status, codigo: null, mensagem: "" }), "manter");
    assert.equal(destinoDaTentativaDeAudio({ status: 400, codigo: "ARQUIVO_INVALIDO", mensagem: "" }), "descartar");
    assert.equal(destinoDaTentativaDeAudio({ status: 403, codigo: "COMUNICACAO_BLOQUEADA", mensagem: "" }), "descartar");
    assert.ok(mensagemDeFalhaAudio({ status: 0, codigo: null, mensagem: "" }).includes("Reenviar"));
    assert.equal(mensagemDeFalhaAudio({ status: 400, codigo: "ARQUIVO_INVALIDO", mensagem: "Grave de novo." }), "Grave de novo.");
  });
});

describe("tempo real, URLs e prévias", () => {
  it("mensagem:nova do próprio áudio antes da resposta HTTP: o balão pendente some (sem áudio duplo)", () => {
    const antes = new Set([id(1)]);
    assert.equal(tentativaDeAudioJaChegou({}, [audio(1)], antes, EU), false, "áudio antigo não conta");
    assert.equal(tentativaDeAudioJaChegou({}, [audio(1), audio(2)], antes, EU), true);
    assert.equal(tentativaDeAudioJaChegou({}, [audio(2, { remetenteIdentidadeId: OUTRA })], antes, EU), false);
    assert.equal(tentativaDeAudioJaChegou({ mensagemRespondidaId: id(1) }, [audio(2)], antes, EU), false, "outra referência é outro áudio");
  });

  it("URL só para áudio visível; imagens e áudios não se misturam", () => {
    const mensagens = [audio(1), audio(2, { anexo: null, excluidaEm: "2026-10-04T16:20:00.000Z" }), audio(3, { tipo: "imagem", anexo: { id: id(503), tipo: "imagem", largura: 10, altura: 10 } }), audio(4, { tipo: "texto", conteudo: "oi", anexo: null })];
    assert.deepEqual(idsDeAudiosVisiveis(mensagens), [id(1)]);
    assert.deepEqual(idsDeImagensVisiveis(mensagens), [id(3)]);
  });

  it("URLs dos áudios: rota própria, lote, e o mesmo cache só em memória (reuso, renovação única)", async () => {
    const chamadas = falsificarFetch([{ status: 200, corpo: { audios: [{ mensagemId: id(1), url: "https://privado.teste.invalid/a.webm?X-Amz-Signature=1", expiraEm: "2026-10-04T16:40:00.000Z" }] } }]);
    const resposta = await pedirUrlsAudios(CONVERSA, [id(1)]);
    assert.ok(chamadas[0]!.url.endsWith(`/conversas/${CONVERSA}/audios/urls`));
    assert.deepEqual(JSON.parse(chamadas[0]!.init.body as string), { mensagemIds: [id(1)] });
    assert.equal(resposta.ok && resposta.dados.audios.length, 1);

    let pedidos = 0;
    const cache = criarCacheUrlsImagens({
      agora: () => Date.parse("2026-10-04T16:20:00.000Z"),
      buscar: async (ids) => ids.map((mensagemId) => ({ mensagemId, url: `https://privado.teste.invalid/${mensagemId}?v=${++pedidos}`, expiraEm: "2026-10-04T16:40:00.000Z" })),
    });
    await cache.garantir([id(1)]);
    await cache.garantir([id(1)]);
    assert.equal(pedidos, 1, "URL válida é reaproveitada");
    await cache.aoFalharCarregamento(id(1));
    assert.equal(pedidos, 2, "falhou ao tocar: renova uma vez");
    await cache.aoFalharCarregamento(id(1));
    assert.deepEqual(cache.estado(id(1)), { situacao: "indisponivel" }, "falhou de novo: indisponível, sem laço");
    cache.esquecer(id(1));
    assert.deepEqual(cache.estado(id(1)), { situacao: "carregando" });
  });

  it("prévia de áudio em resposta e lista: sempre \"Áudio\"", () => {
    assert.equal(conteudoParaPrevia(audio(1)), PREVIA_AUDIO);
  });
});

describe("player", () => {
  it("um áudio por vez: começar outro pausa o anterior; pausar o próprio libera a vez", () => {
    const reprodutor = criarReprodutorUnico();
    const pausas: string[] = [];
    const a = () => pausas.push("a");
    const b = () => pausas.push("b");
    reprodutor.assumir(a);
    reprodutor.assumir(a);
    assert.deepEqual(pausas, [], "o mesmo player não se pausa");
    reprodutor.assumir(b);
    assert.deepEqual(pausas, ["a"]);
    reprodutor.liberar(b);
    reprodutor.assumir(a);
    assert.deepEqual(pausas, ["a"], "b já tinha parado sozinho");
  });

  it("progresso pela duração do anexo (o WebM gravado não informa a sua) e velocidades 1x → 1,5x → 2x → 1x", () => {
    assert.deepEqual([fracaoTocada(0, 4000), fracaoTocada(2, 4000), fracaoTocada(9, 4000), fracaoTocada(Number.NaN, 4000), fracaoTocada(1, 0)], [0, 0.5, 1, 0, 0]);
    assert.deepEqual([proximaVelocidade(1), proximaVelocidade(1.5), proximaVelocidade(2), proximaVelocidade(7)], [1.5, 2, 1, 1]);
    assert.deepEqual([1, 1.5, 2].map(rotuloVelocidade), ["1x", "1,5x", "2x"]);
  });
});
