import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { UrlImagem } from "@jaa/contratos";
import { MARGEM_EXPIRACAO_MS, criarCacheUrlsImagens } from "./urls-imagens.ts";

const INICIO = Date.parse("2026-10-03T12:00:00.000Z");
const VINTE_MIN = 20 * 60_000;
const id = (n: number) => `01a0a394-${String(n).padStart(4, "0")}-7000-8000-000000000000`;

/** Servidor falso: conta as chamadas e gera uma URL nova a cada pedido (como a assinatura real). */
function cenario(opcoes: { semAcesso?: string[] } = {}) {
  const estado = { agora: INICIO, chamadas: [] as string[][], falharProxima: false, geracao: 0 };
  const cache = criarCacheUrlsImagens({
    agora: () => estado.agora,
    buscar: async (ids) => {
      estado.chamadas.push(ids);
      if (estado.falharProxima) {
        estado.falharProxima = false;
        return null;
      }
      estado.geracao += 1;
      return ids
        .filter((mensagemId) => !opcoes.semAcesso?.includes(mensagemId))
        .map((mensagemId): UrlImagem => ({ mensagemId, url: `https://r2.teste.invalid/${mensagemId}?g=${estado.geracao}`, expiraEm: new Date(estado.agora + VINTE_MIN).toISOString() }));
    },
  });
  const urlDe = (mensagemId: string) => {
    const atual = cache.estado(mensagemId);
    return atual.situacao === "pronta" ? atual.url : atual.situacao;
  };
  return { estado, cache, urlDe };
}

describe("cache de URLs privadas (só memória)", () => {
  it("pede os ids em UM lote; antes da resposta a imagem está carregando", async () => {
    const { estado, cache, urlDe } = cenario();
    assert.equal(urlDe(id(1)), "carregando");
    await cache.garantir([id(1), id(2), id(3)]);
    assert.deepEqual(estado.chamadas, [[id(1), id(2), id(3)]]);
    assert.match(urlDe(id(2)), /g=1$/);
  });

  it("URL válida é reaproveitada; nova página do histórico pede só os ids que faltam", async () => {
    const { estado, cache } = cenario();
    await cache.garantir([id(3), id(4)]);
    await cache.garantir([id(3), id(4)]);
    await cache.garantir([id(1), id(2), id(3), id(4)]); // página anterior carregada
    await cache.garantir([id(1), id(2), id(3), id(4), id(5)]); // mensagem:nova
    assert.deepEqual(estado.chamadas, [[id(3), id(4)], [id(1), id(2)], [id(5)]]);
  });

  it("URL vencida (com margem de segurança) é pedida de novo", async () => {
    const { estado, cache, urlDe } = cenario();
    await cache.garantir([id(1)]);
    estado.agora += VINTE_MIN - MARGEM_EXPIRACAO_MS - 1000;
    await cache.garantir([id(1)]);
    assert.equal(estado.chamadas.length, 1, "ainda dentro da validade");
    estado.agora += 2000; // entrou na margem
    await cache.garantir([id(1)]);
    assert.equal(estado.chamadas.length, 2);
    assert.match(urlDe(id(1)), /g=2$/);
  });

  it("no máximo 100 ids por chamada", async () => {
    const { estado, cache } = cenario();
    await cache.garantir(Array.from({ length: 250 }, (_, n) => id(n)));
    assert.deepEqual(estado.chamadas.map((lote) => lote.length), [100, 100, 50]);
  });

  it("ids repetidos e pedidos simultâneos não repetem a chamada", async () => {
    const { estado, cache } = cenario();
    await Promise.all([cache.garantir([id(1), id(1), id(2)]), cache.garantir([id(1), id(2)])]);
    assert.deepEqual(estado.chamadas, [[id(1), id(2)]]);
  });

  it("id que a API não devolve (excluída, sem acesso) fica indisponível e não é pedido de novo", async () => {
    const { estado, cache, urlDe } = cenario({ semAcesso: [id(2)] });
    await cache.garantir([id(1), id(2)]);
    assert.equal(urlDe(id(2)), "indisponivel");
    await cache.garantir([id(1), id(2)]);
    assert.equal(estado.chamadas.length, 1);
  });

  it("falha passageira (rede) não marca nada: a imagem segue carregando e a próxima chamada tenta de novo", async () => {
    const { estado, cache, urlDe } = cenario();
    estado.falharProxima = true;
    await cache.garantir([id(1)]);
    assert.equal(urlDe(id(1)), "carregando");
    await cache.garantir([id(1)]);
    assert.match(urlDe(id(1)), /g=1$/);
  });

  it("imagem falhou ao carregar: renova UMA vez; se falhar de novo, indisponível (sem laço)", async () => {
    const { estado, cache, urlDe } = cenario();
    await cache.garantir([id(1)]);
    await cache.aoFalharCarregamento(id(1));
    assert.match(urlDe(id(1)), /g=2$/, "URL nova depois da primeira falha");
    await cache.aoFalharCarregamento(id(1));
    assert.equal(urlDe(id(1)), "indisponivel");
    await cache.aoFalharCarregamento(id(1));
    assert.equal(estado.chamadas.length, 2, "nenhuma chamada a mais");
  });

  it("depois de carregar com sucesso, uma falha futura (URL vencida) volta a poder renovar", async () => {
    const { cache, urlDe } = cenario();
    await cache.garantir([id(1)]);
    await cache.aoFalharCarregamento(id(1));
    cache.aoCarregar(id(1));
    await cache.aoFalharCarregamento(id(1));
    assert.match(urlDe(id(1)), /g=3$/);
  });

  it("renovar uma imagem que a API não entrega mais (excluída para todos) termina em indisponível", async () => {
    const cache = criarCacheUrlsImagens({ buscar: async () => [] });
    await cache.aoFalharCarregamento(id(1));
    assert.deepEqual(cache.estado(id(1)), { situacao: "indisponivel" });
  });

  it("esquecer tira a URL da memória (excluída para mim ou para todos) e avisa quem observa", async () => {
    const { cache, urlDe } = cenario();
    let avisos = 0;
    const cancelar = cache.assinar(() => {
      avisos += 1;
    });
    await cache.garantir([id(1)]);
    const versaoAntes = cache.versao();
    cache.esquecer(id(1));
    assert.equal(urlDe(id(1)), "carregando");
    assert.ok(cache.versao() > versaoAntes && avisos >= 2);
    cancelar();
  });

  it("nada é persistido: o módulo não usa localStorage, sessionStorage nem IndexedDB", () => {
    for (const arquivo of ["./urls-imagens.ts", "../hooks/use-urls-imagens.ts"]) {
      const fonte = readFileSync(new URL(arquivo, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      assert.ok(!/localStorage|sessionStorage|indexedDB|document\.cookie/i.test(fonte), arquivo);
    }
  });
});
