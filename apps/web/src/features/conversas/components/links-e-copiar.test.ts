import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Mensagem } from "@jaa/contratos";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BalaoMensagem } from "./balao-mensagem.tsx";

/*
 * Links clicáveis e "Copiar" no balão, pela marcação que a tela realmente gera.
 */
const EU = "eeeeeeee-0000-4000-8000-000000000000";
const OUTRA = "ffffffff-0000-4000-8000-000000000000";
const SITE = "https://jaa.com.br";

function mensagem(extra: Partial<Mensagem> = {}): Mensagem {
  return {
    id: "01a0a394-0001-7000-8000-000000000000",
    conversaId: "aaaaaaaa-0000-4000-8000-000000000000",
    remetenteIdentidadeId: OUTRA,
    tipo: "texto",
    conteudo: "oi",
    criadoEm: "2026-10-03T12:00:00.000Z",
    editadaEm: null,
    excluidaEm: null,
    estado: "enviada",
    mensagemRespondida: null,
    pedido: null,
    anexo: null,
    ...extra,
  } as Mensagem;
}

const balao = (alvo: Mensagem, extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(createElement(BalaoMensagem, { mensagem: alvo, identidadeAtualId: EU, nomeRemetente: "Ana", origemDoSite: SITE, ...extra }));
const acoes = (marcacao: string) => [...marcacao.matchAll(/data-acao-mensagem="([^"]+)"/g)].map((item) => item[1]);
const linksDe = (marcacao: string) => [...marcacao.matchAll(/<a [^>]*>/g)].map((item) => item[0]);

describe("links nas mensagens (marcação)", () => {
  it("texto comum não ganha link nenhum", () => {
    assert.deepEqual(linksDe(balao(mensagem({ conteudo: "pizza às 20h, pode ser?" }))), []);
  });

  it("link externo abre em nova aba, sem acesso a esta página nem referência", () => {
    const [link] = linksDe(balao(mensagem({ conteudo: "veja https://exemplo.com/cardapio agora" })));
    assert.ok(link);
    assert.ok(link.includes('href="https://exemplo.com/cardapio"'));
    assert.ok(link.includes('target="_blank"') && link.includes('rel="noopener noreferrer nofollow"'));
    assert.ok(link.includes('data-link-mensagem="externo"'));
  });

  it("Link do Jaaa deste site é reconhecido como conversa (abre aqui mesmo) e não vai para nova aba", () => {
    const [link] = linksDe(balao(mensagem({ conteudo: "peça em https://jaa.com.br/@pizzaria" })));
    assert.ok(link);
    assert.ok(link.includes('data-link-mensagem="conversa"') && link.includes('href="https://jaa.com.br/@pizzaria"'));
    assert.ok(!link.includes("target="));
  });

  it("a mensagem nunca vira HTML: marcação digitada aparece escapada, como texto", () => {
    const marcacao = balao(mensagem({ conteudo: '<img src=x onerror=alert(1)> https://exemplo.com"><script>alert(2)</script>' }));
    assert.ok(!marcacao.includes("<img src=x") && !marcacao.includes("<script>"));
    assert.ok(marcacao.includes("&lt;img src=x onerror=alert(1)&gt;"));
    assert.deepEqual(linksDe(marcacao).map((link) => /href="([^"]*)"/.exec(link)?.[1]), ["https://exemplo.com/"]);
    // O componente não usa a porta de HTML cru do React.
    assert.ok(!marcacao.includes("dangerously"));
  });

  it("URL longa quebra dentro do balão (o link e o texto carregam a regra de quebra)", () => {
    const marcacao = balao(mensagem({ conteudo: `https://exemplo.com/${"a".repeat(400)}` }));
    const [link] = linksDe(marcacao);
    assert.ok(link?.includes("[overflow-wrap:anywhere]"));
    assert.ok(/data-conteudo[^>]*class="[^"]*\[overflow-wrap:anywhere\]/.test(marcacao));
  });

  it("legenda de foto também tem links", () => {
    const foto = mensagem({ tipo: "imagem", conteudo: "olha https://exemplo.com", anexo: { id: "01a0a394-0002-7000-8000-000000000000", tipo: "imagem", largura: 800, altura: 600 } });
    assert.equal(linksDe(balao(foto)).length, 1);
  });
});

describe("ação Copiar", () => {
  const comCopiar = { menuAberto: true, aoCopiar: () => {}, aoResponder: () => {}, aoEditar: () => {}, aoExcluirParaMim: () => {}, aoExcluirParaTodos: () => {} };

  it("aparece em mensagem de texto, própria ou recebida, sem tirar as ações que já existiam", () => {
    assert.deepEqual(acoes(balao(mensagem(), comCopiar)), ["responder", "copiar", "apagar-para-mim"]);
    assert.deepEqual(acoes(balao(mensagem({ remetenteIdentidadeId: EU }), comCopiar)), ["responder", "copiar", "editar", "apagar-para-mim", "apagar-para-todos"]);
  });

  it("foto com legenda copia a legenda; foto sem legenda, áudio e mensagem excluída não têm o que copiar", () => {
    const anexoImagem = { id: "01a0a394-0002-7000-8000-000000000000", tipo: "imagem" as const, largura: 800, altura: 600 };
    assert.ok(acoes(balao(mensagem({ tipo: "imagem", conteudo: "legenda", anexo: anexoImagem }), comCopiar)).includes("copiar"));
    assert.ok(!acoes(balao(mensagem({ tipo: "imagem", conteudo: "", anexo: anexoImagem }), comCopiar)).includes("copiar"));
    assert.ok(!acoes(balao(mensagem({ tipo: "audio", conteudo: "", anexo: { id: "01a0a394-0003-7000-8000-000000000000", tipo: "audio", duracaoMs: 4000 } }), comCopiar)).includes("copiar"));
    assert.deepEqual(acoes(balao(mensagem({ conteudo: "", excluidaEm: "2026-10-03T12:05:00.000Z" }), comCopiar)), ["apagar-para-mim"]);
  });

  it("sem a ação ligada (telas que não copiam), o menu é o de antes", () => {
    assert.deepEqual(acoes(balao(mensagem(), { ...comCopiar, aoCopiar: undefined })), ["responder", "apagar-para-mim"]);
  });
});
