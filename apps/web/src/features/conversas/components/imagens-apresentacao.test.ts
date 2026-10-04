import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PREVIA_IMAGEM, type ItemListaConversas, type Mensagem } from "@jaa/contratos";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { conteudoParaPrevia } from "../lib/imagem-conversa.ts";
import { resumirConteudoParaPrevia } from "../lib/respostas.ts";
import type { EstadoImagem } from "../lib/urls-imagens.ts";
import { BalaoImagemPendente } from "./balao-imagem-pendente.tsx";
import { BalaoMensagem } from "./balao-mensagem.tsx";
import { BotaoAnexarImagem, arquivoEscolhido } from "./botao-anexar-imagem.tsx";
import { LightboxImagem } from "./lightbox-imagem.tsx";
import { ListaConversas } from "./lista-conversas.tsx";
import { PreviaImagemCompositor } from "./previa-imagem-compositor.tsx";
import { PreviaRespostaCompositor } from "./previa-resposta-compositor.tsx";

/* Renderização real (sem navegador) da imagem na conversa: compositor, balão, lightbox, lista e resposta. */

const EU = "eeeeeeee-0000-4000-8000-000000000000";
const OUTRA = { identidadeId: "ffffffff-0000-4000-8000-000000000000", tipo: "pessoal" as const, nomeExibicao: "Mateus Filho", nomeUsuario: "mateus", fotoUrl: null };
const URL_ASSINADA = "https://conta.r2.cloudflarestorage.com/jaa-privado/imagem-conversa/c/a.webp?X-Amz-Signature=abc";
const html = (elemento: ReactElement) => renderToStaticMarkup(elemento);
const texto = (marcacao: string) => marcacao.replace(/<[^>]+>/g, "");
// Atributo `disabled` de verdade (as classes `disabled:…` do Tailwind também contêm a palavra).
const estaDesabilitado = (tag: string) => /\sdisabled=""/.test(tag);

function imagem(extra: Partial<Mensagem> = {}): Mensagem {
  return {
    id: "01a0a394-0001-7000-8000-000000000000",
    conversaId: "aaaaaaaa-0000-4000-8000-000000000000",
    remetenteIdentidadeId: OUTRA.identidadeId,
    tipo: "imagem",
    conteudo: "",
    criadoEm: "2026-10-03T12:00:00.000Z",
    estado: "enviada",
    mensagemRespondida: null,
    editadaEm: null,
    excluidaEm: null,
    pedido: null,
    anexo: { id: "01a0a394-0002-7000-8000-000000000000", tipo: "imagem", largura: 1600, altura: 1067 },
    ...extra,
  };
}

const balao = (mensagem: Mensagem, estadoImagem?: EstadoImagem, extras: Record<string, unknown> = {}) =>
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
      ...(estadoImagem ? { estadoImagem } : {}),
      ...extras,
    }),
  );

describe("botão de anexar", () => {
  it("clipe habilitado com seletor de arquivo oculto: uma imagem, só JPEG/PNG/WebP", () => {
    const marcacao = html(createElement(BotaoAnexarImagem, { aoEscolher: () => {} }));
    const entrada = marcacao.match(/<input[^>]*>/)?.[0] ?? "";
    assert.ok(entrada.includes('type="file"'));
    assert.ok(entrada.includes('accept="image/jpeg,image/png,image/webp"'));
    assert.ok(!entrada.includes("multiple"), "uma imagem por mensagem");
    const botao = marcacao.match(/<button[^>]*>/)?.[0] ?? "";
    assert.ok(botao.includes('type="button"') && !estaDesabilitado(botao), "não envia o formulário e está ativo");
    assert.ok(botao.includes('aria-label="Anexar foto"'));
    assert.ok(!/em breve/i.test(marcacao));
  });

  it("desabilitado quando não se pode anexar (bloqueio, edição ou foto pendente)", () => {
    const botao = html(createElement(BotaoAnexarImagem, { aoEscolher: () => {}, desabilitado: true })).match(/<button[^>]*>/)?.[0] ?? "";
    assert.ok(estaDesabilitado(botao));
  });

  it("cancelar o seletor (nenhum arquivo) não escolhe nada", () => {
    assert.equal(arquivoEscolhido(null), null);
    assert.equal(arquivoEscolhido([]), null);
    const arquivo = new File(["x"], "a.jpg", { type: "image/jpeg" });
    assert.equal(arquivoEscolhido([arquivo, new File(["y"], "b.jpg")]), arquivo, "só a primeira");
  });
});

