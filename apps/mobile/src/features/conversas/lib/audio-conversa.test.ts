/// <reference types="node" />
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { CABECALHO_IDENTIDADE_ATUANTE, CAMPO_ARQUIVO_AUDIO, DURACAO_MAXIMA_AUDIO_MS, ORDEM_CAMPOS_ENVIO_AUDIO, PREVIA_AUDIO, mensagemSchema, tipoAudioAceito, type Mensagem } from "@jaa/contratos";
import { enviarMultipart, type DependenciasEnvio, type FormularioArquivo } from "../../../lib/envio-arquivo.ts";
import { acoesDisponiveisDaMensagem, conteudoParaPrevia } from "./acoes-mensagem.ts";
import {
  NOME_ENVIO_AUDIO,
  TIPO_ENVIO_AUDIO,
  arquivoDoAudio,
  camposDoEnvioDeAudio,
  destinoDaTentativaDeAudio,
  fracaoTocada,
  idsDeAudiosVisiveis,
  mensagemDeFalhaAudio,
  modoDoCompositor,
  opcoesDeGravacaoNativas,
  podeGravar,
  proximaVelocidade,
  rotuloVelocidade,
  tentativaDeAudioJaChegou,
  validarAudioGravado,
  type TentativaAudio,
} from "./audio-conversa.ts";
import { conversaVazia, ocultarMensagem, receberAtualizacao, receberMensagens } from "./estados-mensagens.ts";
import { MENSAGEM_FALHA_GRAVACAO, iniciarGravacao, type MicrofoneDoAparelho } from "./gravador-audio.ts";
import { idsDeImagensVisiveis } from "./imagem-conversa.ts";
import { criarReprodutorUnico } from "./reprodutor-unico.ts";
import { criarCacheUrlsImagens } from "./urls-imagens.ts";

const EU = "eeeeeeee-0000-4000-8000-000000000000";
const OUTRA = "ffffffff-0000-4000-8000-000000000000";
const CONVERSA = "aaaaaaaa-0000-4000-8000-000000000000";
const ID_CLIENTE = "11111111-1111-4111-8111-111111111111";
const id = (n: number) => `01a0a394-${String(n).padStart(4, "0")}-7000-8000-000000000000`;
const fonte = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), "utf8");
const semComentarios = (codigo: string) => codigo.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
const GRAVADO = { uri: "file:///data/user/0/jaa/cache/Audio/gravacao.m4a", duracaoMs: 4200 };

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
    anexo: { id: id(n + 500), tipo: "audio", duracaoMs: 4200 },
    ...extra,
  };
}

// ---------- Microfone falso ----------
function microfoneFalso(opcoes: { disponivel?: boolean; permissao?: boolean; falhaAoIniciar?: boolean; falhaAoParar?: boolean; uri?: string | null } = {}) {
  let relogio = 1_000_000;
  const agendados: { executar: () => void; emMs: number; cancelado: boolean }[] = [];
  const registro = { pediuPermissao: 0, iniciou: 0, parou: 0 };
  const microfone: MicrofoneDoAparelho = {
    disponivel: opcoes.disponivel ?? true,
    async pedirPermissao() {
      registro.pediuPermissao += 1;
      return opcoes.permissao ?? true;
    },
    async iniciar() {
      if (opcoes.falhaAoIniciar) throw new Error("microfone ocupado");
      registro.iniciou += 1;
      return {
        async parar() {
          registro.parou += 1;
          if (opcoes.falhaAoParar) throw new Error("interrompido");
          return opcoes.uri === undefined ? GRAVADO.uri : opcoes.uri;
        },
      };
    },
    agora: () => relogio,
    agendar: (executar, emMs) => {
      const agendamento = { executar, emMs, cancelado: false };
      agendados.push(agendamento);
      return agendamento;
    },
    cancelarAgendamento: (agendamento) => {
      if (agendamento) (agendamento as { cancelado: boolean }).cancelado = true;
    },
  };
  return { microfone, registro, agendados, avancar: (ms: number) => (relogio += ms) };
}

