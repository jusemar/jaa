import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { destinoDoLink, segmentarMensagem, textoCopiavel } from "./links-mensagem.ts";

const links = (texto: string) => segmentarMensagem(texto).flatMap((trecho) => (trecho.tipo === "link" ? [trecho.url] : []));

describe("links nas mensagens", () => {
  it("texto comum continua sendo um único trecho de texto", () => {
    assert.deepEqual(segmentarMensagem("oi, tudo bem? pizza às 20h"), [{ tipo: "texto", texto: "oi, tudo bem? pizza às 20h" }]);
    assert.deepEqual(segmentarMensagem(""), []);
  });

  it("reconhece http e https e preserva o texto em volta, na ordem", () => {
    assert.deepEqual(segmentarMensagem("peça em https://jaa.com.br/@pizzaria e avise"), [
      { tipo: "texto", texto: "peça em " },
      { tipo: "link", texto: "https://jaa.com.br/@pizzaria", url: "https://jaa.com.br/@pizzaria" },
      { tipo: "texto", texto: " e avise" },
    ]);
    assert.deepEqual(links("a http://exemplo.com.br b https://x.org/c?d=1&e=2#f"), ["http://exemplo.com.br/", "https://x.org/c?d=1&e=2#f"]);
  });

  it("a pontuação da frase não entra no link; parênteses do próprio endereço entram", () => {
    assert.deepEqual(segmentarMensagem("veja https://jaa.com.br/@pizza."), [
      { tipo: "texto", texto: "veja " },
      { tipo: "link", texto: "https://jaa.com.br/@pizza", url: "https://jaa.com.br/@pizza" },
      { tipo: "texto", texto: "." },
    ]);
    assert.deepEqual(links("(https://jaa.com.br/a)"), ["https://jaa.com.br/a"]);
    assert.deepEqual(links("https://pt.wikipedia.org/wiki/Pizza_(prato)"), ["https://pt.wikipedia.org/wiki/Pizza_(prato)"]);
  });

  it("só http/https viram link: scripts, dados e marcação continuam texto", () => {
    for (const texto of ["javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "www.exemplo.com", "ftp://arquivo.exemplo", "<a href=\"https\">x</a>", "http://", "https://"]) {
      assert.deepEqual(links(texto), [], texto);
    }
    // Marcação colada no endereço não é levada junto.
    assert.deepEqual(segmentarMensagem('https://exemplo.com"><img src=x onerror=alert(1)>').at(0), { tipo: "link", texto: "https://exemplo.com", url: "https://exemplo.com/" });
  });

  it("URL longa é um trecho só (quem quebra a linha é o estilo do balão)", () => {
    const longa = `https://exemplo.com/${"a".repeat(600)}`;
    assert.deepEqual(segmentarMensagem(longa), [{ tipo: "link", texto: longa, url: longa }]);
  });

  it("várias linhas e vários links", () => {
    assert.deepEqual(links("um: https://a.com\ndois: https://b.com\n"), ["https://a.com/", "https://b.com/"]);
  });
});

describe("destino do link", () => {
  const SITE = "https://jaa.com.br";
  it("Link do Jaa deste site abre a conversa aqui mesmo", () => {
    assert.deepEqual(destinoDoLink("https://jaa.com.br/@Pizzaria_Oasis", SITE), { tipo: "conversa", nomeUsuario: "pizzaria_oasis" });
  });

  it("outro endereço deste site é interno; outro site é externo — inclusive imitando o Jaa", () => {
    assert.deepEqual(destinoDoLink("https://jaa.com.br/#perfil", SITE), { tipo: "interno" });
    assert.deepEqual(destinoDoLink("https://jaa.com.br/@a/b", SITE), { tipo: "interno" });
    for (const url of ["https://jaa.com.br.malicioso.example/@pizza", "https://malicioso.example/@pizza", "http://jaa.com.br/@pizza", "https://jaa.com.br@malicioso.example/@pizza"]) {
      assert.deepEqual(destinoDoLink(url, SITE), { tipo: "externo" }, url);
    }
    assert.deepEqual(destinoDoLink("https://jaa.com.br/@pizza", null), { tipo: "externo" });
  });
});

describe("copiar mensagem", () => {
  it("copia o texto como foi escrito (e a legenda da foto)", () => {
    assert.equal(textoCopiavel({ conteudo: "  oi\nhttps://jaa.com.br/@x ", excluidaEm: null }), "  oi\nhttps://jaa.com.br/@x ");
  });

  it("sem texto (áudio, foto sem legenda, card de pedido) ou excluída: nada a copiar", () => {
    assert.equal(textoCopiavel({ conteudo: "", excluidaEm: null }), null);
    assert.equal(textoCopiavel({ conteudo: "   ", excluidaEm: null }), null);
    assert.equal(textoCopiavel({ conteudo: "", excluidaEm: "2026-10-05T10:00:00.000Z" }), null);
  });
});