describe("prévia no compositor", () => {
  it("mostra a imagem local, o nome do arquivo e o botão de remover", () => {
    const marcacao = html(createElement(PreviaImagemCompositor, { previaUrl: "blob:teste/1", nomeArquivo: "ferias.jpg", aoRemover: () => {} }));
    assert.ok(marcacao.includes('src="blob:teste/1"'));
    assert.ok(texto(marcacao).includes("ferias.jpg"));
    assert.ok(marcacao.includes('aria-label="Remover foto"'));
  });
});

describe("balão de imagem", () => {
  it("sem URL ainda: espaço reservado na proporção real, carregando, sem <img>", () => {
    const marcacao = balao(imagem());
    assert.ok(marcacao.includes('data-imagem-mensagem="carregando"'));
    assert.ok(marcacao.includes("aspect-ratio:320 / 213"), "proporção de 1600×1067 dentro do limite");
    assert.ok(marcacao.includes("width:320px"));
    assert.ok(!marcacao.includes("<img"));
  });

  it("com URL: renderiza a imagem no mesmo espaço, clicável para ampliar", () => {
    const marcacao = balao(imagem(), { situacao: "pronta", url: URL_ASSINADA });
    assert.ok(marcacao.includes('data-imagem-mensagem="pronta"'));
    assert.ok(marcacao.includes(`src="${URL_ASSINADA.replace(/&/g, "&amp;")}"`));
    assert.ok(marcacao.includes("aspect-ratio:320 / 213"));
    assert.ok(/<button[^>]*aria-label="Ampliar/.test(marcacao));
  });

  it("legenda abaixo da imagem; horário e estado continuam no rodapé", () => {
    const propria = balao(imagem({ remetenteIdentidadeId: EU, conteudo: "Olha a pizza!", estado: "lida" }), { situacao: "pronta", url: URL_ASSINADA });
    assert.ok(propria.includes("data-legenda") && texto(propria).includes("Olha a pizza!"));
    assert.ok(propria.indexOf("data-imagem-mensagem") < propria.indexOf("data-legenda"));
    assert.ok(propria.includes('data-estado="lida"') && propria.includes("<time"));
    assert.ok(!balao(imagem()).includes("data-legenda"), "sem legenda, nada além da imagem");
  });

  it("falha definitiva: imagem indisponível, sem URL nem detalhe técnico", () => {
    const marcacao = balao(imagem(), { situacao: "indisponivel" });
    assert.ok(marcacao.includes('data-imagem-mensagem="indisponivel"'));
    assert.ok(texto(marcacao).includes("Imagem indisponível"));
    assert.ok(!marcacao.includes("<img") && !/https?:|Signature|r2\./.test(marcacao));
  });

  it("excluída para todos (tombstone, anexo null): mensagem excluída, sem área de imagem", () => {
    const marcacao = balao(imagem({ anexo: null, excluidaEm: "2026-10-03T12:05:00.000Z" }), { situacao: "pronta", url: URL_ASSINADA });
    assert.ok(texto(marcacao).includes("Mensagem excluída"));
    assert.ok(!marcacao.includes("data-imagem-mensagem") && !marcacao.includes("<img"));
  });

  it("imagem pode ser respondida e excluída, mas não editada", () => {
    const propria = balao(imagem({ remetenteIdentidadeId: EU }), { situacao: "pronta", url: URL_ASSINADA });
    assert.ok(propria.includes('data-acao-mensagem="responder"'));
    assert.ok(propria.includes('data-acao-mensagem="apagar-para-todos"'));
    assert.ok(!propria.includes('data-acao-mensagem="editar"'));
  });
});

describe("foto em envio", () => {
  const pendente = (situacao: "enviando" | "falhou") =>
    html(createElement(BalaoImagemPendente, { previaUrl: "blob:teste/1", legenda: "Pizza", situacao, aoReenviar: () => {}, aoDescartar: () => {} }));

  it("aparece na hora com a prévia local e a legenda, marcada como enviando", () => {
    const marcacao = pendente("enviando");
    assert.ok(marcacao.includes('data-imagem-pendente="enviando"') && marcacao.includes('src="blob:teste/1"'));
    assert.ok(texto(marcacao).includes("Pizza") && texto(marcacao).includes("Enviando…"));
    assert.ok(!texto(marcacao).includes("Reenviar"));
  });

  it("falhou: a tentativa continua na conversa, com Reenviar e Descartar", () => {
    const marcacao = pendente("falhou");
    assert.ok(marcacao.includes('data-imagem-pendente="falhou"') && marcacao.includes('src="blob:teste/1"'));
    assert.ok(texto(marcacao).includes("Não enviada") && texto(marcacao).includes("Reenviar") && texto(marcacao).includes("Descartar"));
  });
});

describe("lightbox", () => {
  it("diálogo modal com a imagem e o botão de fechar", () => {
    const marcacao = html(createElement(LightboxImagem, { url: URL_ASSINADA, descricao: "Olha a pizza!", aoFechar: () => {} }));
    assert.ok(marcacao.includes('role="dialog"') && marcacao.includes('aria-modal="true"'));
    assert.ok(marcacao.includes('aria-label="Fechar imagem"'));
    assert.ok(marcacao.includes('alt="Olha a pizza!"'));
  });
});

describe("lista de conversas e resposta", () => {
  const lista = (ultimaMensagem: Mensagem) => {
    const item: ItemListaConversas = { id: ultimaMensagem.conversaId, tipo: "direta", outraIdentidade: OUTRA, ultimaMensagem, atividadeId: ultimaMensagem.id, naoLidas: 0, comunicacaoBloqueada: false };
    return html(createElement(ListaConversas, { identidadeId: EU, itens: [item], carregando: false, erro: null, temMais: false, carregandoMais: false, conversaAbertaId: null, aoAbrir: () => {}, aoCarregarMais: () => {} }));
  };

  it("última mensagem imagem aparece como \"Foto\", sem URL, arquivo ou miniatura", () => {
    const marcacao = lista(imagem({ conteudo: "legenda que não vai para a lista" }));
    assert.ok(marcacao.includes("data-previa-imagem") && texto(marcacao).includes(PREVIA_IMAGEM));
    assert.ok(!marcacao.includes("legenda que não vai") && !/webp|Signature|https?:/.test(marcacao));
  });

  it("responder a uma imagem: barra mostra \"Foto\" sem legenda, ou a legenda", () => {
    const barra = (mensagem: Mensagem) =>
      texto(html(createElement(PreviaRespostaCompositor, { resposta: { mensagemId: mensagem.id, nomeAutor: "Mateus Filho", ...resumirConteudoParaPrevia(conteudoParaPrevia(mensagem)) }, aoCancelar: () => {} })));
    assert.ok(barra(imagem()).includes(PREVIA_IMAGEM));
    assert.ok(barra(imagem({ conteudo: "Pizza de calabresa" })).includes("Pizza de calabresa"));
  });

  it("balão que responde a uma imagem mostra a prévia que veio da API (legenda ou Foto)", () => {
    const resposta: Mensagem = { ...imagem({ tipo: "texto", conteudo: "Que delícia", anexo: null }), mensagemRespondida: { id: "01a0a394-0009-7000-8000-000000000000", remetente: { identidadeId: EU, nomeExibicao: "Eu" }, tipo: "imagem", previaConteudo: PREVIA_IMAGEM, conteudoTruncado: false, excluida: false } };
    const marcacao = balao(resposta);
    assert.ok(marcacao.includes("data-referencia-resposta") && texto(marcacao).includes(PREVIA_IMAGEM));
  });
});