describe("gravação", () => {
  it("permissão pedida ao tocar no microfone; gravando, parar devolve o arquivo com a duração medida", async () => {
    const { microfone, registro, avancar, agendados } = microfoneFalso();
    const inicio = await iniciarGravacao(microfone, () => {});
    assert.ok(inicio.ok);
    assert.deepEqual(registro, { pediuPermissao: 1, iniciou: 1, parou: 0 });
    avancar(4200);
    const gravado = await inicio.gravacao.parar();
    assert.deepEqual(gravado, GRAVADO);
    assert.equal(agendados[0]!.cancelado, true, "o limite de duração é desarmado");
    assert.equal(await inicio.gravacao.parar(), gravado, "parar de novo devolve o mesmo");
    assert.equal(registro.parou, 1, "o gravador nativo para uma vez só");
  });

  it("permissão negada: mensagem clara, nada é iniciado", async () => {
    const { microfone, registro } = microfoneFalso({ permissao: false });
    assert.deepEqual(await iniciarGravacao(microfone, () => {}), { ok: false, falha: "permissao-negada" });
    assert.equal(registro.iniciou, 0);
    assert.ok(MENSAGEM_FALHA_GRAVACAO["permissao-negada"].includes("microfone"));
  });

  it("build do app sem o módulo de áudio: avisa para atualizar, sem pedir permissão nem quebrar", async () => {
    const { microfone, registro } = microfoneFalso({ disponivel: false });
    assert.deepEqual(await iniciarGravacao(microfone, () => {}), { ok: false, falha: "sem-modulo" });
    assert.equal(registro.pediuPermissao, 0);
    assert.ok(MENSAGEM_FALHA_GRAVACAO["sem-modulo"].includes("Atualize"));
  });

  it("erro ao inicializar o microfone: falha tratada", async () => {
    assert.deepEqual(await iniciarGravacao(microfoneFalso({ falhaAoIniciar: true }).microfone, () => {}), { ok: false, falha: "falha" });
  });

  it("cancelar: para o gravador (solta o microfone) e não devolve áudio", async () => {
    const { microfone, registro } = microfoneFalso();
    const inicio = await iniciarGravacao(microfone, () => {});
    assert.ok(inicio.ok);
    await inicio.gravacao.cancelar();
    assert.equal(registro.parou, 1);
    assert.equal(await inicio.gravacao.parar(), null);
  });

  it("interrupção do sistema ao parar (ou gravador sem arquivo): não há áudio, sem exceção", async () => {
    for (const opcoes of [{ falhaAoParar: true }, { uri: null }]) {
      const inicio = await iniciarGravacao(microfoneFalso(opcoes).microfone, () => {});
      assert.ok(inicio.ok);
      assert.equal(await inicio.gravacao.parar(), null);
    }
  });

  it("limite de 10 minutos: para SOZINHA, com o áudio pronto para ouvir e enviar", async () => {
    const { microfone, agendados, avancar } = microfoneFalso();
    let sozinha: Promise<unknown> | null = null;
    const inicio = await iniciarGravacao(microfone, (resultado) => (sozinha = resultado));
    assert.ok(inicio.ok);
    assert.equal(agendados[0]!.emMs, DURACAO_MAXIMA_AUDIO_MS);
    avancar(DURACAO_MAXIMA_AUDIO_MS + 400);
    agendados[0]!.executar();
    assert.deepEqual(await (sozinha as unknown as Promise<unknown>), { uri: GRAVADO.uri, duracaoMs: DURACAO_MAXIMA_AUDIO_MS });
  });

  it("áudio gravado: curto demais ou sem arquivo não segue para envio", () => {
    assert.equal(validarAudioGravado(GRAVADO), null);
    assert.ok(validarAudioGravado({ uri: GRAVADO.uri, duracaoMs: 200 }));
    assert.ok(validarAudioGravado({ uri: "", duracaoMs: 4000 }));
  });

  it("AppState e saída da conversa cancelam a gravação; nada grava em segundo plano", () => {
    const hook = fonte("../hooks/use-gravacao-audio.ts");
    assert.ok(hook.includes('AppState.addEventListener("change"') && hook.includes('if (situacao === "active") return;'));
    assert.ok(hook.includes("void gravacao.current?.cancelar();"), "desmontar a conversa solta o microfone");
    const nativo = fonte("./audio-nativo.ts");
    assert.ok(nativo.includes("allowsBackgroundRecording: false") && nativo.includes("shouldPlayInBackground: false"));
    const app = JSON.parse(fonte("../../../../app.json")) as { expo: { plugins: unknown[]; android: { blockedPermissions: string[] } } };
    const plugin = app.expo.plugins.find((item) => Array.isArray(item) && item[0] === "expo-audio") as [string, Record<string, unknown>];
    assert.deepEqual([plugin[1].enableBackgroundRecording, plugin[1].enableBackgroundPlayback], [false, false]);
    assert.ok(String(plugin[1].microphonePermission).includes("mensagem de voz"));
    assert.ok(!app.expo.android.blockedPermissions.includes("android.permission.RECORD_AUDIO"), "o microfone deixou de ser bloqueado no manifesto");
  });

  it("o módulo nativo é carregado sob demanda e com proteção (build antigo não derruba a conversa)", () => {
    const nativo = semComentarios(fonte("./audio-nativo.ts"));
    assert.ok(!/^import .* from "expo-audio";/m.test(nativo.replace(/import\("expo-audio"\)/g, "")), "sem import estático de valor");
    assert.ok(nativo.includes('require("expo-audio")') && nativo.includes("catch"));
    for (const arquivo of ["../components/player-audio.tsx", "../hooks/use-gravacao-audio.ts", "../components/tela-conversa.tsx"]) {
      assert.ok(!/from "expo-audio"/.test(fonte(arquivo)), arquivo);
    }
  });
});

