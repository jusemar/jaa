import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { PREVIA_AUDIO, type ItemListaConversas, type Mensagem } from "@jaa/contratos";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { EstadoImagem } from "../lib/urls-imagens.ts";
import { BalaoAudioPendente } from "./balao-audio-pendente.tsx";
import { BalaoMensagem } from "./balao-mensagem.tsx";
import { AudioProntoParaEnviar, BotaoGravarAudio, GravandoAudio } from "./gravacao-audio-compositor.tsx";
import { ListaConversas } from "./lista-conversas.tsx";
import { PlayerAudio } from "./player-audio.tsx";

/* Renderização real (sem navegador) da mensagem de voz: compositor, player, balão, pendente e lista. */

const EU = "eeeeeeee-0000-4000-8000-000000000000";
const OUTRA = { identidadeId: "ffffffff-0000-4000-8000-000000000000", tipo: "pessoal" as const, nomeExibicao: "Mateus Filho", nomeUsuario: "mateus", fotoUrl: null };
const URL_ASSINADA = "https://conta.r2.cloudflarestorage.com/jaa-privado/audio-conversa/c/a.webm?X-Amz-Signature=abc";
const html = (elemento: ReactElement) => renderToStaticMarkup(elemento);
const texto = (marcacao: string) => marcacao.replace(/<[^>]+>/g, "");
const fonte = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), "utf8");
const desabilitado = (tag: string) => /\sdisabled=""/.test(tag);
const tag = (marcacao: string, trecho: string) => marcacao.match(new RegExp(`<[^>]*${trecho}[^>]*>`))?.[0] ?? "";

function audio(extra: Partial<Mensagem> = {}): Mensagem {
  return {
    id: "01a0a394-0001-7000-8000-000000000000",
    conversaId: "aaaaaaaa-0000-4000-8000-000000000000",
    remetenteIdentidadeId: OUTRA.identidadeId,
    tipo: "audio",
    conteudo: "",
    criadoEm: "2026-10-03T12:00:00.000Z",
    estado: "enviada",
    mensagemRespondida: null,
    editadaEm: null,
    excluidaEm: null,
    pedido: null,
    anexo: { id: "01a0a394-0002-7000-8000-000000000000", tipo: "audio", duracaoMs: 61_500 },
    ...extra,
  };
}

const balao = (mensagem: Mensagem, estadoAudio?: EstadoImagem) =>
  html(
    createElement(BalaoMensagem, {
      mensagem,
      identidadeAtualId: EU,
      nomeRemetente: OUTRA.nomeExibicao,
      aoResponder: () => {},
      aoEditar: () => {},
      aoExcluirParaMim: () => {},
      aoExcluirParaTodos: () => {},
      menuAberto: true,
      ...(estadoAudio ? { estadoAudio } : {}),
    }),
  );

