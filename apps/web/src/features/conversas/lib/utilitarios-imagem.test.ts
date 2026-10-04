import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ehTeclaDeFechar, travarRolagem } from "./trava-rolagem.ts";
import { criarUrlsLocais } from "./urls-locais.ts";

describe("prévias locais (object URLs)", () => {
  function apiFalsa() {
    const estado = { criadas: [] as string[], revogadas: [] as string[] };
    return {
      estado,
      api: {
        createObjectURL: () => {
          const url = `blob:teste/${estado.criadas.length + 1}`;
          estado.criadas.push(url);
          return url;
        },
        revokeObjectURL: (url: string) => void estado.revogadas.push(url),
      },
    };
  }
  const arquivo = new Blob(["x"], { type: "image/jpeg" });

  it("trocar, cancelar ou concluir revoga a URL; revogar duas vezes não repete", () => {
    const { estado, api } = apiFalsa();
    const urls = criarUrlsLocais(api);
    const primeira = urls.criar(arquivo);
    urls.revogar(primeira); // trocou de arquivo ou cancelou
    urls.revogar(primeira);
    urls.revogar(null);
    assert.deepEqual(estado.revogadas, [primeira]);
    assert.equal(urls.ativas(), 0);
  });

  it("sair da conversa revoga tudo o que ainda estava ativo; URL de fora não é tocada", () => {
    const { estado, api } = apiFalsa();
    const urls = criarUrlsLocais(api);
    const a = urls.criar(arquivo);
    const b = urls.criar(arquivo);
    urls.revogar("blob:de-outro-lugar");
    urls.revogarTodas();
    assert.deepEqual(estado.revogadas.sort(), [a, b].sort());
    assert.equal(urls.ativas(), 0);
  });
});

describe("lightbox: rolagem e teclado", () => {
  it("trava a rolagem do fundo e, ao fechar, RESTAURA o valor que havia antes", () => {
    const corpo = { style: { overflow: "auto" } };
    const destravar = travarRolagem(corpo);
    assert.equal(corpo.style.overflow, "hidden");
    destravar();
    assert.equal(corpo.style.overflow, "auto");

    const semValor = { style: { overflow: "" } };
    travarRolagem(semValor)();
    assert.equal(semValor.style.overflow, "");
  });

  it("só Esc fecha", () => {
    assert.equal(ehTeclaDeFechar("Escape"), true);
    for (const tecla of ["Enter", " ", "a", "Tab"]) assert.equal(ehTeclaDeFechar(tecla), false);
  });
});