describe("compositor: um modo por vez", () => {
  const base = { editando: false, gravando: false, audioPronto: false, imagemSelecionada: false, temTexto: false };

  it("mesma precedência da Web", () => {
    assert.equal(modoDoCompositor(base), "normal");
    assert.equal(modoDoCompositor({ ...base, temTexto: true }), "texto");
    assert.equal(modoDoCompositor({ ...base, imagemSelecionada: true, temTexto: true }), "imagem");
    assert.equal(modoDoCompositor({ ...base, gravando: true, temTexto: true }), "gravando");
    assert.equal(modoDoCompositor({ ...base, audioPronto: true }), "audio-pronto");
    assert.equal(modoDoCompositor({ ...base, editando: true, audioPronto: true }), "edicao");
    const web = fonte("../../../../../web/src/features/conversas/lib/audio-conversa.ts");
    assert.ok(web.includes('if (estado.editando) return "edicao";') && web.includes('return estado.temTexto ? "texto" : "normal";'));
  });

  it("o microfone só aparece no modo normal, sem bloqueio e sem nada pendente", () => {
    const livre = { modo: "normal" as const, bloqueada: false, midiaPendente: false, textoPendente: false };
    assert.equal(podeGravar(livre), true);
    for (const modo of ["texto", "imagem", "gravando", "audio-pronto", "edicao"] as const) assert.equal(podeGravar({ ...livre, modo }), false);
    assert.equal(podeGravar({ ...livre, bloqueada: true }), false);
    assert.equal(podeGravar({ ...livre, midiaPendente: true }), false);
  });

  it("na tela: gravando ou com áudio pronto a pílula de texto some; o microfone ocupa o lugar do enviar", () => {
    const tela = fonte("../components/tela-conversa.tsx");
    assert.ok(tela.includes('(modo === "gravando" || modo === "audio-pronto") && estilos.oculto'));
    assert.ok(tela.includes('accessibilityLabel={microfoneNoLugarDoEnviar ? "Gravar áudio" : rotuloEnvio}'));
    assert.ok(tela.includes("onPress={microfoneNoLugarDoEnviar ? () => void gravacao.iniciar() : aoEnviar}"));
    assert.ok(tela.includes("gravacao.cancelar();\n    gravacao.descartar();"), "editar descarta gravação e áudio pronto");
    const compositor = fonte("../components/gravacao-audio-compositor.tsx");
    for (const rotulo of ["Cancelar", '"Parar gravação"', '"Descartar áudio"', '"Enviar áudio"']) assert.ok(compositor.includes(rotulo), rotulo);
  });
});

// ---------- Envio ----------
class FormularioFalso implements FormularioArquivo {
  campos: [string, unknown][] = [];
  append(campo: string, valor: unknown) {
    this.campos.push([campo, valor]);
  }
}