describe("compositor de áudio", () => {
  it("microfone: botão que não envia o formulário", () => {
    const marcacao = html(createElement(BotaoGravarAudio, { aoGravar: () => {} }));
    assert.ok(marcacao.includes('type="button"') && marcacao.includes('aria-label="Gravar áudio"') && !desabilitado(marcacao));
    assert.ok(desabilitado(html(createElement(BotaoGravarAudio, { aoGravar: () => {}, desabilitado: true }))));
  });

  it("gravando: indicador, cronômetro mm:ss, Cancelar e Parar", () => {
    const marcacao = html(createElement(GravandoAudio, { decorridoMs: 65_300, aoCancelar: () => {}, aoParar: () => {} }));
    assert.ok(marcacao.includes('data-compositor-audio="gravando"'));
    assert.ok(texto(marcacao).includes("Gravando") && texto(marcacao).includes("1:05") && texto(marcacao).includes("Cancelar"));
    assert.ok(marcacao.includes('aria-label="Parar gravação"'));
    assert.ok(!marcacao.includes("Enviar"), "parar não envia: primeiro a pessoa ouve");
  });

  it("pronto: prévia tocável (URL local), Descartar e Enviar", () => {
    const marcacao = html(createElement(AudioProntoParaEnviar, { previaUrl: "blob:teste/1", duracaoMs: 12_000, aoDescartar: () => {}, aoEnviar: () => {} }));
    assert.ok(marcacao.includes('data-compositor-audio="pronto"') && marcacao.includes('src="blob:teste/1"'));
    assert.ok(marcacao.includes('aria-label="Descartar áudio"') && marcacao.includes('aria-label="Enviar áudio"'));
    assert.ok(texto(marcacao).includes("0:12"));
  });

  it("na conversa: um modo por vez, e o microfone ocupa o lugar do enviar", () => {
    const conversa = fonte("./conversa-tecnica.tsx");
    assert.ok(conversa.includes('hidden={modo === "gravando" || modo === "audio-pronto"}'), "gravando ou com áudio pronto, a pílula de texto some");
    assert.ok(conversa.includes("{microfoneNoLugarDoEnviar && <BotaoGravarAudio") && conversa.includes("hidden={microfoneNoLugarDoEnviar}"));
    assert.ok(conversa.includes("gravacao.cancelar();\n    gravacao.descartar();"), "editar descarta gravação e áudio pronto");
    const envio = conversa.slice(conversa.indexOf("function enviarAudioPronto()"), conversa.indexOf("function descartarAudioPendente()"));
    assert.equal(envio.match(/crypto\.randomUUID\(\)/g)?.length, 1, "um idCliente por áudio — Reenviar não gera outro");
    assert.ok(conversa.includes("aoReenviar={() => void enviarAudio(audioPendente.tentativa, audioPendente.idsAntesDoEnvio)}"));
  });
});

