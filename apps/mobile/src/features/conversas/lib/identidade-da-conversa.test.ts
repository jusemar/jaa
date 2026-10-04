/// <reference types="node" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { IdentidadeVisivel, PerfilPublico } from "@jaa/contratos";
import { fotoDoAvatar } from "../../../components/ui/foto-avatar.ts";
import { rotaDaConversa } from "./abrir-conversa.ts";
import { identidadeDoCabecalho, previaDaRota } from "./identidade-da-conversa.ts";

/*
 * Cabeçalho da conversa: a lista mostra a foto → a conversa aberta mostra a MESMA foto, e a foto
 * definitiva vem da API (perfil público), nunca de uma URL guardada na rota.
 */

const FOTO_A = "https://pub-exemplo.r2.dev/logo-empresa/e1/a.webp";
const FOTO_B = "https://pub-exemplo.r2.dev/logo-empresa/e1/b.webp";

const pizzaria: IdentidadeVisivel = { identidadeId: "e1e1e1e1-0000-4000-8000-000000000001", tipo: "empresarial", nomeExibicao: "pizzaria isaque", nomeUsuario: "isaque", fotoUrl: FOTO_A };
const pessoa: IdentidadeVisivel = { identidadeId: "a1a1a1a1-0000-4000-8000-000000000001", tipo: "pessoal", nomeExibicao: "Ana Souza", nomeUsuario: "ana", fotoUrl: "https://pub-exemplo.r2.dev/avatar/a1/a.webp" };

const perfil = (identidade: IdentidadeVisivel, fotoUrl: string | null): PerfilPublico => ({
  identidadeId: identidade.identidadeId,
  tipo: identidade.tipo,
  nomeExibicao: identidade.nomeExibicao,
  nomeUsuario: identidade.nomeUsuario,
  fotoUrl,
  fraseStatus: null,
  cidade: null,
  sobre: null,
  status: null,
  ehContato: false,
});

/** Faz o caminho real: item da lista → rota → parâmetros que a tela da conversa lê. */
function abrirPelaLista(item: IdentidadeVisivel) {
  const rota = rotaDaConversa("c0c0c0c0-0000-4000-8000-000000000001", item);
  assert.ok(typeof rota === "object" && "params" in rota && rota.params);
  const params = rota.params as Record<string, string | undefined>;
  const base = { identidadeId: params.identidadeId as string, tipo: params.tipo as IdentidadeVisivel["tipo"], nomeExibicao: params.nomeExibicao as string, nomeUsuario: params.nomeUsuario as string };
  return { base, previa: previaDaRota(params.previaFotoUrl) };
}

describe("cabeçalho da conversa aberta pela lista", () => {
  for (const [rotulo, item] of [["empresa", pizzaria], ["pessoa", pessoa]] as const) {
    it(`${rotulo} com foto na lista: o cabeçalho mostra a MESMA foto já na primeira pintura`, () => {
      const { base, previa } = abrirPelaLista(item);
      const cabecalho = identidadeDoCabecalho(base, previa, null);
      assert.equal(fotoDoAvatar(cabecalho), item.fotoUrl);
      assert.equal(cabecalho.nomeExibicao, item.nomeExibicao);
    });

    it(`${rotulo}: quando a API responde, a foto dela prevalece`, () => {
      const { base, previa } = abrirPelaLista(item);
      assert.equal(identidadeDoCabecalho(base, previa, perfil(item, item.fotoUrl)).fotoUrl, item.fotoUrl);
    });
  }

  it("sem foto (fotoUrl null): nada de prévia na rota e o avatar mostra as iniciais", () => {
    const { base, previa } = abrirPelaLista({ ...pessoa, fotoUrl: null });
    assert.equal(previa, null);
    assert.equal(fotoDoAvatar(identidadeDoCabecalho(base, previa, null)), null);
    assert.equal(fotoDoAvatar(identidadeDoCabecalho(base, previa, perfil(pessoa, null))), null);
  });
});

describe("cabeçalho quando a rota só tem a identificação", () => {
  it("aberta por busca/notificação sem foto na rota: iniciais primeiro, foto real assim que a API carrega", () => {
    const base = { identidadeId: pizzaria.identidadeId, tipo: pizzaria.tipo, nomeExibicao: pizzaria.nomeExibicao, nomeUsuario: pizzaria.nomeUsuario };
    assert.equal(fotoDoAvatar(identidadeDoCabecalho(base, null, null)), null);
    assert.equal(fotoDoAvatar(identidadeDoCabecalho(base, null, perfil(pizzaria, FOTO_A))), FOTO_A);
  });
});

describe("foto alterada em outro cliente", () => {
  it("A → B: a nova leitura da API troca a foto do cabeçalho, mesmo com a prévia antiga A na rota", () => {
    const { base, previa } = abrirPelaLista(pizzaria);
    assert.equal(previa, FOTO_A);
    assert.equal(identidadeDoCabecalho(base, previa, perfil(pizzaria, FOTO_B)).fotoUrl, FOTO_B);
  });

  it("foto removida (ou escondida pela privacidade): a API diz null e a prévia antiga NÃO volta", () => {
    const { base, previa } = abrirPelaLista(pizzaria);
    assert.equal(identidadeDoCabecalho(base, previa, perfil(pizzaria, null)).fotoUrl, null);
  });

  it("resposta de OUTRA identidade nunca é usada no cabeçalho", () => {
    const { base, previa } = abrirPelaLista(pizzaria);
    assert.equal(identidadeDoCabecalho(base, previa, perfil(pessoa, "https://pub-exemplo.r2.dev/avatar/a1/x.webp")).fotoUrl, FOTO_A);
  });
});

describe("parâmetro de prévia", () => {
  it("vazio, ausente ou lista vazia = sem prévia", () => {
    assert.equal(previaDaRota(undefined), null);
    assert.equal(previaDaRota(""), null);
    assert.equal(previaDaRota([]), null);
    assert.equal(previaDaRota([FOTO_A]), FOTO_A);
  });
});