function servidor(respostas: { status: number; corpo: unknown }[] | "sem-rede") {
  const chamadas: { url: string; init: RequestInit }[] = [];
  const deps: DependenciasEnvio = {
    urlApi: "http://10.0.2.2:3333",
    buscar: (async (url: string, init: RequestInit) => {
      chamadas.push({ url, init });
      if (respostas === "sem-rede") throw new TypeError("Network request failed");
      const resposta = respostas[Math.min(chamadas.length - 1, respostas.length - 1)]!;
      return new Response(JSON.stringify(resposta.corpo), { status: resposta.status });
    }) as typeof fetch,
    cabecalhos: async () => ({ Cookie: "jaa.session_token=sessao-de-teste", [CABECALHO_IDENTIDADE_ATUANTE]: "empresa-1" }),
    criarFormulario: () => new FormularioFalso(),
  };
  const enviar = (tentativa: TentativaAudio) =>
    enviarMultipart(deps, `/conversas/${CONVERSA}/mensagens/audio`, mensagemSchema, { campos: camposDoEnvioDeAudio(tentativa), arquivo: arquivoDoAudio(tentativa.audio), campoArquivo: CAMPO_ARQUIVO_AUDIO });
  const partes = (indice: number) => (chamadas[indice]!.init.body as unknown as FormularioFalso).campos;
  return { chamadas, enviar, partes };
}

describe("envio do áudio (multipart)", () => {
  const tentativa: TentativaAudio = { idCliente: ID_CLIENTE, audio: GRAVADO, mensagemRespondidaId: id(1) };

  it("o app envia MP4/AAC (.m4a), um formato que a API aceita", () => {
    assert.deepEqual(arquivoDoAudio(GRAVADO), { uri: GRAVADO.uri, nome: NOME_ENVIO_AUDIO, tipo: TIPO_ENVIO_AUDIO });
    assert.equal(tipoAudioAceito(TIPO_ENVIO_AUDIO), "audio/mp4");
    assert.ok(fonte("./audio-nativo.ts").includes("opcoesDeGravacaoNativas(modulo.RecordingPresets.HIGH_QUALITY, Platform.OS, { numberOfChannels: 1, bitRate: TAXA_BITS_AUDIO_APP })"));
  });

  it("as opções vão ACHATADAS para o gravador nativo: sem isso o Android grava 3GPP/AMR-NB em vez de MP4/AAC", () => {
    const preset = { extension: ".m4a", sampleRate: 44100, numberOfChannels: 2, bitRate: 128000, android: { outputFormat: "mpeg4", audioEncoder: "aac" }, ios: { outputFormat: "aac ", audioQuality: 127 }, web: {} };
    const android = opcoesDeGravacaoNativas(preset, "android", { numberOfChannels: 1, bitRate: 64000 });
    assert.deepEqual(android, { extension: ".m4a", sampleRate: 44100, numberOfChannels: 1, bitRate: 64000, isMeteringEnabled: false, outputFormat: "mpeg4", audioEncoder: "aac" });
    assert.ok(!("android" in android) && !("ios" in android));
    const ios = opcoesDeGravacaoNativas(preset, "ios", { numberOfChannels: 1, bitRate: 64000 });
    assert.deepEqual([ios.outputFormat, ios.audioQuality, "audioEncoder" in ios], ["aac ", 127, false]);
  });

  it("campos na ordem do contrato e o arquivo POR ÚLTIMO; sem Content-Type manual; sessão e identidade", async () => {
    const { chamadas, enviar, partes } = servidor([{ status: 201, corpo: audio(9) }]);
    const resposta = await enviar(tentativa);
    assert.equal(resposta.ok && resposta.status, 201);
    assert.deepEqual(partes(0), [["idCliente", ID_CLIENTE], ["mensagemRespondidaId", id(1)], ["duracaoMs", "4200"], ["arquivo", { uri: GRAVADO.uri, name: "audio.m4a", type: "audio/mp4" }]]);
    assert.deepEqual(partes(0).map(([nome]) => nome), [...ORDEM_CAMPOS_ENVIO_AUDIO]);
    const cabecalhos = chamadas[0]!.init.headers as Record<string, string>;
    assert.ok(!Object.keys(cabecalhos).some((nome) => nome.toLowerCase() === "content-type"));
    assert.equal(cabecalhos[CABECALHO_IDENTIDADE_ATUANTE], "empresa-1");
    assert.ok(chamadas[0]!.url.endsWith(`/conversas/${CONVERSA}/mensagens/audio`));
  });

  it("retry: a MESMA tentativa reenvia idCliente, resposta, duração e arquivo; 200 idempotente é sucesso", async () => {
    const { enviar, partes } = servidor([{ status: 500, corpo: null }, { status: 200, corpo: audio(9) }]);
    const primeira = await enviar(tentativa);
    assert.equal(destinoDaTentativaDeAudio(primeira as never), "manter");
    const retry = await enviar(tentativa);
    assert.deepEqual(partes(0), partes(1));
    assert.equal(retry.ok && retry.dados.id, id(9));
  });

  it("sem rede: tentativa mantida, com Reenviar; recusa definitiva descarta", async () => {
    const resposta = await servidor("sem-rede").enviar(tentativa);
    assert.deepEqual([resposta.ok, resposta.status], [false, 0]);
    assert.ok(mensagemDeFalhaAudio(resposta as never).includes("Reenviar"));
    assert.equal(destinoDaTentativaDeAudio({ status: 400, codigo: "ARQUIVO_INVALIDO", mensagem: "" }), "descartar");
    assert.equal(destinoDaTentativaDeAudio({ status: 429, codigo: "LIMITE_DE_ENVIOS_ATINGIDO", mensagem: "" }), "manter");
  });

  it("a tela gera o idCliente UMA vez por áudio e o Reenviar repassa a mesma tentativa", () => {
    const tela = fonte("../components/tela-conversa.tsx");
    const envio = tela.slice(tela.indexOf("function enviarAudioPronto()"), tela.indexOf("async function salvarEdicao("));
    assert.equal(envio.match(/gerarIdCliente\(\)/g)?.length, 1);
    assert.ok(!envio.includes("enviarMensagem("), "uma mensagem de áudio, nunca texto + áudio");
    assert.ok(tela.includes("aoReenviar={() => void enviarAudio(audioPendente.tentativa, audioPendente.idsAntesDoEnvio)}"));
  });
});