describe("player de áudio", () => {
  const player = (estado: EstadoImagem, duracaoMs = 61_500) => html(createElement(PlayerAudio, { estado, duracaoMs }));

  it("pronto: tocar, barra com busca, duração do anexo e velocidade — sem o player padrão do navegador", () => {
    const marcacao = player({ situacao: "pronta", url: URL_ASSINADA });
    assert.ok(marcacao.includes('data-player-audio="pronta"'));
    const elemento = marcacao.match(/<audio[^>]*>/)?.[0] ?? "";
    assert.ok(elemento.includes(`src="${URL_ASSINADA.replace(/&/g, "&amp;")}"`) && elemento.includes('preload="metadata"') && !elemento.includes("controls"));
    assert.ok(marcacao.includes('aria-label="Ouvir áudio"') && !desabilitado(tag(marcacao, 'aria-label="Ouvir áudio"')));
    assert.ok(marcacao.includes('type="range"') && marcacao.includes('aria-label="Posição do áudio"'));
    assert.ok(texto(marcacao).includes("1:01") && texto(marcacao).includes("1x"));
  });

  it("carregando: duração visível, controles ainda inativos e nenhum <audio>", () => {
    const marcacao = player({ situacao: "carregando" });
    assert.ok(marcacao.includes('data-player-audio="carregando"') && !marcacao.includes("<audio"));
    assert.ok(desabilitado(tag(marcacao, 'aria-label="Ouvir áudio"')) && texto(marcacao).includes("1:01"));
  });

  it("indisponível: aviso simples, sem URL nem detalhe técnico", () => {
    const marcacao = player({ situacao: "indisponivel" });
    assert.ok(texto(marcacao).includes("Áudio indisponível") && !marcacao.includes("<audio") && !/https?:|Signature|webm/.test(marcacao));
  });

  it("sem forma de onda inventada; renovação da URL e término tratados", () => {
    const codigo = fonte("./player-audio.tsx");
    assert.ok(!/Math\.random|waveform|barras/i.test(codigo.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")));
    assert.ok(codigo.includes("onError={aoFalhar}") && codigo.includes("onEnded=") && codigo.includes("reprodutorUnico.assumir("));
  });
});

describe("balão de áudio", () => {
  it("mostra o player (não texto), com horário e estado; responde e apaga, mas não edita", () => {
    const propria = balao(audio({ remetenteIdentidadeId: EU, estado: "lida" }), { situacao: "pronta", url: URL_ASSINADA });
    assert.ok(propria.includes("data-player-audio") && propria.includes("<time") && propria.includes('data-estado="lida"'));
    const acoes = [...propria.matchAll(/data-acao-mensagem="([^"]+)"/g)].map((item) => item[1]);
    assert.deepEqual(acoes, ["responder", "apagar-para-mim", "apagar-para-todos"]);
    assert.deepEqual([...balao(audio()).matchAll(/data-acao-mensagem="([^"]+)"/g)].map((item) => item[1]), ["responder", "apagar-para-mim"]);
  });

  it("apagado para todos (tombstone): mensagem excluída, sem player", () => {
    const marcacao = balao(audio({ anexo: null, excluidaEm: "2026-10-03T12:05:00.000Z" }), { situacao: "pronta", url: URL_ASSINADA });
    assert.ok(texto(marcacao).includes("Mensagem excluída") && !marcacao.includes("data-player-audio") && !marcacao.includes("<audio"));
  });

  it("balão que responde a um áudio mostra \"Áudio\" na referência, sem player", () => {
    const resposta: Mensagem = { ...audio({ tipo: "texto", conteudo: "ouvi!", anexo: null }), mensagemRespondida: { id: "01a0a394-0009-7000-8000-000000000000", remetente: { identidadeId: EU, nomeExibicao: "Eu" }, tipo: "audio", previaConteudo: PREVIA_AUDIO, conteudoTruncado: false, excluida: false } };
    const marcacao = balao(resposta);
    assert.ok(marcacao.includes("data-referencia-resposta") && texto(marcacao).includes(PREVIA_AUDIO) && !marcacao.includes("data-player-audio"));
  });
});

describe("áudio em envio", () => {
  const pendente = (situacao: "enviando" | "falhou") => html(createElement(BalaoAudioPendente, { previaUrl: "blob:teste/1", duracaoMs: 8000, situacao, aoReenviar: () => {}, aoDescartar: () => {} }));

  it("aparece na hora, tocável do arquivo local, marcado como enviando", () => {
    const marcacao = pendente("enviando");
    assert.ok(marcacao.includes('data-audio-pendente="enviando"') && marcacao.includes('src="blob:teste/1"') && texto(marcacao).includes("Enviando…"));
    assert.ok(!texto(marcacao).includes("Reenviar"));
  });

  it("falhou: continua na conversa com Reenviar e Descartar", () => {
    const marcacao = pendente("falhou");
    assert.ok(marcacao.includes('data-audio-pendente="falhou"'));
    for (const rotulo of ["Não enviado", "Reenviar", "Descartar"]) assert.ok(texto(marcacao).includes(rotulo), rotulo);
  });
});

describe("lista de conversas", () => {
  it("última mensagem áudio aparece como \"Áudio\", sem URL, duração ou arquivo", () => {
    const ultimaMensagem = audio();
    const item: ItemListaConversas = { id: ultimaMensagem.conversaId, tipo: "direta", outraIdentidade: OUTRA, ultimaMensagem, atividadeId: ultimaMensagem.id, naoLidas: 0, comunicacaoBloqueada: false };
    const marcacao = html(createElement(ListaConversas, { identidadeId: EU, itens: [item], carregando: false, erro: null, temMais: false, carregandoMais: false, conversaAbertaId: null, aoAbrir: () => {}, aoCarregarMais: () => {} }));
    assert.ok(marcacao.includes("data-previa-audio") && texto(marcacao).includes(PREVIA_AUDIO));
    assert.ok(!/webm|m4a|Signature|https?:|61500|1:01/.test(marcacao));
  });
});