describe("tempo real, URLs e exclusões", () => {
  it("mensagem:nova do próprio áudio antes da resposta HTTP: o balão pendente some (sem áudio duplo)", () => {
    const antes = new Set([id(1)]);
    assert.equal(tentativaDeAudioJaChegou({}, [audio(1)], antes, EU), false);
    assert.equal(tentativaDeAudioJaChegou({}, [audio(1), audio(2)], antes, EU), true);
    assert.equal(tentativaDeAudioJaChegou({}, [audio(2, { remetenteIdentidadeId: OUTRA })], antes, EU), false);
    const estado = receberMensagens(receberMensagens(conversaVazia, [audio(2)]), [audio(2)]);
    assert.equal(estado.mensagens.length, 1, "evento e resposta HTTP não duplicam");
  });

  it("URL só para áudio visível: apagado para mim some, tombstone também; não se mistura com imagem", () => {
    let estado = receberMensagens(conversaVazia, [audio(1), audio(2), audio(3, { tipo: "imagem", anexo: { id: id(503), tipo: "imagem", largura: 10, altura: 10 } })]);
    assert.deepEqual(idsDeAudiosVisiveis(estado.mensagens), [id(1), id(2)]);
    assert.deepEqual(idsDeImagensVisiveis(estado.mensagens), [id(3)]);
    estado = ocultarMensagem(estado, id(1));
    estado = receberAtualizacao(estado, audio(2, { anexo: null, excluidaEm: "2026-10-04T16:20:00.000Z" }));
    assert.deepEqual(idsDeAudiosVisiveis(estado.mensagens), []);
  });

  it("cache das URLs: só memória, reuso, renovação única e esquecimento", async () => {
    let pedidos = 0;
    const cache = criarCacheUrlsImagens({
      agora: () => Date.parse("2026-10-04T16:20:00.000Z"),
      buscar: async (ids) => ids.map((mensagemId) => ({ mensagemId, url: `https://privado.teste.invalid/${mensagemId}?v=${++pedidos}`, expiraEm: "2026-10-04T16:40:00.000Z" })),
    });
    await cache.garantir([id(1)]);
    await cache.garantir([id(1)]);
    assert.equal(pedidos, 1);
    await cache.aoFalharCarregamento(id(1));
    await cache.aoFalharCarregamento(id(1));
    assert.deepEqual([pedidos, cache.estado(id(1)).situacao], [2, "indisponivel"]);
    const hook = fonte("../hooks/use-urls-imagens.ts");
    assert.ok(hook.includes("pedirUrlsAudios(conversaId, mensagemIds)") && hook.includes("idsDeAudiosVisiveis"));
    for (const arquivo of ["../hooks/use-urls-privadas.ts", "../hooks/use-urls-imagens.ts", "../components/player-audio.tsx"]) {
      assert.ok(!/AsyncStorage|SecureStore|FileSystem/.test(semComentarios(fonte(arquivo))), arquivo);
    }
  });

  it("Socket.IO: nenhum evento novo; a tela usa as URLs dos áudios da mesma lista de mensagens", () => {
    const tela = fonte("../components/tela-conversa.tsx");
    assert.equal(tela.match(/socket\.on\(EVENTO_MENSAGEM_NOVA/g)?.length, 1);
    assert.ok(tela.includes("useUrlsAudios(conversa.id, mensagens)"));
  });
});

describe("player, menu, resposta e lista", () => {
  it("um áudio por vez; progresso pela duração do anexo; velocidades 1x → 1,5x → 2x", () => {
    const reprodutor = criarReprodutorUnico();
    const pausas: string[] = [];
    const a = () => pausas.push("a");
    reprodutor.assumir(a);
    reprodutor.assumir(() => pausas.push("b"));
    assert.deepEqual(pausas, ["a"]);
    assert.deepEqual([fracaoTocada(2.1, 4200), fracaoTocada(99, 4200), fracaoTocada(1, 0)], [0.5, 1, 0]);
    assert.deepEqual([proximaVelocidade(1), proximaVelocidade(1.5), proximaVelocidade(2)].map(rotuloVelocidade), ["1,5x", "2x", "1x"]);
  });

  it("player no balão: tocar/pausar, busca, tempo, velocidade, indisponível; sem tela cheia e sem onda inventada", () => {
    const player = fonte("../components/player-audio.tsx");
    for (const trecho of ['"Pausar áudio" : "Ouvir áudio"', '"Posição do áudio"', "trocarVelocidade", '"Áudio indisponível"', "avisos.current.aoFalhar?.()", 'leitura.tipo === "terminou"', "reprodutorUnico.assumir(", "reprodutor.current?.remove()"]) {
      assert.ok(player.includes(trecho), trecho);
    }
    assert.ok(!/Modal|Linking|Math\.random|waveform/i.test(semComentarios(player)));
    const balao = fonte("../components/balao-mensagem.tsx");
    assert.ok(balao.indexOf("Mensagem excluída") < balao.indexOf("<PlayerAudio"), "tombstone vem antes do player");
    assert.ok(balao.includes('const ehAudio = mensagem.tipo === "audio" && !excluida;'));
  });

  it("áudio: Responder sim, Editar não, apagar conforme a autoria", () => {
    assert.deepEqual(acoesDisponiveisDaMensagem(audio(1), EU), ["responder", "apagar-para-mim", "apagar-para-todos"]);
    assert.deepEqual(acoesDisponiveisDaMensagem(audio(1, { remetenteIdentidadeId: OUTRA }), EU), ["responder", "apagar-para-mim"]);
    assert.deepEqual(acoesDisponiveisDaMensagem(audio(1, { anexo: null, excluidaEm: "2026-10-04T16:20:00.000Z" }), EU), ["apagar-para-mim"]);
  });

  it("resposta e lista mostram \"Áudio\"; áudio em resposta leva mensagemRespondidaId", () => {
    assert.equal(conteudoParaPrevia(audio(1)), PREVIA_AUDIO);
    assert.deepEqual(camposDoEnvioDeAudio({ idCliente: ID_CLIENTE, audio: { duracaoMs: 61_499.6 } }), [["idCliente", ID_CLIENTE], ["duracaoMs", "61500"]]);
    assert.ok(fonte("../components/lista-conversas.tsx").includes("`${autor}${PREVIA_AUDIO}`"));
  });
});
